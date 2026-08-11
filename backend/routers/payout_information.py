"""Secure client payout-information request workflow.

ACH routing and account numbers are field-level encrypted before storage, excluded
from ordinary request APIs, and disclosed only through an authenticated,
attorney-authorized, audited reveal action.  The client submits information only
from their authenticated LegalFlow case portal; sensitive values never appear in
email messages, case documents, or application logs.
"""

import logging
import os
import secrets
import uuid
from datetime import date, datetime, timezone
from html import escape
from typing import Literal, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

from utils.email_service import send_email
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()
STAFF_ROLES = {"attorney", "staff_attorney"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _current_profile(authorization: str) -> dict:
    from routers.cases import get_current_user

    return await get_current_user(authorization)


def _require_staff(profile: dict) -> None:
    if profile.get("role") not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Attorney or staff access required.")


def _cipher() -> Fernet:
    """Return the server-only payout cipher and fail closed if unavailable.

    PAYOUT_ENCRYPTION_KEY is intentionally dedicated to payout information.  The
    existing W9_ENCRYPTION_KEY is accepted only as a backwards-compatible secure
    fallback for LegalFlow environments that already hold the established PII key.
    """
    key = (os.getenv("PAYOUT_ENCRYPTION_KEY") or os.getenv("W9_ENCRYPTION_KEY") or "").strip()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Secure payout storage is not configured. Ask an administrator to configure PAYOUT_ENCRYPTION_KEY.",
        )
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        logger.error("Payout encryption key is invalid")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Secure payout storage is unavailable. Ask an administrator to review the encryption configuration.",
        ) from exc


def _encrypt(value: str) -> str:
    return _cipher().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt(value: str) -> str:
    try:
        return _cipher().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        logger.error("Payout information could not be decrypted")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Secure payout information is unavailable.") from exc


def _digits(value: str) -> str:
    return "".join(character for character in str(value or "") if character.isdigit())


def _audit_client_ip(request: Request) -> tuple[str, str]:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        client_ip = forwarded_for.split(",", 1)[0].strip()
        if client_ip:
            return client_ip, "x-forwarded-for"
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip, "x-real-ip"
    if request.client and request.client.host:
        return request.client.host, "request.client"
    return "unknown", "unavailable"


def _case_or_404(supabase, case_id: str) -> dict:
    result = (
        supabase.table("cases")
        .select("id,client_id,case_number,plaintiff_name")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return result.data[0]


def _case_assigned_attorney_id(supabase, client_id: str) -> Optional[str]:
    profile = (
        supabase.table("profiles")
        .select("assigned_attorney_id")
        .eq("id", client_id)
        .limit(1)
        .execute()
    )
    return (profile.data or [{}])[0].get("assigned_attorney_id")


def _request_or_404(supabase, payout_request_id: str) -> dict:
    result = (
        supabase.table("client_payout_information_requests")
        .select("*")
        .eq("id", payout_request_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout information request not found.")
    return result.data[0]


def _authorized_staff_for_request(supabase, payout_request: dict, profile: dict) -> None:
    """Allow only the request sender or the case's assigned attorney to review."""
    _require_staff(profile)
    assigned_attorney_id = _case_assigned_attorney_id(supabase, payout_request["client_id"])
    if profile.get("id") not in {payout_request.get("requested_by"), assigned_attorney_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to review this client's payout information.")


def _safe_summary(payout_request: dict, submission: Optional[dict] = None) -> dict:
    """Return list/detail metadata without ACH routing or account numbers."""
    summary = {
        "id": payout_request.get("id"),
        "case_id": payout_request.get("case_id"),
        "client_id": payout_request.get("client_id"),
        "requested_by": payout_request.get("requested_by"),
        "message": payout_request.get("message"),
        "due_date": payout_request.get("due_date"),
        "status": payout_request.get("status"),
        "sent_at": payout_request.get("sent_at"),
        "created_at": payout_request.get("created_at"),
        "updated_at": payout_request.get("updated_at"),
        "completed_at": payout_request.get("completed_at"),
    }
    if submission:
        summary["submission"] = {
            "account_holder_name": submission.get("account_holder_name"),
            "account_type": submission.get("account_type"),
            "bank_name": submission.get("bank_name"),
            "account_number_last4": submission.get("account_number_last4"),
            "submitted_at": submission.get("submitted_at"),
            "certified_at": submission.get("certified_at"),
        }
    return summary


def _submission_for_request(supabase, payout_request_id: str) -> Optional[dict]:
    result = (
        supabase.table("client_payout_information_submissions")
        .select("*")
        .eq("request_id", payout_request_id)
        .limit(1)
        .execute()
    )
    return (result.data or [None])[0]


class PayoutInformationRequestCreate(BaseModel):
    message: Optional[str] = Field(default=None, max_length=2000)
    due_date: Optional[date] = None


class PayoutInformationSubmission(BaseModel):
    account_holder_name: str = Field(min_length=2, max_length=160)
    account_type: Literal["checking", "savings"]
    bank_name: Optional[str] = Field(default=None, max_length=160)
    routing_number: str = Field(min_length=9, max_length=32)
    account_number: str = Field(min_length=4, max_length=32)
    authorized: bool

    @field_validator("routing_number")
    @classmethod
    def validate_routing_number(cls, value: str) -> str:
        digits = _digits(value)
        if len(digits) != 9:
            raise ValueError("Enter a valid 9-digit routing number.")
        return digits

    @field_validator("account_number")
    @classmethod
    def validate_account_number(cls, value: str) -> str:
        digits = _digits(value)
        if not 4 <= len(digits) <= 17:
            raise ValueError("Enter a valid account number.")
        return digits


@router.get("/cases/{case_id}/payout-information-requests")
async def list_payout_information_requests(case_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    supabase = get_supabase()
    case = _case_or_404(supabase, case_id)
    if profile.get("role") == "client" and case.get("client_id") != profile.get("id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this case.")
    if profile.get("role") != "client":
        _require_staff(profile)

    rows = (
        supabase.table("client_payout_information_requests")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    if profile.get("role") == "client":
        return [_safe_summary(row) for row in rows]

    visible = []
    for row in rows:
        try:
            _authorized_staff_for_request(supabase, row, profile)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                continue
            raise
        visible.append(_safe_summary(row, _submission_for_request(supabase, row["id"])))
    return visible


@router.post("/cases/{case_id}/payout-information-requests", status_code=status.HTTP_201_CREATED)
async def create_payout_information_request(
    case_id: str,
    body: PayoutInformationRequestCreate,
    authorization: str = Header(...),
):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    case = _case_or_404(supabase, case_id)
    request_id = str(uuid.uuid4())
    now = _now()
    message = (body.message or "").strip() or "Please provide your ACH payment information so the attorney can send your settlement proceeds securely."
    payload = {
        "id": request_id,
        "case_id": case_id,
        "client_id": case["client_id"],
        "requested_by": profile["id"],
        "message": message,
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "status": "requested",
        "created_at": now,
        "updated_at": now,
    }
    created = supabase.table("client_payout_information_requests").insert(payload).execute()
    record = (created.data or [payload])[0]

    # The email contains only a portal link—never bank details or form fields.
    client_result = (
        supabase.table("profiles")
        .select("full_name,email")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    client = (client_result.data or [None])[0]
    if client and client.get("email"):
        frontend_url = os.environ.get("FRONTEND_URL", "https://legalflow.me").rstrip("/")
        due_line = f"<p><strong>Please complete by:</strong> {escape(body.due_date.strftime('%B %d, %Y'))}</p>" if body.due_date else ""
        try:
            delivered = await send_email(
                to=client["email"],
                subject="Action required: provide payout information securely",
                body=(
                    f"<p>Hello {escape(str(client.get('full_name') or 'there'))},</p>"
                    "<p>Your LegalFlow team needs your secure ACH payment information to prepare a client payout.</p>"
                    f"<p>{escape(message)}</p>"
                    f"{due_line}"
                    f"<p><a href=\"{frontend_url}/client/cases/{case_id}\">Open your secure LegalFlow case portal</a> to complete the form.</p>"
                    "<p><strong>For your protection, do not reply to this email with banking details.</strong></p>"
                ),
                idempotency_key=f"payout-information-request:{request_id}",
            )
            if delivered:
                sent_at = _now()
                supabase.table("client_payout_information_requests").update({"sent_at": sent_at, "updated_at": sent_at}).eq("id", request_id).execute()
                record["sent_at"] = sent_at
        except Exception:
            logger.exception("Could not deliver payout-information request notification %s", request_id)
    return _safe_summary(record)


@router.post("/payout-information-requests/{payout_request_id}/submit", status_code=status.HTTP_201_CREATED)
async def submit_payout_information(
    payout_request_id: str,
    body: PayoutInformationSubmission,
    request: Request,
    authorization: str = Header(...),
):
    profile = await _current_profile(authorization)
    if profile.get("role") != "client":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the client can submit payout information.")
    if not body.authorized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please confirm that the payment information is accurate and authorized.")

    supabase = get_supabase()
    payout_request = _request_or_404(supabase, payout_request_id)
    if payout_request.get("client_id") != profile.get("id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this payout-information request.")
    if payout_request.get("status") == "cancelled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This payout-information request has been cancelled.")
    if payout_request.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This payout-information request has already been submitted.")

    existing = _submission_for_request(supabase, payout_request_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This payout-information request has already been submitted.")

    client_ip, ip_source = _audit_client_ip(request)
    now = _now()
    submission_payload = {
        "id": str(uuid.uuid4()),
        "request_id": payout_request_id,
        "account_holder_name": body.account_holder_name.strip(),
        "account_type": body.account_type,
        "bank_name": (body.bank_name or "").strip() or None,
        "routing_number_encrypted": _encrypt(body.routing_number),
        "account_number_encrypted": _encrypt(body.account_number),
        "account_number_last4": body.account_number[-4:],
        "certified_at": now,
        "submitted_at": now,
        "signer_ip": client_ip,
        "ip_source": ip_source,
        "user_agent": request.headers.get("user-agent", "")[:1000] or None,
    }
    try:
        supabase.table("client_payout_information_submissions").insert(submission_payload).execute()
        supabase.table("client_payout_information_requests").update({
            "status": "completed",
            "completed_at": now,
            "updated_at": now,
        }).eq("id", payout_request_id).execute()
        supabase.table("payout_information_access_audit").insert({
            "id": str(uuid.uuid4()),
            "request_id": payout_request_id,
            "actor_id": profile["id"],
            "action": "submitted",
            "actor_ip": client_ip,
            "ip_source": ip_source,
            "created_at": now,
        }).execute()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Payout-information submission failed for request %s", payout_request_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save your payout information securely. Please try again.") from exc

    return {"request_id": payout_request_id, "status": "completed", "account_number_last4": body.account_number[-4:]}


@router.get("/payout-information-requests/{payout_request_id}")
async def get_payout_information_request(payout_request_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    supabase = get_supabase()
    payout_request = _request_or_404(supabase, payout_request_id)
    if profile.get("role") == "client":
        if payout_request.get("client_id") != profile.get("id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this payout-information request.")
        return _safe_summary(payout_request)
    _authorized_staff_for_request(supabase, payout_request, profile)
    return _safe_summary(payout_request, _submission_for_request(supabase, payout_request_id))


@router.post("/payout-information-requests/{payout_request_id}/reveal")
async def reveal_payout_information(
    payout_request_id: str,
    request: Request,
    authorization: str = Header(...),
):
    """Return decrypted ACH details to an authorized attorney and record the event."""
    profile = await _current_profile(authorization)
    supabase = get_supabase()
    payout_request = _request_or_404(supabase, payout_request_id)
    _authorized_staff_for_request(supabase, payout_request, profile)
    submission = _submission_for_request(supabase, payout_request_id)
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The client has not submitted payout information yet.")

    actor_ip, ip_source = _audit_client_ip(request)
    now = _now()
    try:
        supabase.table("payout_information_access_audit").insert({
            "id": str(uuid.uuid4()),
            "request_id": payout_request_id,
            "actor_id": profile["id"],
            "action": "revealed",
            "actor_ip": actor_ip,
            "ip_source": ip_source,
            "created_at": now,
        }).execute()
    except Exception:
        logger.exception("Could not record payout-information reveal audit for %s", payout_request_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not open payout information securely.")

    return {
        "account_holder_name": submission.get("account_holder_name"),
        "account_type": submission.get("account_type"),
        "bank_name": submission.get("bank_name"),
        "routing_number": _decrypt(submission["routing_number_encrypted"]),
        "account_number": _decrypt(submission["account_number_encrypted"]),
        "account_number_last4": submission.get("account_number_last4"),
        "submitted_at": submission.get("submitted_at"),
        "revealed_at": now,
    }


@router.post("/payout-information-requests/{payout_request_id}/cancel")
async def cancel_payout_information_request(payout_request_id: str, authorization: str = Header(...)):
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    payout_request = _request_or_404(supabase, payout_request_id)
    if payout_request.get("requested_by") != profile.get("id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the user who sent this request can cancel it.")
    if payout_request.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed payout information requests cannot be cancelled.")
    now = _now()
    supabase.table("client_payout_information_requests").update({"status": "cancelled", "updated_at": now}).eq("id", payout_request_id).execute()
    return {"id": payout_request_id, "status": "cancelled"}
