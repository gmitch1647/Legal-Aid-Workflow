"""
Memory management router — view, add, and delete memories.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Attorney access required")


# ---------------------------------------------------------------------------
# GET /attorney — get all global attorney memories
# ---------------------------------------------------------------------------

@router.get("/attorney")
async def get_attorney_memories(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = (
        supabase.table("attorney_memories")
        .select("*")
        .eq("attorney_id", profile["id"])
        .order("importance", desc=True)
        .limit(200)
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# GET /case/{case_id} — get all memories for a case
# ---------------------------------------------------------------------------

@router.get("/case/{case_id}")
async def get_case_memories(case_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = (
        supabase.table("case_memories")
        .select("*")
        .eq("case_id", case_id)
        .order("importance", desc=True)
        .limit(200)
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# POST /attorney — add a manual attorney memory
# ---------------------------------------------------------------------------

class MemoryCreate(BaseModel):
    category: str = "preference"
    content: str
    importance: int = 7


@router.post("/attorney")
async def add_attorney_memory(
    payload: MemoryCreate,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    record = {
        "attorney_id": profile["id"],
        "category": payload.category,
        "content": payload.content,
        "importance": min(10, max(1, payload.importance)),
        "source_type": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase.table("attorney_memories").insert(record).execute()
    return resp.data[0] if resp.data else record


# ---------------------------------------------------------------------------
# POST /case/{case_id} — add a manual case memory
# ---------------------------------------------------------------------------

@router.post("/case/{case_id}")
async def add_case_memory(
    case_id: str,
    payload: MemoryCreate,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    record = {
        "case_id": case_id,
        "category": payload.category,
        "content": payload.content,
        "importance": min(10, max(1, payload.importance)),
        "source_type": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase.table("case_memories").insert(record).execute()
    return resp.data[0] if resp.data else record


# ---------------------------------------------------------------------------
# DELETE /attorney/{id} — delete an attorney memory
# ---------------------------------------------------------------------------

@router.delete("/attorney/{memory_id}")
async def delete_attorney_memory(
    memory_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("attorney_memories").delete().eq("id", memory_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# DELETE /case/{memory_id} — delete a case memory
# ---------------------------------------------------------------------------

@router.delete("/case-memory/{memory_id}")
async def delete_case_memory(
    memory_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("case_memories").delete().eq("id", memory_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# GET /stats — memory system stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def memory_stats(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    atty_resp = (
        supabase.table("attorney_memories")
        .select("id", count="exact")
        .eq("attorney_id", profile["id"])
        .execute()
    )

    case_resp = (
        supabase.table("case_memories")
        .select("id", count="exact")
        .execute()
    )

    return {
        "attorney_memories": atty_resp.count or len(atty_resp.data or []),
        "case_memories": case_resp.count or len(case_resp.data or []),
    }
