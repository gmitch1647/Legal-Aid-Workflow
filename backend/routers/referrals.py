"""
Referral Partners router — manage people/firms who refer cases.
"""

import html
import logging
import os
import re
import secrets
import string
import uuid
from email.utils import parseaddr
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from utils.supabase_client import SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_URL, get_supabase
from utils.referral_portal_access import get_referral_portal_access_level, get_referral_portal_partner, is_referral_portal_owner

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _require_owner(profile: dict):
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Only the LegalFlow owner can manage referral attorney workspaces")


def _workspace_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return slug[:70]


class ReferralPartnerCreate(BaseModel):
    full_name: str
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    referral_fee_type: str = "percentage"
    referral_fee_amount: float = 0
    notes: Optional[str] = ""


class ReferralAttorneyWorkspaceCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    company: Optional[str] = Field(default="", max_length=200)
    assigned_attorney_id: str
    submission_slug: Optional[str] = Field(default=None, max_length=80)


REFERRAL_ATTORNEY_FEATURES = {
    "dashboard": {"label": "Dashboard", "description": "Referral workspace home and submission link."},
    "pipeline": {"label": "Case Pipeline", "description": "View the private referral pipeline and its case statuses."},
    "clients": {"label": "Clients", "description": "View clients connected to this attorney's own referrals."},
    "documents": {"label": "Case Documents", "description": "Open and upload documents for this attorney's own referral cases."},
    "document_exchange": {"label": "Document Exchange", "description": "Exchange case documents and draft versions directly with the assigned attorney."},
}


def _case_title(client_name: str | None, defendant_names: list[str]) -> str:
    """Show referral cases as the client versus the adverse party, never the working attorney."""
    plaintiff = str(client_name or "Client").strip() or "Client"
    defendants = [str(item).strip() for item in defendant_names if str(item or "").strip()]
    return f"{plaintiff} v. {', '.join(defendants)}" if defendants else plaintiff


def _case_defendant_names(supabase, case_id: str) -> list[str]:
    """Resolve a case's defendants for the restricted referral workspace display."""
    try:
        links = supabase.table("case_defendants").select("defendant_id").eq("case_id", case_id).execute()
        names: list[str] = []
        for link in links.data or []:
            defendant_id = link.get("defendant_id")
            if not defendant_id:
                continue
            defendant = supabase.table("defendants").select("name").eq("id", defendant_id).limit(1).execute()
            name = ((defendant.data or [None])[0] or {}).get("name")
            if name:
                names.append(str(name))
        return names
    except Exception:
        logger.exception("Could not resolve defendants for referral case %s", case_id)
        return []


class ReferralAttorneyFeatureAccessUpdate(BaseModel):
    feature_access: dict[str, bool]


class ReferralPortalPasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not any(char.islower() for char in value) or not any(char.isupper() for char in value) or not any(char.isdigit() for char in value):
            raise ValueError("Use at least 12 characters with an uppercase letter, lowercase letter, and number.")
        return value


class ReferralPortalTeamInvite(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    access_level: Literal["member", "co_owner"] = "member"

    @field_validator("full_name")
    @classmethod
    def normalize_team_member_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Team member name is required.")
        return cleaned


class ReferralPartnerMessageCreate(BaseModel):
    channel: Literal["email", "sms"]
    subject: str = Field(default="", max_length=200)
    body: str = Field(min_length=1, max_length=10_000)

    @field_validator("subject", "body")
    @classmethod
    def strip_message_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned and value is not None:
            raise ValueError("Message fields cannot be blank")
        return cleaned


async def _get_referral_partner_or_404(partner_id: str) -> dict:
    supabase = get_supabase()
    response = supabase.table("referral_partners").select("*").eq("id", partner_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Referral partner not found")
    return response.data[0]


def _portal_partner_or_404(supabase, profile: dict) -> dict:
    """Resolve the caller's one active private referral workspace."""
    if profile.get("role") != "affiliate":
        raise HTTPException(status_code=403, detail="Referral portal access required")
    partner = get_referral_portal_partner(supabase, profile)
    if not partner:
        raise HTTPException(status_code=404, detail="Referral workspace not found")
    return partner


def _require_portal_owner(supabase, partner: dict, profile: dict) -> None:
    if not is_referral_portal_owner(supabase, partner, profile):
        raise HTTPException(status_code=403, detail="Only the referral attorney who owns this workspace can manage the team.")


def _generate_portal_password() -> str:
    return "".join(secrets.choice(string.ascii_letters + string.digits + "!@#$%&*") for _ in range(16))


async def _verify_current_portal_password(profile: dict, password: str) -> None:
    """Require the current password before an authenticated user changes it."""
    api_key = SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY
    email = str(profile.get("email") or "").strip()
    if not SUPABASE_URL or not api_key or not email:
        raise HTTPException(status_code=503, detail="Password changes are not configured. Please contact LegalFlow support.")
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{SUPABASE_URL.rstrip('/')}/auth/v1/token?grant_type=password",
                headers={"apikey": api_key, "Content-Type": "application/json"},
                json={"email": email, "password": password},
            )
    except Exception as exc:
        logger.exception("Could not verify referral portal password for %s", profile.get("id"))
        raise HTTPException(status_code=503, detail="Password verification is temporarily unavailable. Please try again.") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=403, detail="Your current password is incorrect.")


def _email_address(value: str | None) -> str:
    """Return a normalized address without trusting display-name formatting."""
    return parseaddr(str(value or ""))[1].strip().lower()


def _phone_number(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _conversation_key(channel: str, partner_id: str) -> str:
    return f"{channel}:{partner_id}"


def _partner_reply_address(partner_id: str) -> str | None:
    """Build a receiving-domain address that safely maps an email reply to a partner."""
    domain = str(os.environ.get("RESEND_RECEIVING_DOMAIN") or "").strip().lower()
    if not domain or "@" in domain or any(char.isspace() for char in domain):
        return None
    return f"partner+{partner_id}@{domain}"


def _partner_id_from_reply_addresses(addresses: list[str]) -> str | None:
    for address in addresses:
        local = _email_address(address).split("@", 1)[0]
        match = re.fullmatch(r"partner\+([0-9a-fA-F-]{36})", local)
        if match:
            return match.group(1)
    return None


def _safe_inbound_text(text: str | None, html_body: str | None = None) -> str:
    content = str(text or "").strip()
    if not content and html_body:
        content = re.sub(r"<[^>]+>", " ", str(html_body))
        content = html.unescape(re.sub(r"\s+", " ", content)).strip()
    return content[:10_000]


@router.post("/attorney-workspaces", status_code=status.HTTP_201_CREATED)
async def create_referral_attorney_workspace(
    body: ReferralAttorneyWorkspaceCreate,
    authorization: str = Header(default=None),
):
    """Create a restricted referral-attorney account and its isolated pipeline."""
    profile = await _get_current_user(authorization)
    _require_owner(profile)
    supabase = get_supabase()

    attorney_response = (
        supabase.table("profiles")
        .select("id,full_name,role")
        .eq("id", body.assigned_attorney_id)
        .limit(1)
        .execute()
    )
    assigned_attorney = (attorney_response.data or [None])[0]
    if not assigned_attorney or assigned_attorney.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=422, detail="Choose an active LegalFlow attorney to work this referral pipeline.")

    existing = (
        supabase.table("referral_partners")
        .select("id")
        .eq("email", str(body.email).lower())
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="A referral partner with this email already exists.")

    base_slug = _workspace_slug(body.submission_slug or f"{body.full_name}-referrals")
    if not base_slug:
        raise HTTPException(status_code=422, detail="A referral submission link is required.")
    slug_exists = supabase.table("referral_partners").select("id").eq("submission_slug", base_slug).limit(1).execute()
    if slug_exists.data:
        raise HTTPException(status_code=409, detail="That referral submission link is already in use.")

    pipeline_slug = _workspace_slug(f"{base_slug}-pipeline")
    existing_pipeline = supabase.table("pipelines").select("id,name,slug").eq("slug", pipeline_slug).limit(1).execute()
    pipeline_created = False
    if existing_pipeline.data:
        # A prior failed invitation may have created the isolated pipeline before its
        # Auth user or referral-partner record was created. It is safe to reuse only
        # while no referral partner claims the pipeline.
        pipeline_record = existing_pipeline.data[0]
        pipeline_in_use = supabase.table("referral_partners").select("id").eq("pipeline_id", pipeline_record["id"]).limit(1).execute()
        if pipeline_in_use.data:
            raise HTTPException(status_code=409, detail="A referral pipeline with this name is already assigned to another referral attorney.")
    else:
        pipeline = supabase.table("pipelines").insert({
            "name": f"{body.full_name} Referrals",
            "slug": pipeline_slug,
            "description": f"Private referral pipeline submitted by {body.full_name} and worked by {assigned_attorney.get('full_name') or 'the assigned attorney'}.",
            "color": "indigo",
            "is_default": False,
            "position": 999,
        }).execute()
        if not pipeline.data:
            raise HTTPException(status_code=500, detail="Could not create the referral pipeline.")
        pipeline_record = pipeline.data[0]
        pipeline_created = True

    pipeline_id = pipeline_record["id"]
    if pipeline_created:
        stage_definitions = [
            ("Submitted by Ethan", "submitted", "slate"),
            ("Esther Review", "esther-review", "blue"),
            ("Documents Requested", "documents-requested", "amber"),
            ("Investigating", "investigating", "purple"),
            ("Accepted", "accepted", "emerald"),
            ("Declined", "declined", "red"),
            ("Engagement Sent", "engagement-sent", "cyan"),
            ("Active Case", "active-case", "indigo"),
            ("Settlement / Closed", "settlement-closed", "green"),
        ]
        for position, (name, suffix, color) in enumerate(stage_definitions):
            supabase.table("pipeline_stages").insert({
                "name": name,
                "slug": f"{base_slug}-{suffix}",
                "position": position,
                "color": color,
                "description": f"{body.full_name} referral workflow stage",
                "pipeline_id": pipeline_id,
                "is_system": False,
            }).execute()

    temp_password = "".join(secrets.choice(string.ascii_letters + string.digits + "!@#$%&*") for _ in range(16))
    try:
        auth_response = supabase.auth.admin.create_user({
            "email": str(body.email),
            "password": temp_password,
            "email_confirm": True,
            "user_metadata": {"full_name": body.full_name},
        })
        portal_user_id = str(auth_response.user.id)
    except Exception as exc:
        if pipeline_created:
            try:
                supabase.table("pipeline_stages").delete().eq("pipeline_id", pipeline_id).execute()
                supabase.table("pipelines").delete().eq("id", pipeline_id).execute()
            except Exception:
                logger.warning("Could not roll back referral pipeline %s", pipeline_id)
        raise HTTPException(status_code=400, detail=f"Could not create the referral attorney login: {exc}")

    try:
        supabase.table("profiles").insert({
            "id": portal_user_id,
            "email": str(body.email),
            "full_name": body.full_name,
            "phone": body.phone or "",
            "firm_name": body.company or "",
            "role": "affiliate",
        }).execute()
        partner = supabase.table("referral_partners").insert({
            "full_name": body.full_name,
            "company": body.company or "",
            "email": str(body.email),
            "phone": body.phone or "",
            "referral_fee_type": "percentage",
            "referral_fee_amount": 0,
            "created_by": profile["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "portal_user_id": portal_user_id,
            "portal_active": True,
            "assigned_attorney_id": body.assigned_attorney_id,
            "pipeline_id": pipeline_id,
            "submission_slug": base_slug,
        }).execute()
        if not partner.data:
            raise RuntimeError("Referral partner insert returned no record.")
    except Exception as exc:
        try:
            supabase.table("profiles").delete().eq("id", portal_user_id).execute()
            supabase.auth.admin.delete_user(portal_user_id)
        except Exception:
            logger.warning("Could not roll back referral portal user %s", portal_user_id)
        if pipeline_created:
            try:
                supabase.table("pipeline_stages").delete().eq("pipeline_id", pipeline_id).execute()
                supabase.table("pipelines").delete().eq("id", pipeline_id).execute()
            except Exception:
                logger.warning("Could not roll back referral pipeline %s", pipeline_id)
        raise HTTPException(status_code=500, detail=f"Could not create the referral attorney workspace: {exc}")

    frontend_url = str(os.environ.get("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
    referral_url = f"{frontend_url}/case-referral/{base_slug}"
    portal_url = f"{frontend_url}/login"
    email_sent = False
    try:
        from utils.email_service import send_email
        email_sent = await send_email(
            to=str(body.email),
            subject="Your LegalFlow referral workspace is ready",
            body=(
                "<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;'>"
                f"<h2>Welcome to LegalFlow, {html.escape(body.full_name)}.</h2>"
                "<p>Your restricted referral workspace is ready. You can submit and track only your referral cases.</p>"
                f"<p><strong>Login:</strong> <a href='{portal_url}'>{portal_url}</a></p>"
                f"<p><strong>Email:</strong> {html.escape(str(body.email))}</p>"
                f"<p><strong>Temporary Password:</strong> {html.escape(temp_password)}</p>"
                f"<p><strong>Private referral form:</strong> <a href='{referral_url}'>{referral_url}</a></p>"
                "<p>Please change your password after your first login.</p></div>"
            ),
            idempotency_key=f"referral-attorney-workspace:{portal_user_id}",
        )
    except Exception:
        logger.exception("Could not send referral attorney invitation for %s", body.email)

    return {
        "partner": partner.data[0],
        "pipeline": pipeline_record,
        "assigned_attorney": {"id": assigned_attorney["id"], "full_name": assigned_attorney.get("full_name")},
        "referral_url": referral_url,
        "portal_url": portal_url,
        "email_sent": email_sent,
        "message": "Referral attorney workspace created. The invitation contains the temporary password and private referral form link.",
    }


@router.get("/attorney-workspaces/{partner_id}/features")
async def get_referral_attorney_feature_access(partner_id: str, authorization: str = Header(default=None)):
    """Return owner-managed feature visibility for one referral attorney workspace."""
    profile = await _get_current_user(authorization)
    _require_owner(profile)
    partner = await _get_referral_partner_or_404(partner_id)
    if not partner.get("portal_user_id"):
        raise HTTPException(status_code=422, detail="This referral partner does not have a portal workspace.")
    stored = partner.get("feature_access") or {}
    return {
        "partner_id": partner_id,
        "features": [
            {"key": key, **meta, "enabled": bool(stored.get(key, True))}
            for key, meta in REFERRAL_ATTORNEY_FEATURES.items()
        ],
    }


@router.put("/attorney-workspaces/{partner_id}/features")
async def update_referral_attorney_feature_access(
    partner_id: str,
    body: ReferralAttorneyFeatureAccessUpdate,
    authorization: str = Header(default=None),
):
    """Allow the LegalFlow owner to enable or disable portal features for one referral attorney."""
    profile = await _get_current_user(authorization)
    _require_owner(profile)
    partner = await _get_referral_partner_or_404(partner_id)
    if not partner.get("portal_user_id"):
        raise HTTPException(status_code=422, detail="This referral partner does not have a portal workspace.")
    unknown = set(body.feature_access) - set(REFERRAL_ATTORNEY_FEATURES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown referral workspace feature: {sorted(unknown)[0]}")
    current = partner.get("feature_access") or {}
    updated = {**current, **{key: bool(value) for key, value in body.feature_access.items()}}
    response = get_supabase().table("referral_partners").update({"feature_access": updated}).eq("id", partner_id).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Could not update referral attorney feature access.")
    return {
        "partner_id": partner_id,
        "features": [
            {"key": key, **meta, "enabled": bool(updated.get(key, True))}
            for key, meta in REFERRAL_ATTORNEY_FEATURES.items()
        ],
    }


@router.post("/attorney-workspaces/{partner_id}/co-owners", status_code=status.HTTP_201_CREATED)
async def invite_referral_portal_co_owner(
    partner_id: str,
    body: ReferralPortalTeamInvite,
    authorization: str = Header(default=None),
):
    """Let the LegalFlow owner add a co-owner to one existing referral portal."""
    profile = await _get_current_user(authorization)
    _require_owner(profile)
    supabase = get_supabase()
    partner = await _get_referral_partner_or_404(partner_id)
    if not partner.get("portal_user_id") or not partner.get("portal_active"):
        raise HTTPException(status_code=422, detail="This referral partner does not have an active portal workspace.")

    email = str(body.email).strip().lower()
    existing_profile = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
    if existing_profile.data:
        raise HTTPException(status_code=409, detail="A LegalFlow account already uses this email. Choose a different email or contact LegalFlow support.")

    temp_password = _generate_portal_password()
    portal_user_id = None
    member_id = str(uuid.uuid4())
    try:
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": temp_password,
            "email_confirm": True,
            "user_metadata": {"full_name": body.full_name},
        })
        portal_user_id = str(auth_response.user.id)
        supabase.table("profiles").insert({
            "id": portal_user_id,
            "email": email,
            "full_name": body.full_name,
            "role": "affiliate",
        }).execute()
        membership_response = supabase.table("referral_portal_team_members").insert({
            "id": member_id,
            "referral_partner_id": partner["id"],
            "profile_id": portal_user_id,
            "invited_by": profile["id"],
            "status": "active",
            "access_level": "co_owner",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        member = (membership_response.data or [{}])[0]
    except Exception as exc:
        if portal_user_id:
            try:
                supabase.table("profiles").delete().eq("id", portal_user_id).execute()
                supabase.auth.admin.delete_user(portal_user_id)
            except Exception:
                logger.warning("Could not roll back referral co-owner account %s", portal_user_id)
        logger.exception("Could not create referral portal co-owner for partner %s", partner.get("id"))
        raise HTTPException(status_code=500, detail="Could not add the portal co-owner. Please try again.") from exc

    email_sent = False
    try:
        email_sent = await _send_referral_portal_team_invitation(
            recipient_email=email,
            recipient_name=body.full_name,
            temp_password=temp_password,
            partner_name=str(partner.get("full_name") or "your referral attorney"),
            member_id=member_id,
            access_level="co_owner",
        )
    except Exception:
        logger.exception("Could not send referral co-owner invitation to %s", email)
    return {
        "member": {**member, "full_name": body.full_name, "email": email},
        "email_sent": email_sent,
        "message": "Portal co-owner added." if email_sent else "Portal co-owner added, but the invitation email could not be delivered. Use the portal team controls to resend credentials.",
    }


@router.put("/portal/password")
async def update_referral_portal_password(
    body: ReferralPortalPasswordUpdate,
    authorization: str = Header(default=None),
):
    """Let an authenticated referral-portal user change only their own password."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    _portal_partner_or_404(supabase, profile)
    if body.current_password == body.new_password:
        raise HTTPException(status_code=422, detail="Choose a new password that is different from your current password.")
    await _verify_current_portal_password(profile, body.current_password)
    try:
        supabase.auth.admin.update_user_by_id(profile["id"], {"password": body.new_password})
    except Exception as exc:
        logger.exception("Could not update referral portal password for %s", profile.get("id"))
        raise HTTPException(status_code=500, detail="Could not update your password. Please try again.") from exc
    return {"updated": True, "message": "Your password was updated."}


@router.get("/portal/team")
async def list_referral_portal_team(authorization: str = Header(default=None)):
    """Return the referral attorney's active and revoked team accounts."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    partner = _portal_partner_or_404(supabase, profile)
    _require_portal_owner(supabase, partner, profile)
    response = (
        supabase.table("referral_portal_team_members")
        .select("id,profile_id,status,access_level,created_at,revoked_at")
        .eq("referral_partner_id", partner["id"])
        .order("created_at", desc=True)
        .execute()
    )
    members = response.data or []
    for member in members:
        member_profile = (
            supabase.table("profiles")
            .select("id,full_name,email")
            .eq("id", member["profile_id"])
            .limit(1)
            .execute()
        )
        details = (member_profile.data or [None])[0] or {}
        member["full_name"] = details.get("full_name") or "Team member"
        member["email"] = details.get("email") or ""
    return {"can_manage_team": True, "members": members}


async def _send_referral_portal_team_invitation(
    *,
    recipient_email: str,
    recipient_name: str,
    temp_password: str,
    partner_name: str,
    member_id: str,
    access_level: str = "member",
) -> bool:
    """Email credentials for an isolated referral-team account."""
    from utils.email_service import send_email

    frontend_url = str(os.environ.get("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
    access_note = (
        "<p>You have been added as a co-owner. You can manage this portal's team and settings, as well as its attributed clients, cases, and documents. You cannot access LegalFlow firm cases or another referral workspace.</p>"
        if access_level == "co_owner" else
        "<p>You can access only this referral workspace, its attributed clients, and its case documents. You cannot access LegalFlow firm cases or any other referral workspace.</p>"
    )
    return await send_email(
        to=recipient_email,
        subject=f"You have been added to {partner_name}'s LegalFlow referral portal",
        body=(
            "<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;'>"
            + f"<h2>Welcome to {html.escape(partner_name)}'s LegalFlow referral portal.</h2>"
            + access_note
            + f"<p><strong>Login:</strong> <a href='{frontend_url}/login'>{frontend_url}/login</a></p>"
            + f"<p><strong>Email:</strong> {html.escape(recipient_email)}</p>"
            + f"<p><strong>Temporary Password:</strong> {html.escape(temp_password)}</p>"
            + "<p>Please sign in and change your password from Settings immediately.</p>"
            + "</div>"
        ),
        idempotency_key=f"referral-portal-team-invite:{member_id}:{uuid.uuid4()}",
    )


@router.post("/portal/team", status_code=status.HTTP_201_CREATED)
async def invite_referral_portal_team_member(
    body: ReferralPortalTeamInvite,
    authorization: str = Header(default=None),
):
    """Allow only the referral attorney to invite a team member into this one workspace."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    partner = _portal_partner_or_404(supabase, profile)
    _require_portal_owner(supabase, partner, profile)
    email = str(body.email).strip().lower()

    existing_profile = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
    if existing_profile.data:
        raise HTTPException(status_code=409, detail="A LegalFlow account already uses this email. Choose a different email or contact LegalFlow support.")

    temp_password = _generate_portal_password()
    portal_user_id = None
    member_id = str(uuid.uuid4())
    try:
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": temp_password,
            "email_confirm": True,
            "user_metadata": {"full_name": body.full_name},
        })
        portal_user_id = str(auth_response.user.id)
        supabase.table("profiles").insert({
            "id": portal_user_id,
            "email": email,
            "full_name": body.full_name,
            "role": "affiliate",
        }).execute()
        membership_response = supabase.table("referral_portal_team_members").insert({
            "id": member_id,
            "referral_partner_id": partner["id"],
            "profile_id": portal_user_id,
            "invited_by": profile["id"],
            "status": "active",
            "access_level": body.access_level,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        member = (membership_response.data or [{}])[0]
    except Exception as exc:
        if portal_user_id:
            try:
                supabase.table("profiles").delete().eq("id", portal_user_id).execute()
                supabase.auth.admin.delete_user(portal_user_id)
            except Exception:
                logger.warning("Could not roll back referral team account %s", portal_user_id)
        logger.exception("Could not create referral portal team member for partner %s", partner.get("id"))
        raise HTTPException(status_code=500, detail="Could not add the team member. Please try again.") from exc

    email_sent = False
    try:
        email_sent = await _send_referral_portal_team_invitation(
            recipient_email=email,
            recipient_name=body.full_name,
            temp_password=temp_password,
            partner_name=str(partner.get("full_name") or "your referral attorney"),
            member_id=member_id,
            access_level=body.access_level,
        )
    except Exception:
        logger.exception("Could not send referral team invitation to %s", email)
    return {
        "member": {**member, "full_name": body.full_name, "email": email},
        "email_sent": email_sent,
        "message": ("Co-owner added to this private referral workspace." if body.access_level == "co_owner" else "Team member added to this private referral workspace.")
        if email_sent else "Account added, but the invitation email could not be delivered. Use Resend Invitation to send fresh credentials.",
    }


@router.post("/portal/team/{member_id}/resend-invitation")
async def resend_referral_portal_team_invitation(member_id: str, authorization: str = Header(default=None)):
    """Reset and email fresh credentials for one active referral team member."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    partner = _portal_partner_or_404(supabase, profile)
    _require_portal_owner(supabase, partner, profile)
    membership_response = (
        supabase.table("referral_portal_team_members")
        .select("id,profile_id,status,access_level")
        .eq("id", member_id)
        .eq("referral_partner_id", partner["id"])
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    member = (membership_response.data or [None])[0]
    if not member:
        raise HTTPException(status_code=404, detail="Active team member not found.")
    member_profile_response = supabase.table("profiles").select("full_name,email").eq("id", member["profile_id"]).limit(1).execute()
    member_profile = (member_profile_response.data or [None])[0]
    if not member_profile or not member_profile.get("email"):
        raise HTTPException(status_code=409, detail="This team member does not have a valid email address.")
    temp_password = _generate_portal_password()
    try:
        supabase.auth.admin.update_user_by_id(member["profile_id"], {"password": temp_password})
        email_sent = await _send_referral_portal_team_invitation(
            recipient_email=str(member_profile["email"]),
            recipient_name=str(member_profile.get("full_name") or "Team member"),
            temp_password=temp_password,
            partner_name=str(partner.get("full_name") or "your referral attorney"),
            member_id=member_id,
            access_level=str(member.get("access_level") or "member"),
        )
    except Exception as exc:
        logger.exception("Could not resend referral team invitation %s", member_id)
        raise HTTPException(status_code=500, detail="Could not resend the invitation. Please try again.") from exc
    if not email_sent:
        raise HTTPException(status_code=502, detail="Credentials were reset, but the invitation email could not be delivered. Please try again shortly.")
    return {"sent": True, "message": "A fresh invitation and temporary password were emailed."}


@router.delete("/portal/team/{member_id}")
async def revoke_referral_portal_team_member(member_id: str, authorization: str = Header(default=None)):
    """Immediately revoke one team account's server-side access to this portal."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    partner = _portal_partner_or_404(supabase, profile)
    _require_portal_owner(supabase, partner, profile)
    response = (
        supabase.table("referral_portal_team_members")
        .update({
            "status": "revoked",
            "revoked_at": datetime.now(timezone.utc).isoformat(),
            "revoked_by": profile["id"],
        })
        .eq("id", member_id)
        .eq("referral_partner_id", partner["id"])
        .eq("status", "active")
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Active team member not found.")
    return {"revoked": True, "message": "The team member can no longer access this referral workspace."}


@router.get("/portal/features")
async def get_portal_feature_access(authorization: str = Header(default=None)):
    """Return enabled feature visibility for a referral attorney or active teammate."""
    profile = await _get_current_user(authorization)
    partner = _portal_partner_or_404(get_supabase(), profile)
    stored = partner.get("feature_access") or {}
    return {key: bool(stored.get(key, True)) for key in REFERRAL_ATTORNEY_FEATURES}


@router.get("/portal/workspace")
async def get_referral_attorney_workspace(authorization: str = Header(default=None)):
    """Return the minimal, partner-owned referral dashboard for an affiliate portal user."""
    profile = await _get_current_user(authorization)
    if profile.get("role") != "affiliate":
        raise HTTPException(status_code=403, detail="Referral portal access required")

    supabase = get_supabase()
    partner = _portal_partner_or_404(supabase, profile)

    case_response = (
        supabase.table("cases")
        .select("id,status,created_at,updated_at,client_id")
        .eq("referral_partner_id", partner["id"])
        .eq("pipeline_id", partner["pipeline_id"])
        .order("created_at", desc=True)
        .limit(250)
        .execute()
    )
    cases = case_response.data or []
    for case in cases:
        client_response = supabase.table("profiles").select("full_name").eq("id", case["client_id"]).limit(1).execute()
        client = (client_response.data or [None])[0]
        client_name = (client or {}).get("full_name") or "Client"
        defendant_names = _case_defendant_names(supabase, case["id"])
        case["client_name"] = client_name
        case["defendant_names"] = defendant_names
        case["case_title"] = _case_title(client_name, defendant_names)
        case.pop("client_id", None)

    stage_response = (
        supabase.table("pipeline_stages")
        .select("id,name,slug,color,position")
        .eq("pipeline_id", partner.get("pipeline_id"))
        .order("position")
        .execute()
        if partner.get("pipeline_id") else None
    )
    stages = stage_response.data if stage_response else []
    frontend_url = str(os.environ.get("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
    return {
        "partner_name": partner.get("full_name"),
        "referral_url": f"{frontend_url}/case-referral/{partner.get('submission_slug')}",
        "pipeline_id": partner.get("pipeline_id"),
        "can_manage_team": is_referral_portal_owner(supabase, partner, profile),
        "portal_access_level": get_referral_portal_access_level(supabase, partner, profile),
        "stages": stages or [],
        "cases": cases,
    }


@router.get("")
async def list_referral_partners(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("referral_partners").select("*").order("full_name").execute()

    # Enrich with client/case counts
    partners = resp.data or []
    for p in partners:
        try:
            clients = supabase.table("profiles").select("id", count="exact").eq("referral_partner_id", p["id"]).execute()
            cases = supabase.table("cases").select("id", count="exact").eq("referral_partner_id", p["id"]).execute()
            p["client_count"] = clients.count or len(clients.data or [])
            p["case_count"] = cases.count or len(cases.data or [])
        except Exception:
            p["client_count"] = 0
            p["case_count"] = 0

    return partners


@router.get("/{partner_id}")
async def get_referral_partner(partner_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("referral_partners").select("*").eq("id", partner_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Referral partner not found")

    partner = resp.data[0]

    # Get their referred clients and cases
    clients = supabase.table("profiles").select("id, full_name, email, created_at").eq("referral_partner_id", partner_id).order("full_name").execute()
    cases = supabase.table("cases").select("id, plaintiff_name, case_number, status, case_facts, created_at").eq("referral_partner_id", partner_id).order("created_at", desc=True).execute()

    partner["clients"] = clients.data or []
    partner["cases"] = cases.data or []

    return partner


@router.get("/{partner_id}/messages")
async def get_referral_partner_messages(partner_id: str, authorization: str = Header(default=None)):
    """Return the recent outbound contact history for one referral partner."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    await _get_referral_partner_or_404(partner_id)

    supabase = get_supabase()
    result = (
        supabase.table("referral_partner_messages")
        .select("id,channel,direction,sender,recipient,subject,body,status,error_message,provider_metadata,sent_by,thread_key,provider_message_id,provider_event_id,received_at,created_at")
        .eq("referral_partner_id", partner_id)
        .order("created_at", desc=False)
        .limit(100)
        .execute()
    )
    return result.data or []


@router.post("/{partner_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_referral_partner_message(
    partner_id: str,
    payload: ReferralPartnerMessageCreate,
    authorization: str = Header(default=None),
):
    """Send an attorney-composed email or SMS to a referral partner and audit it."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    partner = await _get_referral_partner_or_404(partner_id)
    supabase = get_supabase()

    message_id = str(uuid.uuid4())
    recipient = ""
    send_status = "sent"
    error_message = None
    provider_metadata = None
    provider_message_id = None
    thread_key = _conversation_key(payload.channel, partner_id)
    sender = "LegalFlow"

    if payload.channel == "email":
        recipient = str(partner.get("email") or "").strip()
        if not recipient:
            raise HTTPException(status_code=422, detail="This referral partner does not have an email address on file")
        if not payload.subject:
            raise HTTPException(status_code=422, detail="An email subject is required")

        from utils.email_service import get_last_email_error, send_email

        safe_name = html.escape(str(partner.get("full_name") or "there"))
        safe_body = html.escape(payload.body).replace("\n", "<br>")
        reply_to = _partner_reply_address(partner_id)
        delivered = await send_email(
            to=recipient,
            subject=payload.subject,
            body=(
                "<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;'>"
                f"<p>Hi {safe_name},</p><p>{safe_body}</p>"
                "</div>"
            ),
            idempotency_key=f"referral-partner-message:{message_id}",
            reply_to=reply_to,
        )
        if not delivered:
            send_status = "failed"
            error_message = get_last_email_error() or "Email delivery failed"
        provider_metadata = {
            "provider": "resend_or_smtp",
            "reply_capture_configured": bool(reply_to),
            "reply_to": reply_to,
        }
    else:
        recipient = str(partner.get("phone") or "").strip()
        if not recipient:
            raise HTTPException(status_code=422, detail="This referral partner does not have a phone number on file")
        if len(re.sub(r"\D", "", recipient)) < 7:
            raise HTTPException(status_code=422, detail="The referral partner phone number is not valid")

        account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
        auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
        from_number = os.environ.get("TWILIO_PHONE_NUMBER")
        if not account_sid or not auth_token or not from_number:
            send_status = "failed"
            error_message = "Text messaging is not configured. Add the Twilio settings in Railway before sending texts."
        else:
            try:
                from twilio.rest import Client

                twilio_client = Client(account_sid, auth_token)
                message = twilio_client.messages.create(
                    body=payload.body,
                    from_=from_number,
                    to=recipient,
                )
                provider_message_id = message.sid
                provider_metadata = {"provider": "twilio", "sid": message.sid, "status": message.status}
            except Exception as exc:
                send_status = "failed"
                error_message = str(exc)
                logger.exception("Could not send SMS to referral partner %s", partner_id)

    record = {
        "id": message_id,
        "referral_partner_id": partner_id,
        "channel": payload.channel,
        "direction": "outbound",
        "sender": sender,
        "recipient": recipient,
        "subject": payload.subject if payload.channel == "email" else None,
        "body": payload.body,
        "thread_key": thread_key,
        "provider_message_id": provider_message_id,
        "status": send_status,
        "error_message": error_message,
        "sent_by": profile["id"],
        "provider_metadata": provider_metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    insert_result = supabase.table("referral_partner_messages").insert(record).execute()
    return {
        "status": send_status,
        "error": error_message,
        "record": insert_result.data[0] if insert_result.data else record,
    }


@router.post("/webhooks/resend/inbound")
async def receive_referral_partner_email_reply(request: Request):
    """Receive a signed inbound Resend reply and append it to one partner thread."""
    signing_secret = str(os.environ.get("RESEND_WEBHOOK_SECRET") or "").strip()
    if not signing_secret:
        raise HTTPException(status_code=503, detail="Inbound email receiving is not configured")

    raw_body = await request.body()
    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    if not all(headers.values()):
        raise HTTPException(status_code=401, detail="Missing Resend webhook signature")

    try:
        from svix.webhooks import Webhook
        event = Webhook(signing_secret).verify(raw_body.decode("utf-8"), headers)
    except Exception:
        logger.warning("Rejected an invalid Resend inbound-email webhook")
        raise HTTPException(status_code=401, detail="Invalid Resend webhook signature")

    if event.get("type") != "email.received":
        return {"received": False, "ignored": True}

    data = event.get("data") or {}
    email_id = str(data.get("email_id") or "").strip()
    event_id = str(request.headers.get("svix-id") or email_id).strip()
    recipient_addresses = data.get("to") or data.get("received_for") or []
    if isinstance(recipient_addresses, str):
        recipient_addresses = [recipient_addresses]
    partner_id = _partner_id_from_reply_addresses([str(item) for item in recipient_addresses])
    if not email_id or not partner_id:
        logger.warning("Ignoring inbound email without a partner-specific reply address")
        return {"received": False, "ignored": True}

    supabase = get_supabase()
    duplicate = supabase.table("referral_partner_messages").select("id").eq("provider_event_id", event_id).limit(1).execute()
    if duplicate.data:
        return {"received": True, "duplicate": True}

    partner = await _get_referral_partner_or_404(partner_id)
    source_address = _email_address(data.get("from"))
    if not source_address or source_address != _email_address(partner.get("email")):
        logger.warning("Ignoring inbound email sender that does not match referral partner %s", partner_id)
        return {"received": False, "ignored": True}

    resend_key = str(os.environ.get("RESEND_API_KEY") or "").strip()
    if not resend_key:
        raise HTTPException(status_code=503, detail="Inbound email content retrieval is not configured")

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            content_response = await client.get(
                f"https://api.resend.com/emails/receiving/{email_id}",
                headers={"Authorization": f"Bearer {resend_key}"},
            )
        if content_response.status_code != 200:
            raise RuntimeError(f"Resend content retrieval failed with HTTP {content_response.status_code}")
        inbound = content_response.json()
    except Exception as exc:
        logger.exception("Could not retrieve inbound Resend email %s", email_id)
        raise HTTPException(status_code=502, detail="Could not retrieve inbound email content") from exc

    body = _safe_inbound_text(inbound.get("text"), inbound.get("html"))
    if not body:
        return {"received": False, "ignored": True}

    record = {
        "id": str(uuid.uuid4()),
        "referral_partner_id": partner_id,
        "channel": "email",
        "direction": "inbound",
        "sender": source_address,
        "recipient": _email_address((inbound.get("to") or [""])[0]),
        "subject": str(inbound.get("subject") or data.get("subject") or "").strip()[:200] or None,
        "body": body,
        "thread_key": _conversation_key("email", partner_id),
        "provider_message_id": str(inbound.get("message_id") or email_id),
        "provider_event_id": event_id,
        "status": "received",
        "provider_metadata": {"provider": "resend", "received_email_id": email_id},
        "received_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("referral_partner_messages").insert(record).execute()
    except Exception:
        logger.exception("Could not store inbound referral partner email event %s", event_id)
        raise HTTPException(status_code=500, detail="Could not store inbound email reply")
    return {"received": True}


@router.post("/webhooks/twilio/inbound")
async def receive_referral_partner_text_reply(request: Request):
    """Receive a signed Twilio SMS reply and append it to a matched partner thread."""
    auth_token = str(os.environ.get("TWILIO_AUTH_TOKEN") or "").strip()
    signature = request.headers.get("x-twilio-signature")
    form = {key: str(value) for key, value in (await request.form()).items()}
    if not auth_token or not signature:
        raise HTTPException(status_code=401, detail="Invalid Twilio webhook signature")

    callback_url = str(os.environ.get("TWILIO_INBOUND_WEBHOOK_URL") or str(request.url))
    try:
        from twilio.request_validator import RequestValidator
        valid = RequestValidator(auth_token).validate(callback_url, form, signature)
    except Exception:
        logger.exception("Could not validate Twilio inbound SMS webhook")
        valid = False
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid Twilio webhook signature")

    sender_phone = _phone_number(form.get("From"))
    provider_event_id = str(form.get("MessageSid") or form.get("SmsSid") or "").strip()
    body = str(form.get("Body") or "").strip()[:1600]
    if not sender_phone or not provider_event_id or not body:
        return Response(content="<Response></Response>", media_type="application/xml")

    supabase = get_supabase()
    duplicate = supabase.table("referral_partner_messages").select("id").eq("provider_event_id", provider_event_id).limit(1).execute()
    if duplicate.data:
        return Response(content="<Response></Response>", media_type="application/xml")

    partners = supabase.table("referral_partners").select("id,phone").not_.is_("phone", "null").execute()
    partner = next((item for item in (partners.data or []) if _phone_number(item.get("phone")) == sender_phone), None)
    if not partner:
        logger.warning("Ignoring inbound SMS from an unknown number")
        return Response(content="<Response></Response>", media_type="application/xml")

    partner_id = str(partner["id"])
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "referral_partner_id": partner_id,
        "channel": "sms",
        "direction": "inbound",
        "sender": str(form.get("From") or "").strip(),
        "recipient": str(form.get("To") or "").strip(),
        "body": body,
        "thread_key": _conversation_key("sms", partner_id),
        "provider_message_id": provider_event_id,
        "provider_event_id": provider_event_id,
        "status": "received",
        "provider_metadata": {"provider": "twilio", "account_sid": form.get("AccountSid")},
        "received_at": now,
        "created_at": now,
    }
    try:
        supabase.table("referral_partner_messages").insert(record).execute()
    except Exception:
        logger.exception("Could not store inbound referral partner SMS event %s", provider_event_id)
        raise HTTPException(status_code=500, detail="Could not store inbound text reply")
    return Response(content="<Response></Response>", media_type="application/xml")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_referral_partner(body: ReferralPartnerCreate, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    record = body.model_dump()
    record["created_by"] = profile["id"]
    record["created_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("referral_partners").insert(record).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create referral partner")
    return resp.data[0]


@router.patch("/{partner_id}")
async def update_referral_partner(partner_id: str, body: dict, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("referral_partners").update(body).eq("id", partner_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Not found")
    return resp.data[0]


@router.delete("/{partner_id}")
async def delete_referral_partner(partner_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("referral_partners").delete().eq("id", partner_id).execute()
    return {"deleted": True}


class AssignReferralRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    partner_id: Optional[str] = None


@router.post("/assign")
async def assign_referral(body: AssignReferralRequest, authorization: str = Header(default=None)):
    """Assign (or unassign) a referral partner to a client and/or case."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    value = body.partner_id if body.partner_id else None

    if body.client_id:
        supabase.table("profiles").update(
            {"referral_partner_id": value}
        ).eq("id", body.client_id).execute()

    if body.case_id:
        supabase.table("cases").update(
            {"referral_partner_id": value}
        ).eq("id", body.case_id).execute()

    return {"assigned": True}


# ---------------------------------------------------------------------------
# POST /invite-portal — create portal login for a referral partner
# ---------------------------------------------------------------------------

class InvitePortalRequest(BaseModel):
    partner_id: str
    email: str


@router.post("/invite-portal")
async def invite_partner_portal(body: InvitePortalRequest, authorization: str = Header(default=None)):
    """Create a login for a referral partner so they can access their portal."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Get partner info
    partner_resp = supabase.table("referral_partners").select("*").eq("id", body.partner_id).limit(1).execute()
    if not partner_resp.data:
        raise HTTPException(status_code=404, detail="Partner not found")

    partner = partner_resp.data[0]

    # Create auth user
    import secrets, string
    temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits + "!@#$%&*") for _ in range(16))

    try:
        auth_resp = supabase.auth.admin.create_user({
            "email": body.email,
            "password": temp_password,
            "email_confirm": True,
        })
        new_user_id = str(auth_resp.user.id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create account: {e}")

    # Create profile with affiliate role
    try:
        supabase.table("profiles").insert({
            "id": new_user_id,
            "email": body.email,
            "full_name": partner.get("full_name", ""),
            "phone": partner.get("phone", ""),
            "role": "affiliate",
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile creation failed: {e}")

    # Link portal user to partner
    supabase.table("referral_partners").update({
        "portal_user_id": new_user_id,
    }).eq("id", body.partner_id).execute()

    # Send welcome email
    try:
        import os as _os
        from utils.email_service import send_email
        frontend_url = _os.environ.get("FRONTEND_URL", "http://localhost:5173")
        await send_email(
            to=body.email,
            subject=f"You've been invited to LegalFlow",
            body=f"""
            <div style="font-family:sans-serif;font-size:14px;line-height:1.6;">
                <h2>Welcome to LegalFlow</h2>
                <p>Hi {partner.get('full_name', '')},</p>
                <p>You've been invited to the LegalFlow platform to track your referred clients and cases.</p>
                <p><strong>Login URL:</strong> <a href="{frontend_url}/login">{frontend_url}/login</a></p>
                <p><strong>Email:</strong> {body.email}</p>
                <p><strong>Temporary Password:</strong> {temp_password}</p>
                <p>Please change your password after your first login.</p>
            </div>
            """,
        )
    except Exception as e:
        logger.warning(f"Could not send welcome email: {e}")

    return {
        "status": "invited",
        "email": body.email,
        "temp_password": temp_password,
        "message": f"Portal created for {partner.get('full_name')}. Share the password with them.",
    }


# ---------------------------------------------------------------------------
# PATCH /toggle-access — toggle drafter/disputer access for a partner
# ---------------------------------------------------------------------------

class ToggleAccessRequest(BaseModel):
    partner_id: str
    feature: str  # "drafter" or "disputer"
    enabled: bool


@router.patch("/toggle-access")
async def toggle_partner_access(body: ToggleAccessRequest, authorization: str = Header(default=None)):
    """Toggle drafter or disputer access for a referral partner."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    field = f"can_access_{body.feature}"
    if field not in ("can_access_drafter", "can_access_disputer"):
        raise HTTPException(status_code=400, detail="Feature must be 'drafter' or 'disputer'")

    supabase = get_supabase()
    resp = supabase.table("referral_partners").update({field: body.enabled}).eq("id", body.partner_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Partner not found")

    return {"updated": True, "feature": body.feature, "enabled": body.enabled}
