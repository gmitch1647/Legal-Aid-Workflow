"""
Email service for the Legal Aid Workflow application.

Sends transactional emails via SMTP.  Every public function is
fire-and-forget: failures are logged but never propagated so that
the calling workflow is not interrupted by email issues.
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── SMTP configuration from environment ─────────────────────────────────────

SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER: str = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL: str = os.environ.get("SMTP_FROM_EMAIL", SMTP_USER)
SMTP_FROM_NAME: str = os.environ.get("SMTP_FROM_NAME", "Legal Aid Workflow")
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
) -> bool:
    """Send one HTML email via Resend (primary) or SMTP (fallback).

    ``idempotency_key`` is forwarded only to Resend. Callers that can retry a
    delivery should supply a stable, per-message key so a recovered request
    does not create a second invitation.
    """
    global _last_email_error
    _last_email_error = None

    resend_key = os.environ.get("RESEND_API_KEY", "")
    email_from = os.environ.get("EMAIL_FROM", SMTP_FROM_EMAIL or "onboarding@resend.dev")

    # Try Resend first
    if resend_key:
        try:
            import httpx
            from_header = f"{SMTP_FROM_NAME} <{email_from}>"
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
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))

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
