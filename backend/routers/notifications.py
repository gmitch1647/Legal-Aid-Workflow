"""
Notifications router.

Read and manage in-app notifications for the authenticated user.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Query, status

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Validate the bearer token and return the user's profile."""
    supabase = get_supabase()

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization[len("Bearer "):]

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )

    if not profile_resp.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Profile not found.",
        )

    return profile_resp.data[0]


# ---------------------------------------------------------------------------
# GET / -- list notifications for the current user
# ---------------------------------------------------------------------------


@router.get("")
async def list_notifications(
    authorization: str = Header(...),
    unread_only: bool = Query(False, description="If true, return only unread notifications"),
):
    """Return the current user's notifications, newest first.

    Optionally filter to unread only via ``?unread_only=true``.
    """
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    query = (
        supabase.table("notifications")
        .select("*")
        .eq("user_id", profile["id"])
    )

    if unread_only:
        query = query.eq("read", False)

    query = query.order("created_at", desc=True)
    resp = query.execute()

    return resp.data or []


# ---------------------------------------------------------------------------
# PATCH /{notification_id}/read -- mark as read
# ---------------------------------------------------------------------------


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    authorization: str = Header(...),
):
    """Mark a single notification as read.

    Verifies that the notification belongs to the authenticated user
    before updating.
    """
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    # Fetch the notification and verify ownership
    notif_resp = (
        supabase.table("notifications")
        .select("*")
        .eq("id", notification_id)
        .limit(1)
        .execute()
    )

    if not notif_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )

    notification = notif_resp.data[0]

    if notification["user_id"] != profile["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only mark your own notifications as read.",
        )

    # Update
    update_resp = (
        supabase.table("notifications")
        .update({"read": True})
        .eq("id", notification_id)
        .execute()
    )

    if not update_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update notification.",
        )

    return update_resp.data[0]
