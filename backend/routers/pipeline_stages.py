"""
Pipeline Stages router.

CRUD for customizable pipeline stages that define the Kanban board
columns. Attorneys can add, remove, reorder, and rename stages.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Only attorneys can manage pipeline stages.")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class StageCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    color: str = "slate"
    description: Optional[str] = None
    position: Optional[int] = None


class StageUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    position: Optional[int] = None


class StageReorder(BaseModel):
    stage_ids: list[str]  # ordered list of stage UUIDs


# ---------------------------------------------------------------------------
# GET / — list all stages in order
# ---------------------------------------------------------------------------

@router.get("")
async def list_stages():
    """Return all pipeline stages ordered by position."""
    supabase = get_supabase()
    result = (
        supabase.table("pipeline_stages")
        .select("*")
        .order("position")
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# POST / — create a new stage
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_stage(
    body: StageCreate,
    authorization: str = Header(...),
):
    """Add a new pipeline stage."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Auto-generate slug from name if not provided
    slug = body.slug or body.name.lower().replace(" ", "_").replace("-", "_")

    # Check for duplicate slug
    existing = (
        supabase.table("pipeline_stages")
        .select("id")
        .eq("slug", slug)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail=f"Stage with slug '{slug}' already exists.")

    # Default position = max + 1
    if body.position is None:
        max_pos = (
            supabase.table("pipeline_stages")
            .select("position")
            .order("position", desc=True)
            .limit(1)
            .execute()
        )
        body.position = (max_pos.data[0]["position"] + 1) if max_pos.data else 0

    result = supabase.table("pipeline_stages").insert({
        "slug": slug,
        "name": body.name,
        "position": body.position,
        "color": body.color,
        "description": body.description,
        "is_system": False,
    }).execute()

    return result.data[0] if result.data else {}


# ---------------------------------------------------------------------------
# PATCH /{stage_id} — update a stage
# ---------------------------------------------------------------------------

@router.patch("/{stage_id}")
async def update_stage(
    stage_id: str,
    body: StageUpdate,
    authorization: str = Header(...),
):
    """Update a pipeline stage's name, color, description, or position."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = (
        supabase.table("pipeline_stages")
        .update(update_data)
        .eq("id", stage_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Stage not found.")

    return result.data[0]


# ---------------------------------------------------------------------------
# DELETE /{stage_id} — delete a stage
# ---------------------------------------------------------------------------

@router.delete("/{stage_id}")
async def delete_stage(
    stage_id: str,
    authorization: str = Header(...),
):
    """Delete a pipeline stage. System stages cannot be deleted."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Check if it's a system stage
    stage = (
        supabase.table("pipeline_stages")
        .select("*")
        .eq("id", stage_id)
        .limit(1)
        .execute()
    )
    if not stage.data:
        raise HTTPException(status_code=404, detail="Stage not found.")

    if stage.data[0].get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete system stages.")

    # Check if any cases are in this stage
    cases_in_stage = (
        supabase.table("cases")
        .select("id")
        .eq("status", stage.data[0]["slug"])
        .limit(1)
        .execute()
    )
    if cases_in_stage.data:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete stage — there are cases in this stage. Move them first.",
        )

    supabase.table("pipeline_stages").delete().eq("id", stage_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# POST /reorder — reorder all stages
# ---------------------------------------------------------------------------

@router.post("/reorder")
async def reorder_stages(
    body: StageReorder,
    authorization: str = Header(...),
):
    """Reorder pipeline stages by providing an ordered list of stage IDs."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    for i, stage_id in enumerate(body.stage_ids):
        supabase.table("pipeline_stages").update(
            {"position": i}
        ).eq("id", stage_id).execute()

    return {"reordered": True, "count": len(body.stage_ids)}
