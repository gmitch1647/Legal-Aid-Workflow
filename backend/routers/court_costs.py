"""Court-cost reimbursement workflow for referral matters."""
import logging
import os
import uuid
from datetime import date, datetime, timezone
from html import escape
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from utils.email_service import send_email
from utils.supabase_client import get_supabase
from routers.cases import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()
STAFF_ROLES = {"owner", "attorney", "staff_attorney"}
ALLOWED_STATUSES = {"draft", "submitted", "needs_correction", "approved", "awaiting_payment", "paid", "disputed"}


def now():
    return datetime.now(timezone.utc).isoformat()


class CourtCostCreate(BaseModel):
    case_id: str
    amount: float = Field(ge=0, le=100000000)
    expense_date: date
    court_name: str = Field(min_length=2, max_length=180)
    description: str = Field(min_length=2, max_length=2000)
    receipt_url: Optional[str] = Field(default=None, max_length=2000)
    status: str = Field(default="submitted", max_length=40)
    submission_key: Optional[str] = Field(default=None, max_length=120)


class CourtCostUpdate(BaseModel):
    status: str
    amount: Optional[float] = Field(default=None, ge=0, le=100000000)
    expense_date: Optional[date] = None
    court_name: Optional[str] = Field(default=None, min_length=2, max_length=180)
    description: Optional[str] = Field(default=None, min_length=2, max_length=2000)
    receipt_url: Optional[str] = Field(default=None, max_length=2000)
    note: Optional[str] = Field(default=None, max_length=2000)
    paid_amount: Optional[float] = Field(default=None, ge=0, le=100000000)
    payment_date: Optional[date] = None
    payment_method: Optional[str] = Field(default=None, max_length=100)
    payment_reference: Optional[str] = Field(default=None, max_length=180)
    payment_note: Optional[str] = Field(default=None, max_length=2000)


def _profile_partner_id(supabase, profile: dict):
    if profile.get("referral_partner_id"):
        return profile["referral_partner_id"]
    email = str(profile.get("email") or "").strip().lower()
    if not email:
        return None
    result = supabase.table("referral_partners").select("id").ilike("email", email).limit(1).execute()
    return (result.data or [{}])[0].get("id")


def _owner_id(supabase):
    try:
        result = supabase.table("settlement_package_reviewers").select("owner_profile_id").eq("active", True).limit(1).execute()
        return (result.data or [{}])[0].get("owner_profile_id")
    except Exception:
        return None


def _is_owner(supabase, profile):
    return profile.get("id") == _owner_id(supabase)


def _require_role(profile):
    if profile.get("role") not in STAFF_ROLES and profile.get("role") != "affiliate":
        raise HTTPException(status_code=403, detail="Court Costs access is restricted to authorized LegalFlow team members.")


def _get_request(supabase, request_id):
    result = supabase.table("court_cost_requests").select("*").eq("id", request_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Court-cost request not found.")
    return result.data[0]


def _can_view(supabase, profile, row):
    if profile.get("role") in STAFF_ROLES or _is_owner(supabase, profile):
        return True
    partner_id = _profile_partner_id(supabase, profile)
    return bool(partner_id and row.get("referral_partner_id") == partner_id) or row.get("submitted_by") == profile.get("id")


def _enrich(supabase, row, profile, is_owner):
    case = {}
    client = {}
    partner = {}
    if row.get("case_id"):
        case = (supabase.table("cases").select("id,case_number,plaintiff_name,client_id").eq("id", row["case_id"]).limit(1).execute().data or [{}])[0]
        if case.get("client_id"):
            client = (supabase.table("profiles").select("id,full_name").eq("id", case["client_id"]).limit(1).execute().data or [{}])[0]
    if row.get("referral_partner_id"):
        partner = (supabase.table("referral_partners").select("id,full_name,email").eq("id", row["referral_partner_id"]).limit(1).execute().data or [{}])[0]
    submitter = {}
    if row.get("submitted_by"):
        submitter = (supabase.table("profiles").select("id,full_name,email").eq("id", row["submitted_by"]).limit(1).execute().data or [{}])[0]
    events = supabase.table("court_cost_events").select("id,actor_id,action,from_status,to_status,note,amount,created_at").eq("request_id", row["id"]).order("created_at", desc=True).limit(100).execute().data or []
    result = {**row, "case_label": case.get("case_number") or case.get("plaintiff_name") or "Case", "client_name": client.get("full_name") or case.get("plaintiff_name") or "Client", "referral_partner": partner, "submitted_by_profile": submitter, "events": events}
    return result


async def _notify(recipients, subject, body, key):
    sent = []
    for email in dict.fromkeys(str(item or "").strip().lower() for item in recipients if str(item or "").strip()):
        try:
            if await send_email(to=email, subject=subject, body=body, idempotency_key=f"court-cost:{key}:{email}"):
                sent.append(email)
        except Exception:
            logger.exception("Court-cost notification failed for %s", email)
    return sent


@router.get("")
async def list_court_costs(authorization: str = Header(...)):
    profile = await get_current_user(authorization)
    _require_role(profile)
    supabase = get_supabase()
    rows = supabase.table("court_cost_requests").select("*").order("created_at", desc=True).limit(500).execute().data or []
    visible = [row for row in rows if _can_view(supabase, profile, row)]
    is_owner = _is_owner(supabase, profile)
    return [_enrich(supabase, row, profile, is_owner) for row in visible]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_court_cost(body: CourtCostCreate, authorization: str = Header(...)):
    profile = await get_current_user(authorization)
    _require_role(profile)
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid court-cost status.")
    supabase = get_supabase()
    case_result = supabase.table("cases").select("id,case_number,plaintiff_name,client_id,referral_partner_id").eq("id", body.case_id).limit(1).execute()
    if not case_result.data:
        raise HTTPException(status_code=404, detail="Case not found.")
    case = case_result.data[0]
    partner_id = case.get("referral_partner_id") or _profile_partner_id(supabase, profile)
    if body.submission_key:
        existing_result = supabase.table("court_cost_requests").select("*").eq("submission_key", body.submission_key).limit(1).execute()
        if existing_result.data:
            return _enrich(supabase, existing_result.data[0], profile, _is_owner(supabase, profile))
    request_id = str(uuid.uuid4())
    timestamp = now()
    row = {"id": request_id, "case_id": body.case_id, "referral_partner_id": partner_id, "submitted_by": profile.get("id"), "amount": body.amount, "currency": "USD", "expense_date": body.expense_date.isoformat(), "court_name": body.court_name.strip(), "description": body.description.strip(), "receipt_url": body.receipt_url, "status": body.status, "submission_key": body.submission_key, "submitted_at": timestamp if body.status == "submitted" else None, "created_at": timestamp, "updated_at": timestamp}
    created = supabase.table("court_cost_requests").insert(row).execute()
    row = (created.data or [row])[0]
    supabase.table("court_cost_events").insert({"id": str(uuid.uuid4()), "request_id": request_id, "actor_id": profile.get("id"), "action": "submitted" if body.status == "submitted" else "created", "to_status": body.status, "amount": body.amount, "created_at": timestamp}).execute()
    if body.status == "submitted" and partner_id:
        partner = (supabase.table("referral_partners").select("full_name,email").eq("id", partner_id).limit(1).execute().data or [{}])[0]
        owner = (supabase.table("profiles").select("email").eq("id", _owner_id(supabase)).limit(1).execute().data or [{}])[0] if _owner_id(supabase) else {}
        subject = f"Court-cost request: {case.get('plaintiff_name') or case.get('case_number') or 'LegalFlow matter'}"
        body_html = f"<p>Hello {escape(str(partner.get('full_name') or 'there'))},</p><p>A court-cost reimbursement request has been submitted for <strong>{escape(str(case.get('plaintiff_name') or case.get('case_number') or 'a matter'))}</strong>.</p><p><strong>Amount:</strong> ${body.amount:,.2f}<br><strong>Court:</strong> {escape(body.court_name)}<br><strong>Date:</strong> {escape(body.expense_date.isoformat())}<br><strong>Description:</strong> {escape(body.description)}</p><p>Please sign in to LegalFlow to review and mark the request paid or return it for correction.</p>"
        await _notify([partner.get("email"), owner.get("email")], subject, body_html, request_id)
    return _enrich(supabase, row, profile, _is_owner(supabase, profile))


@router.delete("/{request_id}")
async def delete_court_cost(request_id: str, authorization: str = Header(...)):
    profile = await get_current_user(authorization)
    _require_role(profile)
    supabase = get_supabase()
    row = _get_request(supabase, request_id)
    if not (_is_owner(supabase, profile) or profile.get("role") in STAFF_ROLES):
        raise HTTPException(status_code=403, detail="Only the owner or an authorized attorney can delete court-cost requests.")
    if row.get("status") == "paid":
        raise HTTPException(status_code=409, detail="Paid court-cost requests cannot be deleted. Keep them for financial records.")
    try:
        supabase.table("court_cost_events").delete().eq("request_id", request_id).execute()
        deleted = supabase.table("court_cost_requests").delete().eq("id", request_id).select("id").execute()
        if not deleted.data:
            still_exists = supabase.table("court_cost_requests").select("id").eq("id", request_id).limit(1).execute()
            if still_exists.data:
                raise HTTPException(status_code=409, detail="The Court Costs request could not be deleted from the database. Please refresh and try again.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Court-cost deletion failed for %s", request_id)
        raise HTTPException(status_code=500, detail="Court-cost deletion failed. Please refresh and try again.") from exc
    return {"id": request_id, "deleted": True}


@router.patch("/{request_id}")
async def update_court_cost(request_id: str, body: CourtCostUpdate, authorization: str = Header(...)):
    profile = await get_current_user(authorization)
    _require_role(profile)
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid court-cost status.")
    supabase = get_supabase()
    row = _get_request(supabase, request_id)
    if not _can_view(supabase, profile, row):
        raise HTTPException(status_code=403, detail="You do not have access to this court-cost request.")
    partner_access = bool(row.get("referral_partner_id") and row.get("referral_partner_id") == _profile_partner_id(supabase, profile))
    privileged = profile.get("role") in STAFF_ROLES or _is_owner(supabase, profile) or partner_access
    if body.status in {"approved", "awaiting_payment", "paid", "disputed"} and not privileged:
        raise HTTPException(status_code=403, detail="Only Ethan, the owner, or an authorized attorney can perform this action.")
    if body.status == "paid" and body.paid_amount is None:
        raise HTTPException(status_code=422, detail="Enter the amount paid before marking this request paid.")
    timestamp = now()
    if body.status != "paid" and (profile.get("id") == row.get("submitted_by") or privileged):
        if body.amount is not None: row["amount"] = body.amount
        if body.expense_date is not None: row["expense_date"] = body.expense_date.isoformat()
        if body.court_name is not None: row["court_name"] = body.court_name.strip()
        if body.description is not None: row["description"] = body.description.strip()
        if body.receipt_url is not None: row["receipt_url"] = body.receipt_url
    payload = {"status": body.status, "updated_at": timestamp}
    if body.status != "paid" and (profile.get("id") == row.get("submitted_by") or privileged):
        for key in ("amount", "expense_date", "court_name", "description", "receipt_url"):
            if key in row and row.get(key) is not None: payload[key] = row[key]
        payload.update({"edited_at": timestamp, "edited_by": profile.get("id"), "last_edit_note": (body.note or "").strip() or None})
    if body.status == "needs_correction": payload["correction_note"] = (body.note or "").strip()
    if body.status in {"approved", "awaiting_payment", "disputed"}: payload.update({"reviewed_by": profile.get("id"), "reviewed_at": timestamp})
    if body.status == "paid": payload.update({"paid_amount": body.paid_amount, "payment_date": (body.payment_date or date.today()).isoformat(), "payment_method": body.payment_method, "payment_reference": body.payment_reference, "payment_note": body.payment_note, "paid_by": profile.get("id"), "paid_at": timestamp})
    supabase.table("court_cost_requests").update(payload).eq("id", request_id).execute()
    supabase.table("court_cost_events").insert({"id": str(uuid.uuid4()), "request_id": request_id, "actor_id": profile.get("id"), "action": body.status, "from_status": row.get("status"), "to_status": body.status, "note": body.note or body.payment_note, "amount": body.paid_amount if body.status == "paid" else row.get("amount"), "created_at": timestamp}).execute()
    if body.status in {"needs_correction", "paid"}:
        submitter = (supabase.table("profiles").select("email,full_name").eq("id", row.get("submitted_by")).limit(1).execute().data or [{}])[0]
        owner = (supabase.table("profiles").select("email").eq("id", _owner_id(supabase)).limit(1).execute().data or [{}])[0] if _owner_id(supabase) else {}
        esther = (supabase.table("profiles").select("email,full_name").ilike("full_name", "Esther Oise").limit(1).execute().data or [{}])[0]
        case = (supabase.table("cases").select("plaintiff_name,case_number").eq("id", row.get("case_id")).limit(1).execute().data or [{}])[0]
        matter = case.get("plaintiff_name") or case.get("case_number") or "your matter"
        if body.status == "paid":
            subject = f"Court costs paid: {matter}"
            message = f"<p>The court-cost request for <strong>{escape(str(matter))}</strong> has been marked paid.</p><p><strong>Amount paid:</strong> ${body.paid_amount:,.2f}<br><strong>Payment date:</strong> {escape(str(body.payment_date or date.today()))}</p>"
        else:
            subject = f"Court-cost request needs correction: {matter}"
            message = f"<p>The court-cost request for <strong>{escape(str(matter))}</strong> needs correction.</p><p><strong>Note:</strong> {escape(body.note or 'Please review the request in LegalFlow.')}</p>"
        recipients = [submitter.get("email"), owner.get("email")]
        if body.status == "paid": recipients.append(esther.get("email"))
        await _notify(recipients, subject, message, request_id + body.status)
    return _enrich(supabase, {**row, **payload, "id": request_id}, profile, _is_owner(supabase, profile))
