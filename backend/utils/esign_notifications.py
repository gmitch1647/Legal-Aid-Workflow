"""Shared E-Signature notification and reminder preference helpers.

The E-Signature routes use this module for attorney-facing view and signature
emails.  It keeps preferences in the attorney profile and records a timestamp
on the source request only after the email provider accepts delivery.
"""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
import logging
import os
import re
import unicodedata
from typing import Any

from utils.email_service import send_email

logger = logging.getLogger(__name__)

DEFAULT_ESIGN_PREFERENCES: dict[str, Any] = {
    "esign_document_viewed": True,
    "esign_document_signed": True,
    "esign_auto_reminders": True,
    "esign_reminder_initial_days": 2,
    "esign_reminder_interval_days": 3,
    "esign_reminder_max_count": 3,
}


DOCUMENT_TYPE_LABELS = {
    "settlement": "Settlement Agreement",
    "settlement_agreement": "Settlement Agreement",
    "closing_statement": "Closing Statement",
    "w9": "Form W-9",
    "credit_disclosure": "Credit Disclosure",
    "oise_engagement_agreement": "Oise Law Representation Agreement",
    "general": "Document",
}


def document_type_label(document_type: str | None) -> str:
    """Return a human-readable document label for an email or filename."""
    normalized = (document_type or "general").strip().lower()
    return DOCUMENT_TYPE_LABELS.get(normalized, normalized.replace("_", " ").title())


def _filename_segment(value: object, fallback: str) -> str:
    """Return a conservative, download-safe filename segment."""
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", ascii_value).strip("_")
    return cleaned[:120] or fallback


def signed_document_filename(record: dict[str, Any]) -> str:
    """Create a clear, safe signed-file download name from authoritative metadata."""
    client_name = _filename_segment(record.get("signer_name"), "Client")
    document_type = (record.get("document_type") or "general").strip().lower()
    document_name = (
        record.get("title")
        if document_type == "general"
        else document_type_label(document_type)
    )
    document_name = _filename_segment(document_name, "Document")
    return f"{client_name}_Signed_{document_name}.pdf"


def normalize_esign_preferences(raw_preferences: object) -> dict[str, Any]:
    """Merge stored settings with safe E-Signature defaults.

    Only the reminder cadence values are normalized here; unrelated profile
    notification preferences remain untouched in the database.
    """
    preferences = dict(DEFAULT_ESIGN_PREFERENCES)
    if isinstance(raw_preferences, dict):
        for key in DEFAULT_ESIGN_PREFERENCES:
            if key in raw_preferences:
                preferences[key] = raw_preferences[key]

    for key in ("esign_document_viewed", "esign_document_signed", "esign_auto_reminders"):
        preferences[key] = bool(preferences[key])

    def _bounded_int(value: object, default: int, minimum: int, maximum: int) -> int:
        try:
            return max(minimum, min(maximum, int(value)))
        except (TypeError, ValueError):
            return default

    preferences["esign_reminder_initial_days"] = _bounded_int(
        preferences.get("esign_reminder_initial_days"),
        DEFAULT_ESIGN_PREFERENCES["esign_reminder_initial_days"],
        1,
        30,
    )
    preferences["esign_reminder_interval_days"] = _bounded_int(
        preferences.get("esign_reminder_interval_days"),
        DEFAULT_ESIGN_PREFERENCES["esign_reminder_interval_days"],
        1,
        30,
    )
    preferences["esign_reminder_max_count"] = _bounded_int(
        preferences.get("esign_reminder_max_count"),
        DEFAULT_ESIGN_PREFERENCES["esign_reminder_max_count"],
        0,
        10,
    )
    return preferences


async def get_esign_preferences(supabase, attorney_id: str | None) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Return normalized attorney preferences and the underlying profile record."""
    if not attorney_id:
        return normalize_esign_preferences(None), None

    try:
        response = (
            supabase.table("profiles")
            .select("id, email, full_name, notification_preferences")
            .eq("id", attorney_id)
            .limit(1)
            .execute()
        )
        profile = response.data[0] if response.data else None
        return normalize_esign_preferences((profile or {}).get("notification_preferences")), profile
    except Exception:
        logger.exception("Could not retrieve E-Signature notification preferences for attorney %s", attorney_id)
        return normalize_esign_preferences(None), None


async def notify_attorney_of_esign_event(
    *,
    supabase,
    record: dict[str, Any],
    event: str,
    source_table: str,
) -> bool:
    """Email an attorney once when a signer first views or signs a document.

    ``source_table`` must be either ``signing_sessions`` or
    ``signature_requests``.  The event timestamp is persisted only after the
    email service accepts the send, so temporary provider failures do not
    permanently suppress a later notification attempt.
    """
    if event not in {"viewed", "signed"}:
        raise ValueError("E-Signature notification event must be viewed or signed.")

    notification_field = (
        "view_notification_sent_at" if event == "viewed" else "signed_notification_sent_at"
    )
    preference_key = "esign_document_viewed" if event == "viewed" else "esign_document_signed"
    if record.get(notification_field):
        return False

    preferences, attorney = await get_esign_preferences(supabase, record.get("sent_by"))
    if not preferences[preference_key]:
        return False
    if not attorney or not attorney.get("email"):
        logger.warning("No attorney email is available for E-Signature event %s", record.get("id"))
        return False

    title = record.get("title") or document_type_label(record.get("document_type"))
    signer_name = record.get("signer_name") or "The client"
    event_label = "viewed" if event == "viewed" else "signed"
    heading = "Document Viewed" if event == "viewed" else "Document Signed"
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")

    sent = await send_email(
        to=attorney["email"],
        subject=f"{heading}: {title}",
        body=f"""
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;">
          <h2 style="color:{'#2563eb' if event == 'viewed' else '#059669'};">{heading}</h2>
          <p><strong>{escape(str(signer_name))}</strong> has {event_label} <strong>{escape(str(title))}</strong>.</p>
          <p><strong>Document type:</strong> {escape(document_type_label(record.get('document_type')))}</p>
          <p><a href="{frontend_url}/attorney/esign" style="background:#2563eb;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open E-Signatures</a></p>
          <p style="font-size:12px;color:#64748b;">For privacy, this email does not include document contents.</p>
        </div>
        """,
    )
    if not sent:
        return False

    try:
        supabase.table(source_table).update({
            notification_field: datetime.now(timezone.utc).isoformat(),
        }).eq("id", record["id"]).execute()
    except Exception:
        # The email was accepted by the provider.  Log the persistence problem
        # for follow-up instead of turning an already-delivered notification
        # into a request failure.
        logger.exception(
            "E-Signature %s notification sent but timestamp could not be recorded for %s",
            event,
            record.get("id"),
        )
    return True
