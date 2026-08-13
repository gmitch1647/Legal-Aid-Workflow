"""
Communications router — send emails and SMS to clients.

Email uses SMTP (configured via env vars).
SMS uses Twilio (optional — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
TWILIO_PHONE_NUMBER to Railway env vars).
"""

import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase

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
    payload: SendEmailPayload,
    authorization: str = Header(...),
):
    """Send an email to a client and log it."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    resend_key = os.environ.get("RESEND_API_KEY")
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    email_from = os.environ.get("EMAIL_FROM", smtp_user or "noreply@example.com")
    from_name = profile.get('firm_name') or 'LegalFlow'

    if not resend_key and not (smtp_host and smtp_user):
        record = supabase.table("communications").insert({
            "client_id": payload.client_id,
            "case_id": payload.case_id,
            "channel": "email",
            "direction": "outbound",
            "recipient": payload.to_email,
            "subject": payload.subject,
            "body": payload.body,
            "status": "failed",
            "error_message": "Email not configured. Add RESEND_API_KEY or SMTP settings to Railway.",
            "sent_by": profile["id"],
            "recipient_type": payload.recipient_type,
        }).execute()
        return {
            "status": "failed",
            "error": "Email not configured",
            "record": record.data[0] if record.data else None,
        }

    error_message = None
    send_status = "sent"

    if resend_key:
        # Send via Resend API
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": f"{from_name} <{email_from}>",
                        "to": [payload.to_email],
                        "subject": payload.subject,
                        "html": f"<div style='font-family:sans-serif;font-size:14px;line-height:1.6;'>{payload.body.replace(chr(10), '<br>')}</div>",
                        "text": payload.body,
                    },
                )
                if resp.status_code in (200, 201):
                    logger.info(f"Email sent via Resend to {payload.to_email}: {payload.subject}")
                else:
                    error_message = resp.text
                    send_status = "failed"
                    logger.error(f"Resend failed: {resp.status_code} {resp.text}")
        except Exception as e:
            error_message = str(e)
            send_status = "failed"
            logger.error(f"Resend error: {e}")
    else:
        # Fallback to SMTP
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{from_name} <{email_from}>"
        msg["To"] = payload.to_email
        msg["Subject"] = payload.subject
        msg.attach(MIMEText(payload.body, "plain"))
        msg.attach(MIMEText(f"<div style='font-family:sans-serif;font-size:14px;'>{payload.body.replace(chr(10), '<br>')}</div>", "html"))

        try:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            logger.info(f"Email sent via SMTP to {payload.to_email}: {payload.subject}")
        except Exception as e:
            error_message = str(e)
            send_status = "failed"
            logger.error(f"SMTP failed to {payload.to_email}: {e}")

    # Log the communication
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
    }).execute()

    return {
        "status": send_status,
        "error": error_message,
        "record": record.data[0] if record.data else None,
    }


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
