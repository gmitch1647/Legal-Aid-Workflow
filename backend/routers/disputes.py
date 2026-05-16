"""
Dispute sessions router — CRUD for credit report dispute sessions.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
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
# Models
# ---------------------------------------------------------------------------

class DisputeSessionCreate(BaseModel):
    client_name: str
    client_dob: Optional[str] = ""
    client_address: Optional[str] = ""
    client_city_state_zip: Optional[str] = ""
    client_ssn_last4: Optional[str] = ""
    client_id: Optional[str] = None
    accounts: list = []
    letters: dict = {}
    status: str = "draft"


class DisputeSessionUpdate(BaseModel):
    client_name: Optional[str] = None
    client_dob: Optional[str] = None
    client_address: Optional[str] = None
    client_city_state_zip: Optional[str] = None
    client_ssn_last4: Optional[str] = None
    client_id: Optional[str] = None
    accounts: Optional[list] = None
    letters: Optional[dict] = None
    status: Optional[str] = None


# ---------------------------------------------------------------------------
# GET / — list all dispute sessions
# ---------------------------------------------------------------------------

@router.get("")
async def list_disputes(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = (
        supabase.table("dispute_sessions")
        .select("id, client_name, client_id, status, created_at, updated_at, accounts")
        .order("updated_at", desc=True)
        .limit(100)
        .execute()
    )

    results = []
    for row in (resp.data or []):
        accounts = row.get("accounts") or []
        bureau_counts = {}
        for acc in accounts:
            b = acc.get("bureau", "other")
            bureau_counts[b] = bureau_counts.get(b, 0) + 1

        results.append({
            "id": row["id"],
            "client_name": row["client_name"],
            "client_id": row.get("client_id"),
            "status": row["status"],
            "account_count": len(accounts),
            "bureau_counts": bureau_counts,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        })

    return results


# ---------------------------------------------------------------------------
# GET /{id} — get a specific dispute session
# ---------------------------------------------------------------------------

@router.get("/{session_id}")
async def get_dispute(session_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("dispute_sessions").select("*").eq("id", session_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Dispute session not found")

    return resp.data[0]


# ---------------------------------------------------------------------------
# POST / — create a new dispute session
# ---------------------------------------------------------------------------

@router.post("")
async def create_dispute(
    payload: DisputeSessionCreate,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    record = {
        "client_name": payload.client_name,
        "client_dob": payload.client_dob,
        "client_address": payload.client_address,
        "client_city_state_zip": payload.client_city_state_zip,
        "client_ssn_last4": payload.client_ssn_last4,
        "client_id": payload.client_id,
        "accounts": payload.accounts,
        "letters": payload.letters,
        "status": payload.status,
        "created_by": profile["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    resp = supabase.table("dispute_sessions").insert(record).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create dispute session")

    return resp.data[0]


# ---------------------------------------------------------------------------
# PATCH /{id} — update a dispute session
# ---------------------------------------------------------------------------

@router.patch("/{session_id}")
async def update_dispute(
    session_id: str,
    payload: DisputeSessionUpdate,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in [
        "client_name", "client_dob", "client_address", "client_city_state_zip",
        "client_ssn_last4", "client_id", "accounts", "letters", "status",
    ]:
        val = getattr(payload, field)
        if val is not None:
            updates[field] = val

    supabase = get_supabase()
    resp = (
        supabase.table("dispute_sessions")
        .update(updates)
        .eq("id", session_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Dispute session not found")

    return resp.data[0]


# ---------------------------------------------------------------------------
# DELETE /{id} — delete a dispute session
# ---------------------------------------------------------------------------

@router.delete("/{session_id}")
async def delete_dispute(session_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("dispute_sessions").delete().eq("id", session_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Dispute session not found")

    return {"deleted": True}
