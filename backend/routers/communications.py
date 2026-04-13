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
from typing import Optional

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
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Only attorneys can send communications.")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SendEmailPayload(BaseModel):
    client_id: str
    to_email: str
    subject: str
    body: str
    case_id: Optional[str] = None


class SendSMSPayload(BaseModel):
    client_id: str
    to_phone: str
    body: str
    case_id: Optional[str] = None


# ---------------------------------------------------------------------------
# GET /config — check what's configured
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_config(authorization: str = Header(...)):
    """Return which communication channels are configured."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    smtp_configured = bool(
        os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")
    )
    twilio_configured = bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_PHONE_NUMBER")
    )

    return {
        "email": smtp_configured,
        "sms": twilio_configured,
        "smtp_from": os.environ.get("EMAIL_FROM", ""),
        "twilio_number": os.environ.get("TWILIO_PHONE_NUMBER", "")[-4:] if os.environ.get("TWILIO_PHONE_NUMBER") else "",
    }


# ---------------------------------------------------------------------------
# GET /history/{client_id} — get communication history
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

    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    email_from = os.environ.get("EMAIL_FROM", smtp_user)

    if not smtp_host or not smtp_user:
        # Still log it even if we can't send
        record = supabase.table("communications").insert({
            "client_id": payload.client_id,
            "case_id": payload.case_id,
            "channel": "email",
            "direction": "outbound",
            "recipient": payload.to_email,
            "subject": payload.subject,
            "body": payload.body,
            "status": "failed",
            "error_message": "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASSWORD to Railway.",
            "sent_by": profile["id"],
        }).execute()
        return {
            "status": "failed",
            "error": "SMTP not configured",
            "record": record.data[0] if record.data else None,
        }

    # Build and send the email
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{profile.get('firm_name') or profile.get('full_name', 'LegalFlow')} <{email_from}>"
    msg["To"] = payload.to_email
    msg["Subject"] = payload.subject
    msg.attach(MIMEText(payload.body, "plain"))
    msg.attach(MIMEText(f"<div style='font-family:sans-serif;font-size:14px;'>{payload.body.replace(chr(10), '<br>')}</div>", "html"))

    error_message = None
    send_status = "sent"

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        logger.info(f"Email sent to {payload.to_email}: {payload.subject}")
    except Exception as e:
        error_message = str(e)
        send_status = "failed"
        logger.error(f"Email failed to {payload.to_email}: {e}")

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
    }).execute()

    return {
        "status": send_status,
        "error": error_message,
        "record": record.data[0] if record.data else None,
    }
