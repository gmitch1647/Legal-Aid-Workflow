"""
Communications router — send emails and SMS to clients.

Email uses SMTP (configured via env vars).
SMS uses Twilio (optional — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
TWILIO_PHONE_NUMBER to Railway env vars).
"""

import base64
import json
import re
import uuid
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase


def _email_address(value: str | None) -> str:
    from email.utils import parseaddr
    return parseaddr(str(value or ""))[1].strip().lower()


def _communication_reply_address(recipient_type: str, recipient_id: str) -> str | None:
    domain = str(os.environ.get("RESEND_RECEIVING_DOMAIN") or "").strip().lower()
    if not domain or "@" in domain or any(char.isspace() for char in domain):
        return None
    return f"comm+{recipient_type}+{recipient_id}@{domain}"


def _communication_target_from_address(address: str) -> tuple[str, str] | None:
    local = _email_address(address).split("@", 1)[0]
    match = re.fullmatch(r"comm\+(client|attorney)\+([0-9a-fA-F-]{36})", local)
    return (match.group(1), match.group(2)) if match else None


def _safe_inbound_text(text: str | None, html_body: str | None = None) -> str:
    import html
    import re as _re
    content = str(text or "").strip()
    if not content and html_body:
        content = _re.sub(r"<[^>]+>", " ", str(html_body))
        content = html.unescape(_re.sub(r"\s+", " ", content)).strip()
    return content[:10000]

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") not in {"attorney", "staff_attorney"}:
        raise HTTPException(status_code=403, detail="Only attorneys and staff attorneys can send communications.")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SendEmailPayload(BaseModel):
    client_id: str
    to_email: str
    subject: str
    body: str
    case_id: Optional[str] = None
    recipient_type: Literal["client", "attorney"] = "client"


class SendSMSPayload(BaseModel):
    client_id: str
    to_phone: str
    body: str
    case_id: Optional[str] = None
    recipient_type: Literal["client", "attorney"] = "client"


def _owner_notification_recipient(supabase) -> str | None:
    """Resolve the configured LegalFlow owner email without hard-coding a person."""
    try:
        reviewer = supabase.table("settlement_package_reviewers").select("owner_profile_id").eq("active", True).limit(1).execute()
        owner_id = ((reviewer.data or [None])[0] or {}).get("owner_profile_id")
        if owner_id:
            owner = supabase.table("profiles").select("email").eq("id", owner_id).limit(1).execute()
            email = str((((owner.data or [None])[0] or {}).get("email") or "")).strip()
            if email:
                return email
    except Exception:
        logger.warning("Could not resolve configured settlement-package owner for a Communications notification", exc_info=True)
    try:
        fallback = supabase.table("profiles").select("email").eq("role", "attorney").order("created_at").limit(1).execute()
        return str((((fallback.data or [None])[0] or {}).get("email") or "")).strip() or None
    except Exception:
        return None


async def _notify_owner_of_inbound_message(supabase, sender: str, subject: str | None, body: str, recipient_label: str) -> None:
    """Email the configured owner after a message is stored in Communications."""
    owner_email = _owner_notification_recipient(supabase)
    if not owner_email:
        return
    try:
        from html import escape
        from utils.email_service import send_email
        preview = escape(str(body or "").strip()[:600]).replace("\n", "<br>")
        safe_sender = escape(sender or recipient_label or "A contact")
        safe_subject = escape(subject or "No subject")
        await send_email(
            to=owner_email,
            subject=f"New LegalFlow message from {sender or recipient_label or 'a contact'}",
            body=(
                "<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;'>"
                "<h2>New message received in LegalFlow</h2>"
                f"<p><strong>From:</strong> {safe_sender}<br><strong>Subject:</strong> {safe_subject}</p>"
                f"<p>{preview}</p>"
                "<p><a href='https://legalflow.me/attorney/communications'>Open Communications</a> to view and reply.</p>"
                "</div>"
            ),
            idempotency_key=f"communications-inbound-owner:{uuid.uuid4()}",
        )
    except Exception:
        logger.exception("Could not send the owner notification for inbound Communications email")


# ---------------------------------------------------------------------------
# GET /config — check what's configured
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_config(authorization: str = Header(...)):
    """Return which communication channels are configured."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    resend_configured = bool(os.environ.get("RESEND_API_KEY"))
    smtp_configured = bool(
        os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")
    )
    twilio_configured = bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_PHONE_NUMBER")
    )

    return {
        "email": resend_configured or smtp_configured,
        "email_provider": "resend" if resend_configured else ("smtp" if smtp_configured else "none"),
        "sms": twilio_configured,
        "smtp_from": os.environ.get("EMAIL_FROM", ""),
        "twilio_number": os.environ.get("TWILIO_PHONE_NUMBER", "")[-4:] if os.environ.get("TWILIO_PHONE_NUMBER") else "",
    }


# ---------------------------------------------------------------------------
# GET /recipients/{recipient_type} — authorized communication directories
# ---------------------------------------------------------------------------

@router.get("/recipients/{recipient_type}")
async def get_recipients(
    recipient_type: Literal["client", "attorney"],
    authorization: str = Header(...),
):
    """Return contactable profiles for the selected Communications audience."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    roles = ["client"] if recipient_type == "client" else ["attorney", "staff_attorney"]
    result = (
        get_supabase().table("profiles")
        .select("id,full_name,email,phone,firm_name,role")
        .in_("role", roles)
        .order("full_name")
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# GET /threads — recent conversation threads and unread counts
# ---------------------------------------------------------------------------

@router.get("/threads")
async def get_communication_threads(authorization: str = Header(...)):
    """Return recently active client, attorney, and referral-partner conversations."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    rows = supabase.table("communications").select("id,client_id,recipient_type,direction,sender,recipient,subject,body,status,created_at,received_at,read_at").order("created_at", desc=True).limit(500).execute().data or []
    profile_ids = sorted({str(row.get("client_id")) for row in rows if row.get("client_id")})
    profiles = {}
    if profile_ids:
        profile_rows = supabase.table("profiles").select("id,full_name,email,phone,firm_name,role").in_("id", profile_ids).execute().data or []
        profiles = {str(item.get("id")): item for item in profile_rows}
    threads = {}
    for row in rows:
        recipient_id = str(row.get("client_id") or "")
        if not recipient_id:
            continue
        recipient_type = str(row.get("recipient_type") or "client")
        key = f"{recipient_type}:{recipient_id}"
        item = threads.setdefault(key, {"thread_id": key, "recipient_type": recipient_type, "recipient": profiles.get(recipient_id) or {"id": recipient_id, "full_name": row.get("recipient") or "Unknown recipient", "email": row.get("recipient")}, "last_message": None, "unread_count": 0, "last_activity_at": None})
        if item["last_message"] is None:
            item["last_message"] = row
            item["last_activity_at"] = row.get("received_at") or row.get("created_at")
        if row.get("direction") == "inbound" and not row.get("read_at"):
            item["unread_count"] += 1

    partner_rows = supabase.table("referral_partner_messages").select("id,referral_partner_id,channel,direction,sender,recipient,subject,body,status,created_at,received_at,read_at").order("created_at", desc=True).limit(500).execute().data or []
    partner_ids = sorted({str(row.get("referral_partner_id")) for row in partner_rows if row.get("referral_partner_id")})
    partners = {}
    if partner_ids:
        partner_data = supabase.table("referral_partners").select("id,full_name,email,phone,company").in_("id", partner_ids).execute().data or []
        partners = {str(item.get("id")): item for item in partner_data}
    for row in partner_rows:
        recipient_id = str(row.get("referral_partner_id") or "")
        if not recipient_id:
            continue
        key = f"referral_partner:{recipient_id}"
        item = threads.setdefault(key, {"thread_id": key, "recipient_type": "referral_partner", "recipient": partners.get(recipient_id) or {"id": recipient_id, "full_name": row.get("recipient") or "Referral partner", "email": row.get("recipient")}, "last_message": None, "unread_count": 0, "last_activity_at": None})
        if item["last_message"] is None:
            item["last_message"] = row
            item["last_activity_at"] = row.get("received_at") or row.get("created_at")
        if row.get("direction") == "inbound" and not row.get("read_at"):
            item["unread_count"] += 1
    return sorted(threads.values(), key=lambda item: item.get("last_activity_at") or "", reverse=True)


@router.post("/threads/{recipient_type}/{recipient_id}/read")
async def mark_communication_thread_read(recipient_type: Literal["client", "attorney", "referral_partner"], recipient_id: str, authorization: str = Header(...)):
    """Mark inbound messages as read when an authorized user opens a thread."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    if recipient_type == "referral_partner":
        supabase.table("referral_partner_messages").update({"read_at": now}).eq("referral_partner_id", recipient_id).eq("direction", "inbound").is_("read_at", "null").execute()
    else:
        supabase.table("communications").update({"read_at": now}).eq("client_id", recipient_id).eq("recipient_type", recipient_type).eq("direction", "inbound").is_("read_at", "null").execute()
    return {"marked_read": True}


# ---------------------------------------------------------------------------
# GET /history/{recipient_type}/{recipient_id} — typed message history
# ---------------------------------------------------------------------------

@router.get("/history/{recipient_type}/{recipient_id}")
async def get_typed_history(
    recipient_type: Literal["client", "attorney"],
    recipient_id: str,
    authorization: str = Header(...),
):
    """Return message history for one authorized client or attorney recipient."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    result = (
        get_supabase().table("communications")
        .select("*")
        .eq("client_id", recipient_id)
        .eq("recipient_type", recipient_type)
        .order("created_at", desc=False)
        .limit(100)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# GET /history/{client_id} — legacy client communication history
# ---------------------------------------------------------------------------

@router.get("/history/{client_id}")
async def get_history(
    client_id: str,
    authorization: str = Header(...),
):
    """Return all communications for a client, newest first."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    result = (
        supabase.table("communications")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# POST /email — send an email
# ---------------------------------------------------------------------------

@router.post("/email", status_code=status.HTTP_201_CREATED)
async def send_email(
    request: Request,
    authorization: str = Header(...),
):
    """Send an email from JSON or multipart form data with optional attachments."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    uploads = []
    if "multipart/form-data" in (request.headers.get("content-type") or ""):
        form = await request.form()
        try:
            payload = SendEmailPayload.model_validate(json.loads(str(form.get("payload") or "{}")))
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid email form data.") from exc
        uploads = [value for value in form.getlist("files") if hasattr(value, "read") and hasattr(value, "filename")]
    else:
        payload = SendEmailPayload.model_validate(await request.json())
    if len(uploads) > 10:
        raise HTTPException(status_code=413, detail="You can attach up to 10 files per email.")
    attachments = []
    total_bytes = 0
    for upload in uploads:
        content = await upload.read()
        total_bytes += len(content)
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"{upload.filename or 'Attachment'} is larger than 15 MB.")
        attachments.append({"filename": upload.filename or "attachment", "content": content})
    if total_bytes > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachments cannot exceed 25 MB total.")

    supabase = get_supabase()
    from utils.email_service import get_last_email_error, send_email as deliver_email
    reply_to = _communication_reply_address(payload.recipient_type, payload.client_id)
    delivered = await deliver_email(
        to=payload.to_email,
        subject=payload.subject,
        body=f"<div style='font-family:sans-serif;font-size:14px;line-height:1.6;'>{payload.body.replace(chr(10), '<br>')}</div>",
        attachments=attachments,
        reply_to=reply_to,
        idempotency_key=f"communications:{uuid.uuid4()}",
    )
    send_status = "sent" if delivered else "failed"
    error_message = None if delivered else (get_last_email_error() or "Email delivery failed")
    record = supabase.table("communications").insert({
        "client_id": payload.client_id,
        "case_id": payload.case_id,
        "channel": "email",
        "direction": "outbound",
        "recipient": payload.to_email,
        "subject": payload.subject,
        "body": payload.body,
        "status": send_status,
        "error_message": error_message,
        "sent_by": profile["id"],
        "recipient_type": payload.recipient_type,
        "metadata": {"reply_to": reply_to, "attachment_count": len(attachments), "provider": "shared_email_service"},
    }).execute()
    return {"status": send_status, "error": error_message, "record": record.data[0] if record.data else None}


@router.post("/webhooks/resend/inbound")
async def receive_communications_email_reply(request: Request):
    """Store a signed Resend reply in the correct client or attorney conversation."""
    signing_secret = str(os.environ.get("RESEND_WEBHOOK_SECRET") or "").strip()
    if not signing_secret:
        raise HTTPException(status_code=503, detail="Inbound email receiving is not configured")
    raw_body = await request.body()
    headers = {"svix-id": request.headers.get("svix-id", ""), "svix-timestamp": request.headers.get("svix-timestamp", ""), "svix-signature": request.headers.get("svix-signature", "")}
    if not all(headers.values()):
        raise HTTPException(status_code=401, detail="Missing Resend webhook signature")
    try:
        from svix.webhooks import Webhook
        event = Webhook(signing_secret).verify(raw_body.decode("utf-8"), headers)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Resend webhook signature") from exc
    if event.get("type") != "email.received":
        return {"received": False, "ignored": True}
    data = event.get("data") or {}
    email_id = str(data.get("email_id") or "").strip()
    event_id = str(request.headers.get("svix-id") or email_id).strip()
    recipients = data.get("to") or data.get("received_for") or []
    if isinstance(recipients, str): recipients = [recipients]
    target = next((_communication_target_from_address(str(address)) for address in recipients if _communication_target_from_address(str(address))), None)
    if not email_id or not target:
        return {"received": False, "ignored": True}
    recipient_type, recipient_id = target
    supabase = get_supabase()
    duplicate = supabase.table("communications").select("id").eq("provider_event_id", event_id).limit(1).execute()
    if duplicate.data:
        return {"received": True, "duplicate": True}
    profile_result = supabase.table("profiles").select("id,email").eq("id", recipient_id).limit(1).execute()
    target_profile = (profile_result.data or [None])[0]
    if not target_profile:
        return {"received": False, "ignored": True}
    source_address = _email_address(data.get("from"))
    if not source_address or source_address != _email_address(target_profile.get("email")):
        return {"received": False, "ignored": True}
    resend_key = str(os.environ.get("RESEND_API_KEY") or "").strip()
    if not resend_key:
        raise HTTPException(status_code=503, detail="Inbound email content retrieval is not configured")
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        content_response = await client.get(f"https://api.resend.com/emails/receiving/{email_id}", headers={"Authorization": f"Bearer {resend_key}"})
    if content_response.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not retrieve inbound email content")
    inbound = content_response.json()
    body = _safe_inbound_text(inbound.get("text"), inbound.get("html"))
    if not body:
        return {"received": False, "ignored": True}
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": str(uuid.uuid4()), "client_id": recipient_id, "channel": "email", "direction": "inbound", "sender": source_address, "recipient": _email_address((inbound.get("to") or [""])[0]), "subject": str(inbound.get("subject") or data.get("subject") or "").strip()[:200] or None, "body": body, "status": "received", "recipient_type": recipient_type, "provider_message_id": str(inbound.get("message_id") or email_id), "provider_event_id": event_id, "received_at": now, "created_at": now}
    supabase.table("communications").insert(record).execute()
    await _notify_owner_of_inbound_message(supabase, source_address, record.get("subject"), body, target_profile.get("email") or "contact")
    return {"received": True}


# ---------------------------------------------------------------------------
# POST /sms — send an SMS via Twilio
# ---------------------------------------------------------------------------

@router.post("/sms", status_code=status.HTTP_201_CREATED)
async def send_sms(
    payload: SendSMSPayload,
    authorization: str = Header(...),
):
    """Send an SMS to a client via Twilio and log it."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_PHONE_NUMBER")

    if not account_sid or not auth_token or not from_number:
        record = supabase.table("communications").insert({
            "client_id": payload.client_id,
            "case_id": payload.case_id,
            "channel": "sms",
            "direction": "outbound",
            "recipient": payload.to_phone,
            "body": payload.body,
            "status": "failed",
            "error_message": "Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to Railway.",
            "sent_by": profile["id"],
            "recipient_type": payload.recipient_type,
        }).execute()
        return {
            "status": "failed",
            "error": "Twilio not configured",
            "record": record.data[0] if record.data else None,
        }

    error_message = None
    send_status = "sent"
    metadata = {}

    try:
        from twilio.rest import Client
        twilio_client = Client(account_sid, auth_token)
        message = twilio_client.messages.create(
            body=payload.body,
            from_=from_number,
            to=payload.to_phone,
        )
        metadata = {"sid": message.sid, "status": message.status}
        logger.info(f"SMS sent to {payload.to_phone}: {message.sid}")
    except ImportError:
        error_message = "twilio package not installed. Add 'twilio' to requirements.txt."
        send_status = "failed"
    except Exception as e:
        error_message = str(e)
        send_status = "failed"
        logger.error(f"SMS failed to {payload.to_phone}: {e}")

    record = supabase.table("communications").insert({
        "client_id": payload.client_id,
        "case_id": payload.case_id,
        "channel": "sms",
        "direction": "outbound",
        "recipient": payload.to_phone,
        "body": payload.body,
        "status": send_status,
        "error_message": error_message,
        "sent_by": profile["id"],
        "metadata": metadata if metadata else None,
        "recipient_type": payload.recipient_type,
    }).execute()

    return {
        "status": send_status,
        "error": error_message,
        "record": record.data[0] if record.data else None,
    }
