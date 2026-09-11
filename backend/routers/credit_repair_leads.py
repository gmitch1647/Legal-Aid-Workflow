"""Dedicated credit-repair lead intake and management routes."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from utils.supabase_client import get_supabase

router = APIRouter()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as shared
    return await shared(authorization)


def _require_staff(profile: dict) -> None:
    if profile.get("role") not in {"owner", "attorney", "staff_attorney"}:
        raise HTTPException(status_code=403, detail="Credit repair lead access is restricted to authorized staff.")


class CreditRepairLeadCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[str] = None
    state: Optional[str] = Field(default=None, max_length=2)
    street_address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=120)
    zip: Optional[str] = Field(default=None, max_length=20)
    case_type: Optional[str] = Field(default=None, max_length=120)
    adverse_party: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=10000)
    source: str = Field(default="credit_repair_form", max_length=120)


class CreditRepairLeadUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[str] = None
    state: Optional[str] = Field(default=None, max_length=2)
    street_address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=120)
    zip: Optional[str] = Field(default=None, max_length=20)
    case_type: Optional[str] = Field(default=None, max_length=120)
    adverse_party: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=10000)
    notes: Optional[str] = Field(default=None, max_length=10000)
    status: Optional[str] = None
    assigned_to: Optional[str] = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_credit_repair_lead(payload: CreditRepairLeadCreate, authorization: str = Header(default=None)):
    profile = None
    if authorization:
        try:
            profile = await _get_current_user(authorization)
        except Exception:
            profile = None
    record = payload.model_dump(exclude_none=True)
    record["created_by"] = (profile or {}).get("id")
    result = get_supabase().table("credit_repair_leads").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save the credit repair lead.")
    return result.data[0]


@router.get("")
async def list_credit_repair_leads(authorization: str = Header(...), status_filter: Optional[str] = None):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    query = get_supabase().table("credit_repair_leads").select("*").order("created_at", desc=True).limit(500)
    if status_filter:
        query = query.eq("status", status_filter)
    return query.execute().data or []


@router.get("/{lead_id}")
async def get_credit_repair_lead(lead_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    result = get_supabase().table("credit_repair_leads").select("*").eq("id", lead_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return result.data[0]


@router.patch("/{lead_id}")
async def update_credit_repair_lead(lead_id: str, payload: CreditRepairLeadUpdate, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    allowed_statuses = {"new", "contacted", "qualified", "documents_pending", "active", "not_qualified", "closed"}
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("status") and changes["status"] not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Invalid credit repair lead status.")
    if "last_contacted_at" not in changes and changes.get("status") == "contacted":
        changes["last_contacted_at"] = datetime.now(timezone.utc).isoformat()
    if not changes:
        raise HTTPException(status_code=400, detail="No lead changes were supplied.")
    result = get_supabase().table("credit_repair_leads").update(changes).eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return result.data[0]


@router.delete("/{lead_id}")
async def delete_credit_repair_lead(lead_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    result = get_supabase().table("credit_repair_leads").delete().eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return {"deleted": True, "id": lead_id}
