"""
Email service for the Legal Aid Workflow application.

Sends transactional emails via SMTP.  Every public function is
fire-and-forget: failures are logged but never propagated so that
the calling workflow is not interrupted by email issues.
"""

import base64
import logging
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── SMTP configuration from environment ─────────────────────────────────────

SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER: str = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL: str = os.environ.get("SMTP_FROM_EMAIL", SMTP_USER)
# Transactional notifications represent the LegalFlow platform. Keep the display
# name independent of legacy SMTP user settings so an individual profile name
# cannot unintentionally appear in client or partner mail.
PLATFORM_FROM_NAME: str = "LegalFlow"
SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")


# ── Core send helper ────────────────────────────────────────────────────────

_last_email_error: str | None = None


def get_last_email_error() -> str | None:
    return _last_email_error


async def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    idempotency_key: str | None = None,
    attachments: list[dict[str, Any]] | None = None,
    reply_to: str | None = None,
) -> bool:
    """Send one HTML email via Resend (primary) or SMTP (fallback).

    ``idempotency_key`` is forwarded only to Resend. Callers that can retry a
    delivery should supply a stable, per-message key so a recovered request
    does not create a second invitation. Attachments use ``filename`` and
    byte ``content`` values and are encoded only at the email-provider edge.
    """
    global _last_email_error
    _last_email_error = None

    resend_key = os.environ.get("RESEND_API_KEY", "")
    email_from = os.environ.get("EMAIL_FROM", SMTP_FROM_EMAIL or "onboarding@resend.dev")

    normalized_attachments: list[dict[str, Any]] = []
    for attachment in attachments or []:
        filename = str(attachment.get("filename") or "document.pdf").replace("\r", "").replace("\n", "")
        content = attachment.get("content")
        if not isinstance(content, (bytes, bytearray)):
            logger.warning("Skipping email attachment with invalid content type: %s", filename)
            continue
        normalized_attachments.append({"filename": filename, "content": bytes(content)})

    # Try Resend first
    if resend_key:
        try:
            import httpx
            from_header = f"{PLATFORM_FROM_NAME} <{email_from}>"
            logger.info("Sending via Resend: from=%s to=%s subject=%s", from_header, to, subject)
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                        **({"Idempotency-Key": idempotency_key} if idempotency_key else {}),
                    },
                    json={
                        "from": from_header,
                        "to": [to],
                        "subject": subject,
                        "html": body,
                        **({"reply_to": [reply_to]} if reply_to else {}),
                        **({
                            "attachments": [
                                {
                                    "filename": attachment["filename"],
                                    "content": base64.b64encode(attachment["content"]).decode("ascii"),
                                }
                                for attachment in normalized_attachments
                            ]
                        } if normalized_attachments else {}),
                    },
                )
                if resp.status_code in (200, 201):
                    logger.info("Email sent via Resend to %s: %s", to, subject)
                    return True
                else:
                    _last_email_error = f"Resend HTTP {resp.status_code}: {resp.text[:300]}"
                    logger.warning("Resend failed: %s", _last_email_error)
        except Exception as e:
            _last_email_error = f"Resend exception: {e}"
            logger.warning("Resend error: %s", e)
    else:
        _last_email_error = "RESEND_API_KEY not set"
        logger.warning("RESEND_API_KEY not configured")

    # Fallback to SMTP
    if not SMTP_HOST:
        if not _last_email_error:
            _last_email_error = "No email provider configured"
        logger.warning("No email provider configured – skipping email to %s", to)
        return False

    try:
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{PLATFORM_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"] = to
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to
        alternatives = MIMEMultipart("alternative")
        alternatives.attach(MIMEText(body, "html", "utf-8"))
        msg.attach(alternatives)
        for attachment in normalized_attachments:
            file_part = MIMEApplication(attachment["content"], Name=attachment["filename"])
            file_part.add_header("Content-Disposition", "attachment", filename=attachment["filename"])
            msg.attach(file_part)

        if SMTP_USE_TLS:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
            server.ehlo()
            server.starttls()
            server.ehlo()
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
            server.ehlo()

        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)

        server.sendmail(SMTP_FROM_EMAIL, [to], msg.as_string())
        server.quit()

        logger.info("Email sent to %s – subject: %s", to, subject)
        return True

    except Exception:
        logger.exception("Failed to send email to %s – subject: %s", to, subject)
        return False


# ── Convenience senders ─────────────────────────────────────────────────────

async def send_welcome_email(email: str, name: str, login_url: str) -> bool:
    """Welcome email sent after a new account is created."""
    subject = "Welcome to Legal Aid Workflow"
    body = f"""
    <html><body>
    <h2>Welcome, {name}!</h2>
    <p>Your account has been created successfully.</p>
    <p>You can log in at any time using the link below:</p>
    <p><a href="{login_url}">{login_url}</a></p>
    <p>If you have any questions, please don't hesitate to reach out.</p>
    <br>
    <p>— The Legal Aid Workflow Team</p>
    </body></html>
    """
    return await send_email(email, subject, body)


async def send_case_submitted_notification(attorney_email: str, client_name: str) -> bool:
    """Notify the attorney that a new case has been submitted."""
    subject = f"New Case Submission from {client_name}"
    body = f"""
    <html><body>
    <h2>New Case Submission</h2>
    <p><strong>{client_name}</strong> has submitted a new case for review.</p>
    <p>Please log in to the dashboard to review the submission and begin processing.</p>
    <br>
    <p>— Legal Aid Workflow</p>
    </body></html>
    """
    return await send_email(attorney_email, subject, body)


async def send_draft_ready_notification(
    attorney_email: str,
    client_name: str,
    defendant_names: list[str],
) -> bool:
    """Notify the attorney that an AI-generated complaint draft is ready for review."""
    defendants_display = ", ".join(defendant_names) if defendant_names else "N/A"
    subject = f"Complaint Draft Ready – {client_name}"
    body = f"""
    <html><body>
    <h2>Complaint Draft Ready for Review</h2>
    <p>A draft complaint has been generated for <strong>{client_name}</strong>'s case.</p>
    <p><strong>Defendants:</strong> {defendants_display}</p>
    <p>Please log in to review the draft, request revisions, or approve the complaint.</p>
    <br>
    <p>— Legal Aid Workflow</p>
    </body></html>
    """
    return await send_email(attorney_email, subject, body)


async def send_complaint_approved_notification(client_email: str, client_name: str) -> bool:
    """Notify the client that their complaint has been approved."""
    subject = "Your Complaint Has Been Approved"
    body = f"""
    <html><body>
    <h2>Good News, {client_name}!</h2>
    <p>Your attorney has reviewed and approved the complaint for your case.</p>
    <p>Please log in to your dashboard to view the finalised documents.</p>
    <br>
    <p>— Legal Aid Workflow</p>
    </body></html>
    """
    return await send_email(client_email, subject, body)


async def send_case_denied_notification(
    client_email: str,
    client_name: str,
    reason: str,
) -> bool:
    """Notify the client that their case has been denied."""
    subject = "Case Review Update"
    body = f"""
    <html><body>
    <h2>Case Update for {client_name}</h2>
    <p>After careful review, your attorney was unable to proceed with your case at this time.</p>
    <p><strong>Reason:</strong> {reason}</p>
    <p>If you have questions, please reach out to your attorney through the messaging portal.</p>
    <br>
    <p>— Legal Aid Workflow</p>
    </body></html>
    """
    return await send_email(client_email, subject, body)
