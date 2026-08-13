"""
Referral Partners router — manage people/firms who refer cases.
"""

import html
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


class ReferralPartnerCreate(BaseModel):
    full_name: str
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    referral_fee_type: str = "percentage"
    referral_fee_amount: float = 0
    notes: Optional[str] = ""


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
        .select("id,channel,recipient,subject,body,status,error_message,provider_metadata,sent_by,created_at")
        .eq("referral_partner_id", partner_id)
        .order("created_at", desc=True)
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

    if payload.channel == "email":
        recipient = str(partner.get("email") or "").strip()
        if not recipient:
            raise HTTPException(status_code=422, detail="This referral partner does not have an email address on file")
        if not payload.subject:
            raise HTTPException(status_code=422, detail="An email subject is required")

        from utils.email_service import get_last_email_error, send_email

        safe_name = html.escape(str(partner.get("full_name") or "there"))
        safe_body = html.escape(payload.body).replace("\n", "<br>")
        delivered = await send_email(
            to=recipient,
            subject=payload.subject,
            body=(
                "<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;'>"
                f"<p>Hi {safe_name},</p><p>{safe_body}</p>"
                "</div>"
            ),
            idempotency_key=f"referral-partner-message:{message_id}",
        )
        if not delivered:
            send_status = "failed"
            error_message = get_last_email_error() or "Email delivery failed"
        provider_metadata = {"provider": "resend_or_smtp"}
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
                provider_metadata = {"provider": "twilio", "sid": message.sid, "status": message.status}
            except Exception as exc:
                send_status = "failed"
                error_message = str(exc)
                logger.exception("Could not send SMS to referral partner %s", partner_id)

    record = {
        "id": message_id,
        "referral_partner_id": partner_id,
        "channel": payload.channel,
        "recipient": recipient,
        "subject": payload.subject if payload.channel == "email" else None,
        "body": payload.body,
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
