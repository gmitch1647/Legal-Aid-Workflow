"""
In-app notification helpers.

Creates notification records in the Supabase ``notifications`` table so
users see real-time or near-real-time updates in the UI.
"""

import logging
from typing import Optional
from uuid import UUID

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ── Core creator ────────────────────────────────────────────────────────────

def create_notification(
    user_id: UUID | str,
    type: str,
    message: str,
    case_id: Optional[UUID | str] = None,
) -> dict | None:
    """Insert a notification row and return the created record.

    Returns ``None`` (and logs the error) if the insert fails so that
    callers can treat notifications as best-effort.
    """
    supabase = get_supabase()

    payload: dict = {
        "user_id": str(user_id),
        "type": type,
        "message": message,
        "read": False,
    }
    if case_id is not None:
        payload["case_id"] = str(case_id)

    try:
        response = (
            supabase.table("notifications")
            .insert(payload)
            .execute()
        )
        if response.data:
            logger.info(
                "Notification created for user %s – type: %s", user_id, type
            )
            return response.data[0]

        logger.warning(
            "Notification insert returned no data for user %s – type: %s",
            user_id,
            type,
        )
        return None

    except Exception:
        logger.exception(
            "Failed to create notification for user %s – type: %s", user_id, type
        )
        return None


# ── Convenience helpers ─────────────────────────────────────────────────────

def notify_attorney_new_submission(
    case_id: UUID | str,
    client_name: str,
    attorney_id: Optional[UUID | str] = None,
) -> dict | None:
    """Notify the assigned (or all) attorney(s) about a new case submission.

    If ``attorney_id`` is not provided the function queries the profiles
    table for users with role ``attorney`` and notifies the first one found.
    """
    supabase = get_supabase()

    if attorney_id is None:
        try:
            result = (
                supabase.table("profiles")
                .select("id")
                .eq("role", "attorney")
                .limit(1)
                .execute()
            )
            if result.data:
                attorney_id = result.data[0]["id"]
            else:
                logger.warning("No attorney found to notify for case %s", case_id)
                return None
        except Exception:
            logger.exception("Failed to look up attorney for notification")
            return None

    return create_notification(
        user_id=attorney_id,
        type="new_submission",
        message=f"New case submitted by {client_name}.",
        case_id=case_id,
    )


def notify_attorney_draft_ready(
    case_id: UUID | str,
    client_name: str,
    defendants: list[str],
    attorney_id: Optional[UUID | str] = None,
) -> dict | None:
    """Notify the attorney that an AI-generated complaint draft is ready."""
    supabase = get_supabase()

    if attorney_id is None:
        try:
            result = (
                supabase.table("profiles")
                .select("id")
                .eq("role", "attorney")
                .limit(1)
                .execute()
            )
            if result.data:
                attorney_id = result.data[0]["id"]
            else:
                logger.warning("No attorney found to notify for case %s", case_id)
                return None
        except Exception:
            logger.exception("Failed to look up attorney for notification")
            return None

    defendants_display = ", ".join(defendants) if defendants else "N/A"
    return create_notification(
        user_id=attorney_id,
        type="draft_ready",
        message=(
            f"Complaint draft ready for {client_name}'s case "
            f"(defendants: {defendants_display})."
        ),
        case_id=case_id,
    )


def notify_client_complaint_approved(
    client_id: UUID | str,
    case_id: UUID | str,
) -> dict | None:
    """Notify the client that their complaint has been approved."""
    return create_notification(
        user_id=client_id,
        type="complaint_approved",
        message="Your complaint has been reviewed and approved by your attorney.",
        case_id=case_id,
    )


def notify_client_case_denied(
    client_id: UUID | str,
    case_id: UUID | str,
    reason: str,
) -> dict | None:
    """Notify the client that their case has been denied."""
    return create_notification(
        user_id=client_id,
        type="case_denied",
        message=f"Your case has been denied. Reason: {reason}",
        case_id=case_id,
    )
