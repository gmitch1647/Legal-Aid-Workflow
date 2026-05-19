"""
Attorneys router — CRUD for attorneys who appear on complaints.
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


class AttorneyCreate(BaseModel):
    full_name: str
    bar_number: Optional[str] = ""
    firm_name: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    is_default: bool = False


@router.get("")
async def list_attorneys(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("attorneys").select("*").order("full_name").execute()
    return resp.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_attorney(body: AttorneyCreate, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # If setting as default, unset other defaults
    if body.is_default:
        try:
            supabase.table("attorneys").update({"is_default": False}).eq("is_default", True).execute()
        except Exception:
            pass

    record = body.model_dump()
    record["created_by"] = profile["id"]
    record["created_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("attorneys").insert(record).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create attorney")
    return resp.data[0]


@router.patch("/{attorney_id}")
async def update_attorney(attorney_id: str, body: dict, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    if body.get("is_default"):
        try:
            supabase.table("attorneys").update({"is_default": False}).eq("is_default", True).execute()
        except Exception:
            pass

    resp = supabase.table("attorneys").update(body).eq("id", attorney_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Attorney not found")
    return resp.data[0]


@router.delete("/{attorney_id}")
async def delete_attorney(attorney_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("attorneys").delete().eq("id", attorney_id).execute()
    return {"deleted": True}
