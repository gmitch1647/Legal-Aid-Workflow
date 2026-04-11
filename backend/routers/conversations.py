"""
Conversations router.

Provides endpoints for interactive agent chat sessions where the
attorney can converse with specialized AI agents.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase
from agents.interactive_agent import AGENT_DISPLAY_NAMES

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ConversationCreate(BaseModel):
    agent_type: str = "general"
    case_id: str | None = None
    title: str | None = None


class ChatMessage(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def _get_current_user(authorization: str) -> dict:
    """Validate bearer token and return user profile."""
    supabase = get_supabase()
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    try:
        user_resp = supabase.auth.get_user(token)
        user_id = user_resp.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )
    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_resp.data[0]


# ---------------------------------------------------------------------------
# GET /agent-types — list available agent types
# ---------------------------------------------------------------------------

@router.get("/agent-types")
async def list_agent_types():
    """Return the list of available interactive agent types."""
    return [
        {"id": key, "name": value}
        for key, value in AGENT_DISPLAY_NAMES.items()
    ]


# ---------------------------------------------------------------------------
# POST / — create a new conversation
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    authorization: str = Header(...),
):
    """Start a new conversation with an agent."""
    profile = await _get_current_user(authorization)

    if body.agent_type not in AGENT_DISPLAY_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid agent_type. Choose from: {list(AGENT_DISPLAY_NAMES.keys())}",
        )

    supabase = get_supabase()

    title = body.title or f"New {AGENT_DISPLAY_NAMES[body.agent_type]} Chat"

    result = supabase.table("conversations").insert({
        "user_id": profile["id"],
        "agent_type": body.agent_type,
        "case_id": body.case_id,
        "title": title,
    }).execute()

    return result.data[0]


# ---------------------------------------------------------------------------
# GET / — list conversations
# ---------------------------------------------------------------------------

@router.get("")
async def list_conversations(
    authorization: str = Header(...),
    case_id: str | None = None,
    active_only: bool = True,
):
    """List the user's conversations, optionally filtered by case."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    query = (
        supabase.table("conversations")
        .select("*")
        .eq("user_id", profile["id"])
        .order("updated_at", desc=True)
    )

    if case_id:
        query = query.eq("case_id", case_id)
    if active_only:
        query = query.eq("is_active", True)

    result = query.limit(50).execute()
    return result.data or []


# ---------------------------------------------------------------------------
# GET /{conversation_id} — get conversation with messages
# ---------------------------------------------------------------------------

@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    authorization: str = Header(...),
):
    """Get a conversation and its message history."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    # Verify ownership
    convo_resp = (
        supabase.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", profile["id"])
        .limit(1)
        .execute()
    )
    if not convo_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Fetch messages
    messages_resp = (
        supabase.table("conversation_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )

    return {
        **convo_resp.data[0],
        "messages": messages_resp.data or [],
    }


# ---------------------------------------------------------------------------
# POST /{conversation_id}/chat — send a message and get agent response
# ---------------------------------------------------------------------------

@router.post("/{conversation_id}/chat")
async def send_chat_message(
    conversation_id: str,
    body: ChatMessage,
    authorization: str = Header(...),
):
    """Send a message to the agent and get a response."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    # Verify ownership and get conversation details
    convo_resp = (
        supabase.table("conversations")
        .select("*")
        .eq("id", conversation_id)
        .eq("user_id", profile["id"])
        .limit(1)
        .execute()
    )
    if not convo_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    convo = convo_resp.data[0]

    # Call the interactive agent
    from agents.interactive_agent import chat

    result = await chat(
        conversation_id=conversation_id,
        agent_type=convo["agent_type"],
        user_message=body.message,
        case_id=convo.get("case_id"),
    )

    # Update conversation timestamp
    supabase.table("conversations").update({
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", conversation_id).execute()

    return result


# ---------------------------------------------------------------------------
# DELETE /{conversation_id} — archive a conversation
# ---------------------------------------------------------------------------

@router.delete("/{conversation_id}")
async def archive_conversation(
    conversation_id: str,
    authorization: str = Header(...),
):
    """Archive (soft-delete) a conversation."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()

    supabase.table("conversations").update({
        "is_active": False,
    }).eq("id", conversation_id).eq("user_id", profile["id"]).execute()

    return {"message": "Conversation archived"}
