"""Client document requests and private attorney settlement-payout ledger."""
import logging
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from utils.supabase_client import get_supabase
from utils.email_service import send_email

logger = logging.getLogger(__name__)
router = APIRouter()
STORAGE_BUCKET = "documents"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _current_profile(authorization: str) -> dict:
    from routers.cases import get_current_user
    return await get_current_user(authorization)


def _require_staff(profile: dict) -> None:
    if profile.get("role") not in {"attorney", "staff_attorney"}:
        raise HTTPException(status_code=403, detail="Attorney or staff access required.")


def _case_or_404(supabase, case_id: str) -> dict:
    response = supabase.table("cases").select("id, client_id, case_number, plaintiff_name").eq("id", case_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Case not found.")
    return response.data[0]


def _request_or_404(supabase, request_id: str) -> dict:
    response = supabase.table("document_requests").select("*").eq("id", request_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Document request not found.")
    return response.data[0]


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _payout_split(settlement_amount: Decimal, court_costs: Decimal, client_payouts: Decimal, percentage: Decimal) -> tuple[float, float, float]:
    """Calculate the private split after court costs and client payouts.

    The amount paid to the client is deducted before the split.  The user's
    editable percentage applies only to the remaining net amount, and the
    attorney remainder is what remains after that private share.  A negative
    net amount is clamped to zero for safe recordkeeping.
    """
    net_split_amount = max(Decimal("0"), settlement_amount - court_costs - client_payouts)
    expected_amount = net_split_amount * percentage / Decimal("100")
    attorney_remainder = max(Decimal("0"), net_split_amount - expected_amount)
    return _money(net_split_amount), _money(expected_amount), _money(attorney_remainder)


class DocumentRequestCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: str = Field(default="client_document", max_length=80)
    due_date: Optional[date] = None


class PayoutLedgerCreate(BaseModel):
    case_id: str
    settlement_amount: float = Field(ge=0)
    court_costs: float = Field(default=0, ge=0)
    client_payouts: float = Field(default=0, ge=0)
    percentage: float = Field(default=35, ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


class PayoutLedgerUpdate(BaseModel):
    settlement_amount: Optional[float] = Field(default=None, ge=0)
    court_costs: Optional[float] = Field(default=None, ge=0)
    client_payouts: Optional[float] = Field(default=None, ge=0)
    percentage: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


class PayoutCreate(BaseModel):
    amount: float = Field(gt=0)
    paid_on: date
    payment_method: Optional[str] = Field(default=None, max_length=80)
    reference: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=2000)


@router.get("/cases/{case_id}/document-requests")
async def list_document_requests(case_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    supabase = get_supabase()
    case = _case_or_404(supabase, case_id)
    if profile.get("role") == "client" and case.get("client_id") != profile.get("id"):
        raise HTTPException(status_code=403, detail="You do not have access to this case.")
    response = (
        supabase.table("document_requests")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


@router.post("/cases/{case_id}/document-requests", status_code=status.HTTP_201_CREATED)
async def create_document_request(case_id: str, body: DocumentRequestCreate, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    case = _case_or_404(supabase, case_id)
    request_id = str(uuid.uuid4())
    payload = {
        "id": request_id,
        "case_id": case_id,
        "client_id": case["client_id"],
        "requested_by": profile["id"],
        "title": body.title.strip(),
        "description": (body.description or "").strip() or None,
        "category": body.category.strip() or "client_document",
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "status": "requested",
        "created_at": _now(),
        "updated_at": _now(),
    }
    created = supabase.table("document_requests").insert(payload).execute()
    record = (created.data or [payload])[0]

    # Invitation email is best effort: the durable request remains visible in the
    # client portal even if the email provider temporarily fails.
    client = supabase.table("profiles").select("full_name, email").eq("id", case["client_id"]).limit(1).execute()
    if client.data and client.data[0].get("email"):
        frontend_url = os.environ.get("FRONTEND_URL", "https://legalflow.me").rstrip("/")
        due_line = f"\nRequested by: {body.due_date.strftime('%B %d, %Y')}" if body.due_date else ""
        try:
            delivered = await send_email(
                to=client.data[0]["email"],
                subject=f"LegalFlow document request: {body.title.strip()}",
                body=(
                    f"<p>Hello {client.data[0].get('full_name') or ''},</p>"
                    f"<p>Your LegalFlow team has requested: <strong>{body.title.strip()}</strong>.</p>"
                    f"<p>{(body.description or '').strip()}</p>"
                    f"<p><a href=\"{frontend_url}/client/cases/{case_id}\">Open your case to upload the requested document</a>.</p>"
                    f"<p>{due_line.strip()}</p>"
                ),
                idempotency_key=f"document-request:{request_id}",
            )
            if delivered:
                supabase.table("document_requests").update({"sent_at": _now(), "updated_at": _now()}).eq("id", request_id).execute()
                record["sent_at"] = _now()
        except Exception:
            logger.exception("Could not send document request invitation %s", request_id)
    return record


@router.post("/document-requests/{request_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_requested_document(
    request_id: str,
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    profile = await _current_profile(authorization)
    supabase = get_supabase()
    request_record = _request_or_404(supabase, request_id)
    if profile.get("role") == "client" and request_record.get("client_id") != profile.get("id"):
        raise HTTPException(status_code=403, detail="You do not have access to this document request.")
    if request_record.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="This document request has been cancelled.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Please choose a document to upload.")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Documents must be 25 MB or smaller.")

    original_name = file.filename or "requested_document"
    storage_path = f"cases/{request_record['case_id']}/requests/{request_id}/{uuid.uuid4()}_{original_name}"
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
        doc_payload = {
            "case_id": request_record["case_id"],
            "file_name": original_name,
            "file_type": file.content_type or "application/octet-stream",
            "file_size": len(content),
            "storage_path": storage_path,
            "document_category": "requested_client_document",
            "uploaded_by": profile["id"],
        }
        document = supabase.table("case_documents").insert(doc_payload).execute()
        document_row = (document.data or [doc_payload])[0]
        now = _now()
        supabase.table("document_request_uploads").insert({
            "request_id": request_id,
            "case_document_id": document_row.get("id"),
            "uploaded_by": profile["id"],
            "created_at": now,
        }).execute()
        supabase.table("document_requests").update({
            "status": "uploaded",
            "completed_at": now,
            "updated_at": now,
        }).eq("id", request_id).execute()
        return {"request_id": request_id, "document": document_row, "status": "uploaded"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Requested-document upload failed for %s", request_id)
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not upload the requested document.") from exc


@router.post("/document-requests/{request_id}/cancel")
async def cancel_document_request(request_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    record = _request_or_404(supabase, request_id)
    if record.get("requested_by") != profile.get("id"):
        raise HTTPException(status_code=403, detail="Only the requesting user can cancel this request.")
    supabase.table("document_requests").update({"status": "cancelled", "updated_at": _now()}).eq("id", request_id).execute()
    return {"status": "cancelled"}


@router.get("/settlement-payouts")
async def list_settlement_payout_ledgers(authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    response = (
        supabase.table("settlement_payout_ledgers")
        .select("*")
        .eq("owner_id", profile["id"])
        .order("updated_at", desc=True)
        .execute()
    )
    ledgers = response.data or []
    if not ledgers:
        return []
    case_ids = list({row["case_id"] for row in ledgers if row.get("case_id")})
    cases = supabase.table("cases").select("id, case_number, plaintiff_name").in_("id", case_ids).execute()
    case_map = {row["id"]: row for row in (cases.data or [])}
    payouts = supabase.table("settlement_payouts").select("ledger_id, amount").in_("ledger_id", [row["id"] for row in ledgers]).execute()
    received = {}
    for payout in payouts.data or []:
        received[payout["ledger_id"]] = received.get(payout["ledger_id"], Decimal("0")) + Decimal(str(payout.get("amount") or 0))
    for ledger in ledgers:
        case = case_map.get(ledger.get("case_id"), {})
        expected = Decimal(str(ledger.get("expected_amount") or 0))
        paid = received.get(ledger["id"], Decimal("0"))
        ledger["case_name"] = case.get("case_number") or case.get("plaintiff_name") or "Case"
        ledger["received_amount"] = _money(paid)
        ledger["outstanding_amount"] = _money(max(Decimal("0"), expected - paid))
    return ledgers


@router.post("/settlement-payouts", status_code=status.HTTP_201_CREATED)
async def create_settlement_payout_ledger(body: PayoutLedgerCreate, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    case = _case_or_404(supabase, body.case_id)
    settlement = Decimal(str(body.settlement_amount))
    court_costs = Decimal(str(body.court_costs))
    client_payouts = Decimal(str(body.client_payouts))
    percentage = Decimal(str(body.percentage))
    net_split_amount, expected, attorney_remainder = _payout_split(settlement, court_costs, client_payouts, percentage)
    existing = (
        supabase.table("settlement_payout_ledgers")
        .select("id")
        .eq("case_id", body.case_id)
        .eq("owner_id", profile["id"])
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="You already have a private payout ledger for this case.")
    now = _now()
    payload = {
        "case_id": body.case_id,
        "client_id": case["client_id"],
        "owner_id": profile["id"],
        "settlement_amount": _money(settlement),
        "court_costs": _money(court_costs),
        "client_payouts": _money(client_payouts),
        "net_split_amount": net_split_amount,
        "percentage": _money(percentage),
        "expected_amount": expected,
        "attorney_remainder": attorney_remainder,
        "notes": (body.notes or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    response = supabase.table("settlement_payout_ledgers").insert(payload).execute()
    return (response.data or [payload])[0]


@router.patch("/settlement-payouts/{ledger_id}")
async def update_settlement_payout_ledger(ledger_id: str, body: PayoutLedgerUpdate, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    existing = supabase.table("settlement_payout_ledgers").select("*").eq("id", ledger_id).eq("owner_id", profile["id"]).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Private payout ledger not found.")
    current = existing.data[0]
    settlement = Decimal(str(body.settlement_amount if body.settlement_amount is not None else current.get("settlement_amount") or 0))
    court_costs = Decimal(str(body.court_costs if body.court_costs is not None else current.get("court_costs") or 0))
    client_payouts = Decimal(str(body.client_payouts if body.client_payouts is not None else current.get("client_payouts") or 0))
    percentage = Decimal(str(body.percentage if body.percentage is not None else current.get("percentage") or 35))
    net_split_amount, expected_amount, attorney_remainder = _payout_split(settlement, court_costs, client_payouts, percentage)
    update = {
        "settlement_amount": _money(settlement),
        "court_costs": _money(court_costs),
        "client_payouts": _money(client_payouts),
        "net_split_amount": net_split_amount,
        "percentage": _money(percentage),
        "expected_amount": expected_amount,
        "attorney_remainder": attorney_remainder,
        "updated_at": _now(),
    }
    if body.notes is not None:
        update["notes"] = body.notes.strip() or None
    response = supabase.table("settlement_payout_ledgers").update(update).eq("id", ledger_id).eq("owner_id", profile["id"]).execute()
    return (response.data or [{**current, **update}])[0]


@router.get("/settlement-payouts/{ledger_id}/payments")
async def list_settlement_payouts(ledger_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    ledger = supabase.table("settlement_payout_ledgers").select("id").eq("id", ledger_id).eq("owner_id", profile["id"]).limit(1).execute()
    if not ledger.data:
        raise HTTPException(status_code=404, detail="Private payout ledger not found.")
    response = supabase.table("settlement_payouts").select("*").eq("ledger_id", ledger_id).order("paid_on", desc=True).execute()
    return response.data or []


@router.post("/settlement-payouts/{ledger_id}/payments", status_code=status.HTTP_201_CREATED)
async def record_settlement_payout(ledger_id: str, body: PayoutCreate, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    ledger = supabase.table("settlement_payout_ledgers").select("id").eq("id", ledger_id).eq("owner_id", profile["id"]).limit(1).execute()
    if not ledger.data:
        raise HTTPException(status_code=404, detail="Private payout ledger not found.")
    payload = {
        "ledger_id": ledger_id,
        "amount": _money(Decimal(str(body.amount))),
        "paid_on": body.paid_on.isoformat(),
        "payment_method": (body.payment_method or "").strip() or None,
        "reference": (body.reference or "").strip() or None,
        "notes": (body.notes or "").strip() or None,
        "recorded_by": profile["id"],
        "created_at": _now(),
    }
    response = supabase.table("settlement_payouts").insert(payload).execute()
    return (response.data or [payload])[0]
