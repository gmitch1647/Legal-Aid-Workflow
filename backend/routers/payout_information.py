"""Secure client payout-information request workflow.

ACH routing and account numbers are field-level encrypted before storage, excluded
from ordinary request APIs, and disclosed only through an authenticated,
attorney-authorized, audited reveal action.  The client submits information through a private, expiring LegalFlow link;
sensitive values never appear in email messages, case documents, or application
logs. The link is a high-entropy bearer secret and does not require a client
account or LegalFlow sign-in.
"""

import logging
import os
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
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
DEFAULT_EXPIRY_DAYS = 14
MAX_EXPIRY_DAYS = 30


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _token() -> str:
    """Create a high-entropy URL-safe token for a single payout request."""
    return secrets.token_urlsafe(32)


def _public_payout_url(token: str) -> str:
    frontend_url = os.environ.get("FRONTEND_URL", "https://legalflow.me").rstrip("/")
    return f"{frontend_url}/payout-information/{token}"


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


def _owner_profile_id(supabase) -> Optional[str]:
    """Return the explicit active LegalFlow owner reviewer, never an inferred attorney."""
    try:
        response = (
            supabase.table("settlement_package_reviewers")
            .select("owner_profile_id")
            .eq("active", True)
            .limit(1)
            .execute()
        )
        return (response.data or [{}])[0].get("owner_profile_id")
    except Exception:
        logger.exception("Could not load the active payout owner reviewer")
        return None


def _is_owner_reviewer(supabase, profile: dict) -> bool:
    return bool(profile.get("id") and profile.get("id") == _owner_profile_id(supabase))


async def _notify_payout_information_completed(supabase, payout_request: dict) -> None:
    """Notify the configured LegalFlow owner after secure banking submission.

    The email intentionally contains no routing number, account number, bank name,
    or other payment details. Delivery is best effort and never invalidates a
    successfully stored submission.
    """
    try:
        owner_id = _owner_profile_id(supabase)
        if not owner_id:
            logger.warning("No active payout owner configured for request %s", payout_request.get("id"))
            return
        owner_response = (
            supabase.table("profiles")
            .select("id,email,full_name")
            .eq("id", owner_id)
            .limit(1)
            .execute()
        )
        owner = (owner_response.data or [None])[0]
        owner_email = str((owner or {}).get("email") or "").strip()
        if not owner_email:
            logger.warning("Payout owner %s has no email for request %s", owner_id, payout_request.get("id"))
            return

        client_response = (
            supabase.table("profiles")
            .select("full_name")
            .eq("id", payout_request.get("client_id"))
            .limit(1)
            .execute()
        )
        client_name = str(((client_response.data or [{}])[0]).get("full_name") or "The client").strip()
        case_id = str(payout_request.get("case_id") or "").strip()
        case_line = f"<p><strong>Case ID:</strong> {escape(case_id)}</p>" if case_id else ""
        delivered = await send_email(
            to=owner_email,
            subject="Banking Form Signed",
            body=(
                f"<p>Hello {escape(str((owner or {}).get('full_name') or 'there'))},</p>"
                f"<p><strong>{escape(client_name)}</strong> has completed the secure banking-information form.</p>"
                f"{case_line}"
                "<p>Open LegalFlow to review the submission through the authorized payout-information workflow.</p>"
                "<p style=\"font-size:12px;color:#64748b;\">For security, this email does not include banking details.</p>"
            ),
            idempotency_key=f"payout-information-completed:{payout_request.get('id')}",
        )
        if not delivered:
            logger.warning("Could not deliver payout completion notification for request %s", payout_request.get("id"))
    except Exception:
        logger.exception("Could not send payout completion notification for request %s", payout_request.get("id"))


async def _notify_payment_recorded(
    supabase,
    payout_request: dict,
    payment: dict,
    actor_profile: dict,
) -> None:
    """Email the client and owner after payment is recorded, without bank details."""
    try:
        case = _case_or_404(supabase, payout_request.get("case_id")) if payout_request.get("case_id") else {}
        client_response = (
            supabase.table("profiles")
            .select("full_name,email")
            .eq("id", payout_request.get("client_id"))
            .limit(1)
            .execute()
        )
        client = (client_response.data or [None])[0]
        owner_id = _owner_profile_id(supabase)
        owner_response = (
            supabase.table("profiles")
            .select("full_name,email")
            .eq("id", owner_id)
            .limit(1)
            .execute()
            if owner_id else None
        )
        owner = (owner_response.data or [None])[0] if owner_response else None
        recipients = []
        for profile in (client, owner):
            email = str((profile or {}).get("email") or "").strip()
            if email and email.lower() not in {item[0].lower() for item in recipients}:
                recipients.append((email, profile))
        if not recipients:
            logger.warning("No recipients for payment notification on request %s", payout_request.get("id"))
            return

        amount = payment.get("payment_amount")
        try:
            amount_label = f"${float(amount):,.2f}" if amount is not None else "an amount not specified"
        except (TypeError, ValueError):
            amount_label = "an amount not specified"
        matter = str(case.get("case_number") or case.get("plaintiff_name") or "your matter").strip()
        firm_name = str(actor_profile.get("firm_name") or "LegalFlow").strip()
        paid_at = str(payment.get("payment_sent_at") or "").strip()
        paid_date = paid_at[:10] if paid_at else "today"
        subject = f"Payment sent for {matter}"
        for recipient_email, recipient_profile in recipients:
            delivered = await send_email(
                to=recipient_email,
                subject=subject,
                body=(
                    f"<p>Hello {escape(str((recipient_profile or {}).get('full_name') or 'there'))},</p>"
                    f"<p>A payment of <strong>{escape(amount_label)}</strong> has been recorded for the matter <strong>{escape(matter)}</strong>.</p>"
                    f"<p><strong>Law firm:</strong> {escape(firm_name)}<br />"
                    f"<strong>Payment date:</strong> {escape(paid_date)}</p>"
                    "<p>This confirms that the payment was recorded as sent by the attorney. For security, this email does not include banking details.</p>"
                ),
                idempotency_key=f"client-payment-recorded:{payout_request.get('id')}:{recipient_email.lower()}",
            )
            if not delivered:
                logger.warning("Payment notification was not delivered to %s for request %s", recipient_email, payout_request.get("id"))
    except Exception:
        logger.exception("Could not send payment-recorded notifications for request %s", payout_request.get("id"))


def _payment_access_for_request(supabase, payout_request_id: str) -> Optional[dict]:
    response = (
        supabase.table("payout_attorney_payment_access")
        .select("*")
        .eq("request_id", payout_request_id)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def _append_payment_access(summary: dict, payment_access: Optional[dict], profile: dict, is_owner: bool) -> dict:
    """Attach release status only; never attach decrypted account data."""
    status_value = payment_access.get("status") if payment_access else None
    summary["payment_access"] = {
        "status": status_value or "not_released",
        "attorney_profile_id": payment_access.get("attorney_profile_id") if payment_access else None,
        "released_at": payment_access.get("released_at") if payment_access else None,
        "released_to_current_user": bool(payment_access and payment_access.get("attorney_profile_id") == profile.get("id") and status_value in {"released", "payment_marked_sent"}),
        "can_release": bool(is_owner and summary.get("status") == "completed" and status_value in {None, "revoked"}),
        "can_revoke": bool(is_owner and status_value in {"released", "payment_marked_sent"}),
        "can_mark_payment_sent": bool(payment_access and payment_access.get("attorney_profile_id") == profile.get("id") and status_value == "released"),
        "payment_amount": payment_access.get("payment_amount") if payment_access else None,
        "payment_sent_at": payment_access.get("payment_sent_at") if payment_access else None,
        "payment_reference": payment_access.get("payment_reference") if payment_access else None,
        "payment_note": payment_access.get("payment_note") if payment_access else None,
    }
    return summary


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


def _public_request_for_token(supabase, token: str, *, allow_completed: bool = False) -> dict:
    result = (
        supabase.table("client_payout_information_requests")
        .select("*")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This secure payout form is not available.")
    payout_request = result.data[0]
    if payout_request.get("status") == "cancelled":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This secure payout form has been cancelled.")
    expires_at = payout_request.get("expires_at")
    if expires_at and payout_request.get("status") != "completed":
        try:
            expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            expiry = expiry.replace(tzinfo=timezone.utc) if expiry.tzinfo is None else expiry.astimezone(timezone.utc)
            if expiry <= datetime.now(timezone.utc):
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="This secure payout form link has expired. Please contact your legal team for a new link.")
        except ValueError:
            logger.error("Invalid payout form expiration timestamp for request %s", payout_request.get("id"))
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="This secure payout form is temporarily unavailable.")
    if not allow_completed and payout_request.get("status") == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This secure payout form has already been submitted.")
    return payout_request


def _authorized_staff_for_request(supabase, payout_request: dict, profile: dict) -> None:
    """Allow the owner, or only an explicitly released assigned attorney, to review."""
    _require_staff(profile)
    if _is_owner_reviewer(supabase, profile):
        return
    payment_access = _payment_access_for_request(supabase, payout_request["id"])
    if payment_access and payment_access.get("attorney_profile_id") == profile.get("id") and payment_access.get("status") in {"released", "payment_marked_sent"}:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The owner has not released this client's payment details to you.")


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
        "expires_at": payout_request.get("expires_at"),
    }
    if submission:
        summary["submission"] = {
            "account_holder_name": submission.get("account_holder_name"),
            "account_type": submission.get("account_type"),
            "account_ownership": submission.get("account_ownership"),
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
    expires_in_days: int = Field(default=DEFAULT_EXPIRY_DAYS, ge=1, le=MAX_EXPIRY_DAYS)


class PayoutInformationSubmission(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    mailing_address: str = Field(min_length=6, max_length=500)
    account_holder_name: str = Field(min_length=2, max_length=160)
    account_ownership: Literal["personal", "business"]
    account_type: Literal["checking", "savings"]
    bank_name: Optional[str] = Field(default=None, max_length=160)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("Enter a valid email address.")
        return email

    @field_validator("mailing_address")
    @classmethod
    def validate_mailing_address(cls, value: str) -> str:
        address = " ".join(value.strip().split())
        if len(address) < 6:
            raise ValueError("Enter your complete mailing address.")
        return address

    @field_validator("account_holder_name")
    @classmethod
    def validate_account_holder_name(cls, value: str) -> str:
        name = value.strip()
        if len(name) < 2:
            raise ValueError("Enter the name shown on the bank account.")
        return name
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


class PayoutAttorneyRelease(BaseModel):
    attorney_profile_id: Optional[str] = None


class PayoutPaymentMarkedSent(BaseModel):
    payment_amount: Optional[float] = Field(default=None, ge=0, le=100000000)
    payment_sent_at: Optional[datetime] = None
    payment_reference: Optional[str] = Field(default=None, max_length=180)
    payment_note: Optional[str] = Field(default=None, max_length=1000)


@router.get("/payout-information-requests")
async def list_all_visible_payout_information_requests(authorization: str = Header(...)):
    """Return the current staff member's authorized payout request inbox.

    This endpoint deliberately returns only masked submission metadata. Full ACH
    details still require the existing per-request audited reveal endpoint.
    """
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    rows = (
        supabase.table("client_payout_information_requests")
        .select("*").order("created_at", desc=True).limit(250).execute()
    ).data or []

    visible = []
    case_ids = set()
    client_ids = set()
    is_owner = _is_owner_reviewer(supabase, profile)
    for row in rows:
        try:
            _authorized_staff_for_request(supabase, row, profile)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                continue
            raise
        summary = _safe_summary(row, _submission_for_request(supabase, row["id"]))
        visible.append(_append_payment_access(summary, _payment_access_for_request(supabase, row["id"]), profile, is_owner))
        if row.get("case_id"):
            case_ids.add(row["case_id"])
        if row.get("client_id"):
            client_ids.add(row["client_id"])

    cases_by_id = {}
    if case_ids:
        case_rows = supabase.table("cases").select("id,case_number,client_id").in_("id", list(case_ids)).execute().data or []
        cases_by_id = {row["id"]: row for row in case_rows}
    clients_by_id = {}
    if client_ids:
        client_rows = supabase.table("profiles").select("id,full_name,email").in_("id", list(client_ids)).execute().data or []
        clients_by_id = {row["id"]: row for row in client_rows}

    for summary in visible:
        case = cases_by_id.get(summary.get("case_id"), {})
        client = clients_by_id.get(summary.get("client_id"), {})
        summary["client_name"] = client.get("full_name") or "Client"
        summary["client_email"] = client.get("email") or ""
        summary["case_label"] = case.get("case_number") or "Case"
    return visible


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
    is_owner = _is_owner_reviewer(supabase, profile)
    for row in rows:
        try:
            _authorized_staff_for_request(supabase, row, profile)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                continue
            raise
        summary = _safe_summary(row, _submission_for_request(supabase, row["id"]))
        visible.append(_append_payment_access(summary, _payment_access_for_request(supabase, row["id"]), profile, is_owner))
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
    token = _token()
    requested_at = datetime.now(timezone.utc)
    now = requested_at.isoformat()
    expires_at = (requested_at + timedelta(days=body.expires_in_days)).isoformat()
    message = (body.message or "").strip() or "Please provide your ACH payment information so the attorney can send your settlement proceeds securely."
    payload = {
        "id": request_id,
        "case_id": case_id,
        "client_id": case["client_id"],
        "requested_by": profile["id"],
        "token": token,
        "message": message,
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "expires_at": expires_at,
        "status": "requested",
        "created_at": now,
        "updated_at": now,
    }
    created = supabase.table("client_payout_information_requests").insert(payload).execute()
    record = (created.data or [payload])[0]

    # The email contains a private, expiring form link—never bank details or form fields.
    client_result = (
        supabase.table("profiles")
        .select("full_name,email")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    client = (client_result.data or [None])[0]
    if client and client.get("email"):
        payout_form_url = _public_payout_url(token)
        due_line = f"<p><strong>Please complete by:</strong> {escape(body.due_date.strftime('%B %d, %Y'))}</p>" if body.due_date else ""
        expires_line = f"<p style=\"font-size:12px;color:#64748b;\">This private link expires on {escape((requested_at + timedelta(days=body.expires_in_days)).strftime('%B %d, %Y'))}. Do not forward it.</p>"
        try:
            delivered = await send_email(
                to=client["email"],
                subject="Action required: provide payout information securely",
                body=(
                    f"<p>Hello {escape(str(client.get('full_name') or 'there'))},</p>"
                    "<p>Your LegalFlow team needs your secure ACH payment information to prepare a client payout.</p>"
                    f"<p>{escape(message)}</p>"
                    f"{due_line}"
                    f"<p><a href=\"{payout_form_url}\" style=\"display:inline-block;background:#047857;color:#fff;padding:11px 20px;border-radius:7px;text-decoration:none;font-weight:600;\">Open secure payout form</a></p>"
                    "<p>You do not need to create a LegalFlow account or sign in to complete this form.</p>"
                    f"{expires_line}"
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


@router.get("/public/payout-information/{token}")
async def get_public_payout_information_form(token: str):
    """Load minimal form metadata and profile-based contact prefills through an expiring bearer link."""
    supabase = get_supabase()
    payout_request = _public_request_for_token(supabase, token, allow_completed=True)
    submission = _submission_for_request(supabase, payout_request["id"])
    client_result = (
        supabase.table("profiles")
        .select("email,address")
        .eq("id", payout_request["client_id"])
        .limit(1)
        .execute()
    )
    client = (client_result.data or [{}])[0]
    return {
        "status": payout_request.get("status"),
        "message": payout_request.get("message"),
        "due_date": payout_request.get("due_date"),
        "expires_at": payout_request.get("expires_at"),
        "submitted_at": submission.get("submitted_at") if submission else None,
        "account_number_last4": submission.get("account_number_last4") if submission else None,
        "prefill": {
            "email": str(client.get("email") or "").strip(),
            "mailing_address": str(client.get("address") or "").strip(),
        },
    }


@router.post("/public/payout-information/{token}/submit", status_code=status.HTTP_201_CREATED)
async def submit_public_payout_information(
    token: str,
    body: PayoutInformationSubmission,
    request: Request,
):
    """Persist encrypted ACH details through a single-use, expiring public link."""
    if not body.authorized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please confirm that the payment information is accurate and authorized.")

    supabase = get_supabase()
    payout_request = _public_request_for_token(supabase, token)
    existing = _submission_for_request(supabase, payout_request["id"])
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This secure payout form has already been submitted.")

    client_ip, ip_source = _audit_client_ip(request)
    now = _now()
    submission_payload = {
        "id": str(uuid.uuid4()),
        "request_id": payout_request["id"],
        "email_encrypted": _encrypt(body.email),
        "mailing_address_encrypted": _encrypt(body.mailing_address),
        "account_holder_name": body.account_holder_name,
        "account_ownership": body.account_ownership,
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
        }).eq("id", payout_request["id"]).execute()
        supabase.table("payout_information_access_audit").insert({
            "id": str(uuid.uuid4()),
            "request_id": payout_request["id"],
            "actor_id": None,
            "action": "submitted",
            "actor_ip": client_ip,
            "ip_source": ip_source,
            "created_at": now,
        }).execute()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Public payout-information submission failed for request %s", payout_request.get("id"))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save your payout information securely. Please try again.") from exc

    await _notify_payout_information_completed(supabase, payout_request)
    return {"status": "completed", "account_number_last4": body.account_number[-4:]}


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
        "email_encrypted": _encrypt(body.email),
        "mailing_address_encrypted": _encrypt(body.mailing_address),
        "account_holder_name": body.account_holder_name,
        "account_ownership": body.account_ownership,
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

    await _notify_payout_information_completed(supabase, payout_request)
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
    summary = _safe_summary(payout_request, _submission_for_request(supabase, payout_request_id))
    return _append_payment_access(summary, _payment_access_for_request(supabase, payout_request_id), profile, _is_owner_reviewer(supabase, profile))


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
        "account_ownership": submission.get("account_ownership"),
        "account_type": submission.get("account_type"),
        "bank_name": submission.get("bank_name"),
        "routing_number": _decrypt(submission["routing_number_encrypted"]),
        "account_number": _decrypt(submission["account_number_encrypted"]),
        "account_number_last4": submission.get("account_number_last4"),
        "email": _decrypt(submission["email_encrypted"]) if submission.get("email_encrypted") else None,
        "mailing_address": _decrypt(submission["mailing_address_encrypted"]) if submission.get("mailing_address_encrypted") else None,
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


@router.post("/payout-information-requests/{payout_request_id}/release-to-attorney")
async def release_payout_information_to_attorney(
    payout_request_id: str,
    body: PayoutAttorneyRelease,
    request: Request,
    authorization: str = Header(...),
):
    """Owner-only release of a completed bank form to one attorney profile."""
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    if not _is_owner_reviewer(supabase, profile):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the LegalFlow owner can release payment details to an attorney.")

    payout_request = _request_or_404(supabase, payout_request_id)
    if payout_request.get("status") != "completed" or not _submission_for_request(supabase, payout_request_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a submitted banking form can be released for payment.")

    attorney_profile_id = body.attorney_profile_id or _case_assigned_attorney_id(supabase, payout_request["client_id"])
    if not attorney_profile_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assign an attorney to this client before releasing payment details.")
    target_result = (
        supabase.table("profiles")
        .select("id,full_name,email,role")
        .eq("id", attorney_profile_id)
        .limit(1)
        .execute()
    )
    attorney = (target_result.data or [None])[0]
    if not attorney or attorney.get("role") not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select an active LegalFlow attorney or staff attorney.")

    now = _now()
    existing = _payment_access_for_request(supabase, payout_request_id)
    payload = {
        "request_id": payout_request_id,
        "attorney_profile_id": attorney_profile_id,
        "released_by": profile["id"],
        "released_at": now,
        "status": "released",
        "revoked_at": None,
        "revoked_by": None,
        "payment_amount": None,
        "payment_sent_at": None,
        "payment_reference": None,
        "payment_note": None,
        "payment_marked_by": None,
        "payment_marked_at": None,
        "updated_at": now,
    }
    if existing:
        supabase.table("payout_attorney_payment_access").update(payload).eq("id", existing["id"]).execute()
    else:
        payload["id"] = str(uuid.uuid4())
        supabase.table("payout_attorney_payment_access").insert(payload).execute()

    actor_ip, ip_source = _audit_client_ip(request)
    supabase.table("payout_information_access_audit").insert({
        "id": str(uuid.uuid4()), "request_id": payout_request_id, "actor_id": profile["id"],
        "action": "released_to_attorney", "actor_ip": actor_ip, "ip_source": ip_source, "created_at": now,
    }).execute()

    if attorney.get("email"):
        try:
            case = _case_or_404(supabase, payout_request["case_id"])
            client_result = supabase.table("profiles").select("full_name").eq("id", payout_request["client_id"]).limit(1).execute()
            client_name = ((client_result.data or [{}])[0].get("full_name") or "Client")
            await send_email(
                to=attorney["email"],
                subject=f"Payment details released: {client_name}",
                body=(
                    f"<p>Hello {escape(str(attorney.get('full_name') or 'Attorney'))},</p>"
                    f"<p>Gary Mitchell has released secure payout details for <strong>{escape(str(client_name))}</strong>"
                    f" ({escape(str(case.get('case_number') or 'case'))}).</p>"
                    "<p>Sign in to LegalFlow, open <strong>E-Signatures → Banking Forms</strong>, and use the audited secure view. "
                    "For security, this email contains no bank routing or account information.</p>"
                ),
                idempotency_key=f"payout-release:{payout_request_id}:{attorney_profile_id}:{now}",
            )
        except Exception:
            logger.exception("Payment release notification failed for %s", payout_request_id)

    summary = _safe_summary(payout_request, _submission_for_request(supabase, payout_request_id))
    return _append_payment_access(summary, _payment_access_for_request(supabase, payout_request_id), profile, True)


@router.post("/payout-information-requests/{payout_request_id}/revoke-attorney-access")
async def revoke_payout_information_attorney_access(
    payout_request_id: str,
    request: Request,
    authorization: str = Header(...),
):
    """Owner-only revocation of an attorney's payment-detail access."""
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    if not _is_owner_reviewer(supabase, profile):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the LegalFlow owner can revoke payment-detail access.")
    payout_request = _request_or_404(supabase, payout_request_id)
    payment_access = _payment_access_for_request(supabase, payout_request_id)
    if not payment_access or payment_access.get("status") not in {"released", "payment_marked_sent"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There is no active attorney payment access to revoke.")
    now = _now()
    supabase.table("payout_attorney_payment_access").update({
        "status": "revoked", "revoked_at": now, "revoked_by": profile["id"], "updated_at": now,
    }).eq("id", payment_access["id"]).execute()
    actor_ip, ip_source = _audit_client_ip(request)
    supabase.table("payout_information_access_audit").insert({
        "id": str(uuid.uuid4()), "request_id": payout_request_id, "actor_id": profile["id"],
        "action": "release_revoked", "actor_ip": actor_ip, "ip_source": ip_source, "created_at": now,
    }).execute()
    summary = _safe_summary(payout_request, _submission_for_request(supabase, payout_request_id))
    return _append_payment_access(summary, _payment_access_for_request(supabase, payout_request_id), profile, True)


@router.post("/payout-information-requests/{payout_request_id}/mark-payment-sent")
async def mark_payout_payment_sent(
    payout_request_id: str,
    body: PayoutPaymentMarkedSent,
    request: Request,
    authorization: str = Header(...),
):
    """Record an external payment after the released attorney has paid the client."""
    profile = await _current_profile(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    payout_request = _request_or_404(supabase, payout_request_id)
    payment_access = _payment_access_for_request(supabase, payout_request_id)
    if not payment_access or payment_access.get("status") != "released" or payment_access.get("attorney_profile_id") != profile.get("id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the attorney with active released payment access can mark this payment sent.")

    now = _now()
    sent_at = (body.payment_sent_at or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
    supabase.table("payout_attorney_payment_access").update({
        "status": "payment_marked_sent",
        "payment_amount": body.payment_amount,
        "payment_sent_at": sent_at,
        "payment_reference": (body.payment_reference or "").strip() or None,
        "payment_note": (body.payment_note or "").strip() or None,
        "payment_marked_by": profile["id"],
        "payment_marked_at": now,
        "updated_at": now,
    }).eq("id", payment_access["id"]).execute()
    actor_ip, ip_source = _audit_client_ip(request)
    supabase.table("payout_information_access_audit").insert({
        "id": str(uuid.uuid4()), "request_id": payout_request_id, "actor_id": profile["id"],
        "action": "payment_marked_sent", "actor_ip": actor_ip, "ip_source": ip_source, "created_at": now,
    }).execute()
    await _notify_payment_recorded(
        supabase,
        payout_request,
        {"payment_amount": body.payment_amount, "payment_sent_at": sent_at},
        profile,
    )
    summary = _safe_summary(payout_request, _submission_for_request(supabase, payout_request_id))
    return _append_payment_access(summary, _payment_access_for_request(supabase, payout_request_id), profile, False)
