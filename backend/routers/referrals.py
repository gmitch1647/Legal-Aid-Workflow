"""
Referral Partners router — manage people/firms who refer cases.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

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
    cases = supabase.table("cases").select("id, status, case_facts, created_at").eq("referral_partner_id", partner_id).order("created_at", desc=True).execute()

    partner["clients"] = clients.data or []
    partner["cases"] = cases.data or []

    return partner


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
    partner_id: str


@router.post("/assign")
async def assign_referral(body: AssignReferralRequest, authorization: str = Header(default=None)):
    """Assign a referral partner to a client and/or case."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    if body.client_id:
        supabase.table("profiles").update(
            {"referral_partner_id": body.partner_id}
        ).eq("id", body.client_id).execute()

    if body.case_id:
        supabase.table("cases").update(
            {"referral_partner_id": body.partner_id}
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
