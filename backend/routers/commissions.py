"""
Commission tracking + QuickBooks Online integration.

Tracks commissions owed to referral partners (CROs) and optionally
syncs with QuickBooks Online to create vendors and bills.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, status
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


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CommissionCreate(BaseModel):
    referral_partner_id: str
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    description: Optional[str] = None
    settlement_amount: float = 0
    fee_type: str = "percentage"
    fee_value: float = 0
    notes: Optional[str] = None


class CommissionUpdate(BaseModel):
    settlement_amount: Optional[float] = None
    fee_type: Optional[str] = None
    fee_value: Optional[float] = None
    commission_amount: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# GET / — list all commissions
# ---------------------------------------------------------------------------

@router.get("")
async def list_commissions(
    partner_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    query = supabase.table("commissions").select("*").order("created_at", desc=True)

    if partner_id:
        query = query.eq("referral_partner_id", partner_id)
    if status_filter:
        query = query.eq("status", status_filter)

    resp = query.limit(500).execute()
    commissions = resp.data or []

    # Enrich with partner and client names
    partner_ids = list({c["referral_partner_id"] for c in commissions if c.get("referral_partner_id")})
    client_ids = list({c["client_id"] for c in commissions if c.get("client_id")})

    partner_map = {}
    if partner_ids:
        p_resp = supabase.table("referral_partners").select("id, full_name, company").in_("id", partner_ids).execute()
        partner_map = {p["id"]: p for p in (p_resp.data or [])}

    client_map = {}
    if client_ids:
        c_resp = supabase.table("profiles").select("id, full_name, email").in_("id", client_ids).execute()
        client_map = {c["id"]: c for c in (c_resp.data or [])}

    for c in commissions:
        partner = partner_map.get(c.get("referral_partner_id"), {})
        c["partner_name"] = partner.get("full_name", "")
        c["partner_company"] = partner.get("company", "")
        client = client_map.get(c.get("client_id"), {})
        c["client_name"] = client.get("full_name", "")

    return commissions


# ---------------------------------------------------------------------------
# GET /summary — totals per partner
# ---------------------------------------------------------------------------

@router.get("/summary")
async def commission_summary(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Get all commissions
    resp = supabase.table("commissions").select("referral_partner_id, commission_amount, status").execute()
    commissions = resp.data or []

    # Get all partners
    p_resp = supabase.table("referral_partners").select("id, full_name, company, referral_fee_type, referral_fee_amount").execute()
    partners = p_resp.data or []

    summary = {}
    for p in partners:
        summary[p["id"]] = {
            "partner_id": p["id"],
            "partner_name": p["full_name"],
            "company": p.get("company", ""),
            "fee_type": p.get("referral_fee_type", "none"),
            "fee_amount": float(p.get("referral_fee_amount") or 0),
            "total_earned": 0,
            "total_pending": 0,
            "total_approved": 0,
            "total_paid": 0,
            "count": 0,
        }

    for c in commissions:
        pid = c.get("referral_partner_id")
        if pid not in summary:
            continue
        amt = float(c.get("commission_amount") or 0)
        summary[pid]["total_earned"] += amt
        summary[pid]["count"] += 1
        st = c.get("status", "pending")
        if st == "pending":
            summary[pid]["total_pending"] += amt
        elif st == "approved":
            summary[pid]["total_approved"] += amt
        elif st == "paid":
            summary[pid]["total_paid"] += amt

    return list(summary.values())


# ---------------------------------------------------------------------------
# POST / — create a commission
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_commission(
    body: CommissionCreate,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    # Calculate commission amount
    if body.fee_type == "percentage":
        commission_amount = body.settlement_amount * (body.fee_value / 100)
    elif body.fee_type == "flat":
        commission_amount = body.fee_value
    else:
        commission_amount = 0

    supabase = get_supabase()

    # Auto-fill from partner if fee not specified
    if body.fee_value == 0:
        p_resp = supabase.table("referral_partners").select("referral_fee_type, referral_fee_amount").eq("id", body.referral_partner_id).limit(1).execute()
        if p_resp.data:
            p = p_resp.data[0]
            body.fee_type = p.get("referral_fee_type") or "percentage"
            body.fee_value = float(p.get("referral_fee_amount") or 0)
            if body.fee_type == "percentage":
                commission_amount = body.settlement_amount * (body.fee_value / 100)
            elif body.fee_type == "flat":
                commission_amount = body.fee_value

    record = {
        "referral_partner_id": body.referral_partner_id,
        "case_id": body.case_id,
        "client_id": body.client_id,
        "description": body.description,
        "settlement_amount": body.settlement_amount,
        "fee_type": body.fee_type,
        "fee_value": body.fee_value,
        "commission_amount": round(commission_amount, 2),
        "status": "pending",
        "notes": body.notes,
        "created_by": profile["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    resp = supabase.table("commissions").insert(record).execute()
    return resp.data[0] if resp.data else record


# ---------------------------------------------------------------------------
# PATCH /{id} — update a commission
# ---------------------------------------------------------------------------

@router.patch("/{commission_id}")
async def update_commission(
    commission_id: str,
    body: CommissionUpdate,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}

    # Recalculate commission if settlement or fee changed
    if "settlement_amount" in update_data or "fee_value" in update_data or "fee_type" in update_data:
        existing = supabase.table("commissions").select("*").eq("id", commission_id).limit(1).execute()
        if existing.data:
            e = existing.data[0]
            sa = update_data.get("settlement_amount", e.get("settlement_amount", 0))
            ft = update_data.get("fee_type", e.get("fee_type", "percentage"))
            fv = update_data.get("fee_value", e.get("fee_value", 0))
            if ft == "percentage":
                update_data["commission_amount"] = round(float(sa) * (float(fv) / 100), 2)
            elif ft == "flat":
                update_data["commission_amount"] = float(fv)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("commissions").update(update_data).eq("id", commission_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Commission not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# POST /{id}/approve — approve a commission for payment
# ---------------------------------------------------------------------------

@router.post("/{commission_id}/approve")
async def approve_commission(commission_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    resp = supabase.table("commissions").update({
        "status": "approved",
        "approved_at": now,
        "updated_at": now,
    }).eq("id", commission_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Commission not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# POST /{id}/mark-paid — mark as paid
# ---------------------------------------------------------------------------

@router.post("/{commission_id}/mark-paid")
async def mark_commission_paid(commission_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    resp = supabase.table("commissions").update({
        "status": "paid",
        "paid_at": now,
        "updated_at": now,
    }).eq("id", commission_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Commission not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------

@router.delete("/{commission_id}")
async def delete_commission(commission_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("commissions").delete().eq("id", commission_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# QuickBooks OAuth — connect / disconnect
# ---------------------------------------------------------------------------

QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QB_API_BASE = "https://quickbooks.api.intuit.com/v3"


def _qb_client_id():
    return os.environ.get("QUICKBOOKS_CLIENT_ID", "")


def _qb_client_secret():
    return os.environ.get("QUICKBOOKS_CLIENT_SECRET", "")


def _qb_redirect_uri():
    return os.environ.get("QUICKBOOKS_REDIRECT_URI", "")


def _qb_configured():
    return bool(_qb_client_id() and _qb_client_secret())


@router.get("/quickbooks/status")
async def quickbooks_status(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("quickbooks_config").select("realm_id, company_name, connected_at, token_expires_at").limit(1).execute()

    connected = False
    if resp.data:
        config = resp.data[0]
        expires = config.get("token_expires_at", "")
        if expires:
            from datetime import datetime as dt
            try:
                exp_dt = dt.fromisoformat(expires.replace("Z", "+00:00"))
                connected = exp_dt > datetime.now(timezone.utc)
            except Exception:
                pass

    return {
        "configured": _qb_configured(),
        "connected": connected,
        "company_name": resp.data[0].get("company_name") if resp.data else None,
        "realm_id": resp.data[0].get("realm_id") if resp.data else None,
    }


@router.get("/quickbooks/auth-url")
async def quickbooks_auth_url(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _qb_configured():
        raise HTTPException(status_code=400, detail="QuickBooks not configured. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI.")

    import urllib.parse
    params = {
        "client_id": _qb_client_id(),
        "redirect_uri": _qb_redirect_uri(),
        "response_type": "code",
        "scope": "com.intuit.quickbooks.accounting",
        "state": "legalflow",
    }
    url = f"{QB_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return {"auth_url": url}


@router.post("/quickbooks/callback")
async def quickbooks_callback(
    authorization: str = Header(...),
    code: str = "",
    realm_id: str = "",
):
    """Exchange the OAuth code for tokens and store them."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not code or not realm_id:
        raise HTTPException(status_code=400, detail="Missing code or realm_id")

    import base64
    import httpx

    auth_header = base64.b64encode(
        f"{_qb_client_id()}:{_qb_client_secret()}".encode()
    ).decode()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _qb_redirect_uri(),
            },
        )

    if resp.status_code != 200:
        logger.error("QB token exchange failed: %s %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text[:200]}")

    tokens = resp.json()
    expires_in = tokens.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc).isoformat()
    from datetime import timedelta
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

    # Get company name
    company_name = ""
    try:
        async with httpx.AsyncClient() as client:
            info_resp = await client.get(
                f"{QB_API_BASE}/company/{realm_id}/companyinfo/{realm_id}",
                headers={
                    "Authorization": f"Bearer {tokens['access_token']}",
                    "Accept": "application/json",
                },
            )
            if info_resp.status_code == 200:
                company_name = info_resp.json().get("CompanyInfo", {}).get("CompanyName", "")
    except Exception:
        pass

    supabase = get_supabase()

    # Upsert config
    existing = supabase.table("quickbooks_config").select("id").limit(1).execute()
    config_data = {
        "realm_id": realm_id,
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_expires_at": expires_at,
        "company_name": company_name,
        "connected_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if existing.data:
        supabase.table("quickbooks_config").update(config_data).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("quickbooks_config").insert(config_data).execute()

    return {"connected": True, "company_name": company_name, "realm_id": realm_id}


@router.post("/quickbooks/disconnect")
async def quickbooks_disconnect(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("quickbooks_config").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    return {"disconnected": True}


# ---------------------------------------------------------------------------
# POST /{id}/sync-to-quickbooks — create a QB bill for a commission
# ---------------------------------------------------------------------------

@router.post("/{commission_id}/sync-to-quickbooks")
async def sync_commission_to_quickbooks(commission_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Get QB config
    qb_resp = supabase.table("quickbooks_config").select("*").limit(1).execute()
    if not qb_resp.data:
        raise HTTPException(status_code=400, detail="QuickBooks not connected")

    qb = qb_resp.data[0]
    access_token = await _refresh_qb_token_if_needed(supabase, qb)

    # Get commission
    c_resp = supabase.table("commissions").select("*").eq("id", commission_id).limit(1).execute()
    if not c_resp.data:
        raise HTTPException(status_code=404, detail="Commission not found")

    commission = c_resp.data[0]

    if commission.get("quickbooks_bill_id"):
        return {"status": "already_synced", "bill_id": commission["quickbooks_bill_id"]}

    # Get partner info
    p_resp = supabase.table("referral_partners").select("*").eq("id", commission["referral_partner_id"]).limit(1).execute()
    partner = p_resp.data[0] if p_resp.data else {}

    import httpx

    # Ensure vendor exists in QB
    vendor_id = commission.get("quickbooks_vendor_id")
    if not vendor_id:
        vendor_id = await _ensure_qb_vendor(access_token, qb["realm_id"], partner)
        supabase.table("commissions").update({"quickbooks_vendor_id": vendor_id}).eq("id", commission_id).execute()

    # Create bill
    bill_data = {
        "VendorRef": {"value": vendor_id},
        "Line": [{
            "Amount": float(commission["commission_amount"]),
            "DetailType": "AccountBasedExpenseLineDetail",
            "AccountBasedExpenseLineDetail": {
                "AccountRef": {"value": "1"},
            },
            "Description": commission.get("description") or f"Referral commission - {partner.get('full_name', '')}",
        }],
        "TxnDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{QB_API_BASE}/company/{qb['realm_id']}/bill",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=bill_data,
        )

    if resp.status_code not in (200, 201):
        logger.error("QB bill creation failed: %s %s", resp.status_code, resp.text[:300])
        raise HTTPException(status_code=400, detail=f"QuickBooks bill creation failed: {resp.text[:200]}")

    bill = resp.json().get("Bill", {})
    bill_id = str(bill.get("Id", ""))

    supabase.table("commissions").update({
        "quickbooks_bill_id": bill_id,
        "status": "approved",
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", commission_id).execute()

    return {"status": "synced", "bill_id": bill_id}


# ---------------------------------------------------------------------------
# QB Helpers
# ---------------------------------------------------------------------------

async def _refresh_qb_token_if_needed(supabase, qb_config: dict) -> str:
    """Refresh the QB access token if it's expired."""
    from datetime import datetime as dt

    expires = qb_config.get("token_expires_at", "")
    try:
        exp_dt = dt.fromisoformat(expires.replace("Z", "+00:00"))
        if exp_dt > datetime.now(timezone.utc):
            return qb_config["access_token"]
    except Exception:
        pass

    import base64
    import httpx

    auth_header = base64.b64encode(
        f"{_qb_client_id()}:{_qb_client_secret()}".encode()
    ).decode()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            QB_TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": qb_config["refresh_token"],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="QuickBooks token refresh failed. Please reconnect.")

    tokens = resp.json()
    from datetime import timedelta
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()

    supabase.table("quickbooks_config").update({
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", qb_config["refresh_token"]),
        "token_expires_at": expires_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", qb_config["id"]).execute()

    return tokens["access_token"]


async def _ensure_qb_vendor(access_token: str, realm_id: str, partner: dict) -> str:
    """Find or create a vendor in QuickBooks for the referral partner."""
    import httpx

    name = partner.get("full_name", "Unknown Partner")

    # Search for existing vendor
    async with httpx.AsyncClient() as client:
        query = f"select * from Vendor where DisplayName = '{name}'"
        resp = await client.get(
            f"{QB_API_BASE}/company/{realm_id}/query",
            params={"query": query},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        if resp.status_code == 200:
            vendors = resp.json().get("QueryResponse", {}).get("Vendor", [])
            if vendors:
                return str(vendors[0]["Id"])

    # Create vendor
    vendor_data = {
        "DisplayName": name,
        "CompanyName": partner.get("company", ""),
        "PrimaryEmailAddr": {"Address": partner.get("email", "")},
        "PrimaryPhone": {"FreeFormNumber": partner.get("phone", "")},
        "Vendor1099": True,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{QB_API_BASE}/company/{realm_id}/vendor",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=vendor_data,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail=f"Could not create QuickBooks vendor: {resp.text[:200]}")

    return str(resp.json().get("Vendor", {}).get("Id", ""))
