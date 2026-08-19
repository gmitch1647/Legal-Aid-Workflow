"""
Messages router.

Provides a per-case messaging thread between the attorney and the
client.  Each message triggers an in-app notification to the other party.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, status

from models.schemas import MessageCreate
from utils.notifications import create_notification
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Delegate to the shared auth helper in cases.py (auto-creates profile)."""
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)

def _fetch_case_and_verify(case_id: str, profile: dict) -> dict:
    """Fetch a case and verify the caller is the attorney or the case owner."""
    supabase = get_supabase()
    resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found.",
        )
    case = resp.data[0]
    if profile["role"] == "client" and case["client_id"] != profile["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this case.",
        )
    if profile.get("role") == "affiliate":
        partner_response = (
            supabase.table("referral_partners")
            .select("id")
            .eq("portal_user_id", profile["id"])
            .eq("portal_active", True)
            .limit(1)
            .execute()
        )
        partner = (partner_response.data or [None])[0]
        if not partner or str(case.get("referral_partner_id")) != str(partner.get("id")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to messages for this referral case.",
            )
    return case


# ---------------------------------------------------------------------------
# GET /cases/{case_id}/messages -- message thread
# ---------------------------------------------------------------------------


@router.get("/cases/{case_id}/messages")
async def list_messages(case_id: str, authorization: str = Header(...)):
    """Return the message thread for a case, ordered chronologically."""
    profile = await _get_current_user(authorization)
    _fetch_case_and_verify(case_id, profile)

    supabase = get_supabase()

    resp = (
        supabase.table("messages")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at")
        .execute()
    )

    messages = resp.data or []

    # Enrich with sender info
    for msg in messages:
        sender_resp = (
            supabase.table("profiles")
            .select("id, full_name, role")
            .eq("id", msg["sender_id"])
            .limit(1)
            .execute()
        )
        msg["sender"] = sender_resp.data[0] if sender_resp.data else None

    return messages


# ---------------------------------------------------------------------------
# POST /cases/{case_id}/messages -- send message
# ---------------------------------------------------------------------------


@router.post("/cases/{case_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    case_id: str,
    body: MessageCreate,
    authorization: str = Header(...),
):
    """Send a message in a case thread.

    Creates the message record and notifies the other party (attorney
    or client) via an in-app notification.
    """
    profile = await _get_current_user(authorization)
    case = _fetch_case_and_verify(case_id, profile)

    supabase = get_supabase()

    msg_payload = {
        "case_id": case_id,
        "sender_id": profile["id"],
        "body": body.body,
    }

    try:
        msg_resp = supabase.table("messages").insert(msg_payload).execute()
        if not msg_resp.data:
            raise RuntimeError("Message insert returned no data.")
        message = msg_resp.data[0]
    except Exception as exc:
        logger.exception("Failed to send message in case %s", case_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not send message: {exc}",
        )

    # Determine the recipient (the *other* party)
    sender_name = profile.get("full_name", "Someone")

    if profile.get("role") in {"attorney", "staff_attorney", "affiliate"}:
        # Attorneys and referral attorneys can message the client for a case they are authorized to access.
        recipient_id = case["client_id"]
    else:
        # Notify the attorney -- find the first attorney profile
        try:
            attorney_resp = (
                supabase.table("profiles")
                .select("id")
                .eq("role", "attorney")
                .limit(1)
                .execute()
            )
            recipient_id = (
                attorney_resp.data[0]["id"] if attorney_resp.data else None
            )
        except Exception:
            logger.warning("Could not resolve attorney for message notification")
            recipient_id = None

    if recipient_id:
        create_notification(
            user_id=recipient_id,
            type="message_received",
            message=f"New message from {sender_name} on case.",
            case_id=case_id,
        )

    return message
