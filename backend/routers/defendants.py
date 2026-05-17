"""
Defendants router.

CRUD endpoints for the defendants table.  Read access is public;
create and update require attorney authentication.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from models.schemas import DefendantCreate
from utils.defendants_db import (
    create_defendant,
    get_all_defendants,
    get_defendant_by_id,
    update_defendant,
)
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth helper (duplicated from cases.py for router independence)
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Delegate to the shared auth helper in cases.py (auto-creates profile)."""
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)

def _require_attorney(profile: dict) -> None:
    if profile.get("role") != "attorney":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only attorneys can perform this action.",
        )


# ---------------------------------------------------------------------------
# GET / -- list all defendants (public)
# ---------------------------------------------------------------------------


@router.get("")
async def list_defendants():
    """Return all defendants, ordered by name.  No auth required."""
    return get_all_defendants()


# ---------------------------------------------------------------------------
# POST / -- create defendant (attorney only)
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_defendant_endpoint(
    body: DefendantCreate,
    authorization: str = Header(...),
):
    """Attorney creates a new defendant record."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    result = create_defendant(body.model_dump())

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create defendant.",
        )

    return result


# ---------------------------------------------------------------------------
# PATCH /{defendant_id} -- update defendant (attorney only)
# ---------------------------------------------------------------------------


@router.patch("/{defendant_id}")
async def update_defendant_endpoint(
    defendant_id: str,
    body: dict,
    authorization: str = Header(...),
):
    """Attorney updates an existing defendant record.

    Accepts a partial update -- only provided fields are changed.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    # Verify the defendant exists
    existing = get_defendant_by_id(defendant_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Defendant not found.",
        )

    result = update_defendant(defendant_id, body)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update defendant.",
        )

    return result


# ---------------------------------------------------------------------------
# DELETE /{defendant_id} -- delete defendant (attorney only)
# ---------------------------------------------------------------------------


@router.delete("/{defendant_id}")
async def delete_defendant_endpoint(
    defendant_id: str,
    authorization: str = Header(...),
):
    """Attorney deletes a defendant record."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Remove from case_defendants junction table first
    try:
        supabase.table("case_defendants").delete().eq("defendant_id", defendant_id).execute()
    except Exception:
        pass

    # Delete the defendant
    resp = supabase.table("defendants").delete().eq("id", defendant_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Defendant not found")

    return {"deleted": True}
