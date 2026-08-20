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
from utils.referral_portal_access import get_referral_portal_partner

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

def _affiliate_pipeline_id(supabase, profile: dict) -> str | None:
    """Return the single active referral pipeline available to an affiliate or active teammate."""
    partner = get_referral_portal_partner(supabase, profile)
    return partner.get("pipeline_id") if partner else None


def _is_referral_pipeline(supabase, pipeline_id: str | None) -> bool:
    """Referral boards own their stages; they must never inherit shared firm stages."""
    if not pipeline_id:
        return False
    partner_response = (
        supabase.table("referral_partners")
        .select("id")
        .eq("pipeline_id", pipeline_id)
        .limit(1)
        .execute()
    )
    return bool(partner_response.data)


@router.get("/pipelines")
async def list_pipelines(authorization: str = Header(...)):
    """Return permitted pipelines; affiliates receive only their own referral board."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    query = supabase.table("pipelines").select("*").order("position")
    if profile.get("role") == "affiliate":
        pipeline_id = _affiliate_pipeline_id(supabase, profile)
        if not pipeline_id:
            return []
        query = query.eq("id", pipeline_id)
    result = query.execute()
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
async def list_stages(pipeline_id: Optional[str] = None, authorization: str = Header(...)):
    """Return permitted pipeline stages. Affiliates can see only their own board."""
    profile = await _get_current_user(authorization)
    supabase = get_supabase()
    affiliate_pipeline_id = _affiliate_pipeline_id(supabase, profile)
    if profile.get("role") == "affiliate":
        if not affiliate_pipeline_id:
            return []
        if pipeline_id not in (None, "all", affiliate_pipeline_id):
            raise HTTPException(status_code=403, detail="You do not have access to this pipeline.")
        pipeline_id = affiliate_pipeline_id

    if pipeline_id and pipeline_id != "all":
        specific = (
            supabase.table("pipeline_stages")
            .select("*")
            .eq("pipeline_id", pipeline_id)
            .order("position")
            .execute()
        )
        # Referral boards are completely separate from the firm's shared stage set.
        if _is_referral_pipeline(supabase, pipeline_id):
            return specific.data or []

        shared = (
            supabase.table("pipeline_stages")
            .select("*")
            .is_("pipeline_id", "null")
            .order("position")
            .execute()
        )
        all_stages = (shared.data or []) + (specific.data or [])
        all_stages.sort(key=lambda s: s.get("position", 0))
        return all_stages
    else:
        # The default board is the firm's shared main pipeline. Private referral
        # stages must not appear here merely because no explicit pipeline was chosen.
        result = (
            supabase.table("pipeline_stages")
            .select("*")
            .is_("pipeline_id", "null")
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

    stage_record = stage.data[0]
    stage_pipeline_id = stage_record.get("pipeline_id")
    if not stage_pipeline_id and stage_record.get("is_system"):
        raise HTTPException(status_code=400, detail="Core firm pipeline stages cannot be deleted.")

    # A private stage can affect only cases in its own pipeline. Move those cases to
    # the first remaining stage in that same board, never to the firm's shared Submitted stage.
    slug = stage_record.get("slug", "")
    if stage_pipeline_id:
        remaining = (
            supabase.table("pipeline_stages")
            .select("slug")
            .eq("pipeline_id", stage_pipeline_id)
            .order("position")
            .execute()
        )
        fallback = next((item.get("slug") for item in (remaining.data or []) if item.get("slug") != slug), None)
        if not fallback:
            raise HTTPException(status_code=400, detail="A pipeline must keep at least one stage.")
        if slug:
            supabase.table("cases").update({"status": fallback}).eq("status", slug).eq("pipeline_id", stage_pipeline_id).execute()
    elif slug:
        # Non-system shared stages are limited to firm cases with no private pipeline.
        supabase.table("cases").update({"status": "submitted"}).eq("status", slug).is_("pipeline_id", "null").execute()

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
