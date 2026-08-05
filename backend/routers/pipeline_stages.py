"""
Pipeline Stages router.

CRUD for customizable pipeline stages and pipelines. Attorneys can
create multiple pipelines (e.g. FCRA, FDCPA, TCPA), each with their
own stages. Stages with pipeline_id=NULL are shared across all pipelines.
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
    pipeline_id: Optional[str] = None
    notify_on_enter: bool = False
    notify_email: bool = False
    notify_sms: bool = False
    notify_attorney: bool = False
    notify_attorney_id: Optional[str] = None
    notification_template: Optional[str] = ""


class StageUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    position: Optional[int] = None
    pipeline_id: Optional[str] = None
    notify_on_enter: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None
    notify_attorney: Optional[bool] = None
    notify_attorney_id: Optional[str] = None
    notification_template: Optional[str] = None


class StageReorder(BaseModel):
    stage_ids: list[str]


class PipelineCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    color: str = "blue"


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# PIPELINES — CRUD
# ---------------------------------------------------------------------------

@router.get("/pipelines")
async def list_pipelines():
    """Return all pipelines ordered by position."""
    supabase = get_supabase()
    result = (
        supabase.table("pipelines")
        .select("*")
        .order("position")
        .execute()
    )
    return result.data or []


@router.post("/pipelines", status_code=status.HTTP_201_CREATED)
async def create_pipeline(
    body: PipelineCreate,
    authorization: str = Header(...),
):
    """Create a new pipeline (e.g. for a new case type)."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    slug = body.slug or body.name.lower().replace(" ", "_").replace("-", "_")

    existing = supabase.table("pipelines").select("id").eq("slug", slug).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"Pipeline '{slug}' already exists.")

    max_pos = (
        supabase.table("pipelines")
        .select("position")
        .order("position", desc=True)
        .limit(1)
        .execute()
    )
    pos = (max_pos.data[0]["position"] + 1) if max_pos.data else 0

    result = supabase.table("pipelines").insert({
        "name": body.name,
        "slug": slug,
        "description": body.description,
        "color": body.color,
        "position": pos,
    }).execute()

    return result.data[0] if result.data else {}


@router.patch("/pipelines/{pipeline_id}")
async def update_pipeline(
    pipeline_id: str,
    body: PipelineUpdate,
    authorization: str = Header(...),
):
    """Update a pipeline's name, color, or description."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = supabase.table("pipelines").update(update_data).eq("id", pipeline_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Pipeline not found.")
    return result.data[0]


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: str,
    authorization: str = Header(...),
):
    """Delete a pipeline. Cannot delete the default pipeline."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    pipeline = supabase.table("pipelines").select("*").eq("id", pipeline_id).limit(1).execute()
    if not pipeline.data:
        raise HTTPException(status_code=404, detail="Pipeline not found.")
    if pipeline.data[0].get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default pipeline.")

    supabase.table("pipelines").delete().eq("id", pipeline_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# STAGES — CRUD (same as before but with pipeline_id support)
# ---------------------------------------------------------------------------

@router.get("")
async def list_stages(pipeline_id: Optional[str] = None):
    """Return pipeline stages. If pipeline_id is given, returns shared
    stages (pipeline_id IS NULL) plus stages for that specific pipeline."""
    supabase = get_supabase()

    if pipeline_id and pipeline_id != "all":
        # Get shared stages + pipeline-specific stages
        shared = (
            supabase.table("pipeline_stages")
            .select("*")
            .is_("pipeline_id", "null")
            .order("position")
            .execute()
        )
        specific = (
            supabase.table("pipeline_stages")
            .select("*")
            .eq("pipeline_id", pipeline_id)
            .order("position")
            .execute()
        )
        all_stages = (shared.data or []) + (specific.data or [])
        all_stages.sort(key=lambda s: s.get("position", 0))
        return all_stages
    else:
        result = (
            supabase.table("pipeline_stages")
            .select("*")
            .order("position")
            .execute()
        )
        return result.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_stage(
    body: StageCreate,
    authorization: str = Header(...),
):
    """Add a new pipeline stage."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    slug = body.slug or body.name.lower().replace(" ", "_").replace("-", "_")

    existing = supabase.table("pipeline_stages").select("id").eq("slug", slug).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"Stage '{slug}' already exists.")

    if body.position is None:
        max_pos = (
            supabase.table("pipeline_stages")
            .select("position")
            .order("position", desc=True)
            .limit(1)
            .execute()
        )
        body.position = (max_pos.data[0]["position"] + 1) if max_pos.data else 0

    insert_data = {
        "slug": slug,
        "name": body.name,
        "position": body.position,
        "color": body.color,
        "description": body.description,
        "is_system": False,
    }
    if body.pipeline_id:
        insert_data["pipeline_id"] = body.pipeline_id

    result = supabase.table("pipeline_stages").insert(insert_data).execute()
    return result.data[0] if result.data else {}


@router.patch("/{stage_id}")
async def update_stage(
    stage_id: str,
    body: StageUpdate,
    authorization: str = Header(...),
):
    """Update a pipeline stage."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    # Use exclude_unset so False/0/"" values are kept, only truly unset fields are skipped
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = supabase.table("pipeline_stages").update(update_data).eq("id", stage_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Stage not found.")
    return result.data[0]


@router.delete("/{stage_id}")
async def delete_stage(
    stage_id: str,
    authorization: str = Header(...),
):
    """Delete a pipeline stage."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    stage = supabase.table("pipeline_stages").select("*").eq("id", stage_id).limit(1).execute()
    if not stage.data:
        raise HTTPException(status_code=404, detail="Stage not found.")

    # Move any cases in this stage to a default status before deleting
    slug = stage.data[0].get("slug", "")
    if slug:
        try:
            supabase.table("cases").update({"status": "submitted"}).eq("status", slug).execute()
        except Exception:
            pass

    supabase.table("pipeline_stages").delete().eq("id", stage_id).execute()
    return {"deleted": True}


@router.post("/reorder")
async def reorder_stages(
    body: StageReorder,
    authorization: str = Header(...),
):
    """Reorder pipeline stages."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    for i, stage_id in enumerate(body.stage_ids):
        supabase.table("pipeline_stages").update({"position": i}).eq("id", stage_id).execute()

    return {"reordered": True}
