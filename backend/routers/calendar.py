"""
Calendar router — case deadline and event tracking.
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


class EventCreate(BaseModel):
    case_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    event_date: str  # YYYY-MM-DD
    event_time: Optional[str] = None  # HH:MM
    event_type: str = "deadline"
    color: str = "blue"
    remind_days: int = 3


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_type: Optional[str] = None
    color: Optional[str] = None
    is_completed: Optional[bool] = None
    remind_days: Optional[int] = None


@router.get("")
async def list_events(
    authorization: str = Header(default=None),
    month: Optional[str] = None,  # YYYY-MM
    case_id: Optional[str] = None,
):
    """List calendar events. Filter by month and/or case."""
    supabase = get_supabase()

    query = supabase.table("calendar_events").select(
        "*, cases!calendar_events_case_id_fkey(id, case_facts)"
    ).order("event_date")

    if month:
        year, m = month.split("-")
        start = f"{year}-{m}-01"
        if int(m) == 12:
            end = f"{int(year)+1}-01-01"
        else:
            end = f"{year}-{int(m)+1:02d}-01"
        query = query.gte("event_date", start).lt("event_date", end)

    if case_id:
        query = query.eq("case_id", case_id)

    result = query.execute()

    # Enrich with case plaintiff name
    events = []
    for e in result.data or []:
        case_info = e.pop("cases", None)
        case_name = ""
        if case_info and case_info.get("case_facts"):
            facts = case_info["case_facts"]
            if "Name:" in facts:
                for line in facts.split("\n"):
                    if line.strip().startswith("Name:"):
                        case_name = line.replace("Name:", "").strip()
                        break
        e["case_name"] = case_name
        events.append(e)

    return events


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    authorization: str = Header(default=None),
):
    """Create a calendar event."""
    supabase = get_supabase()

    # Get user profile for created_by
    profile_id = None
    if authorization:
        try:
            profile = await _get_current_user(authorization)
            profile_id = profile.get("id")
        except Exception:
            pass

    data = {
        "title": body.title,
        "description": body.description,
        "event_date": body.event_date,
        "event_time": body.event_time,
        "event_type": body.event_type,
        "color": body.color,
        "remind_days": body.remind_days,
    }
    if body.case_id:
        data["case_id"] = body.case_id
    if profile_id:
        data["created_by"] = profile_id

    result = supabase.table("calendar_events").insert(data).execute()
    return result.data[0] if result.data else {}


@router.patch("/{event_id}")
async def update_event(
    event_id: str,
    body: EventUpdate,
    authorization: str = Header(default=None),
):
    """Update a calendar event."""
    supabase = get_supabase()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("calendar_events").update(update_data).eq("id", event_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found.")
    return result.data[0]


@router.delete("/{event_id}")
async def delete_event(
    event_id: str,
    authorization: str = Header(default=None),
):
    """Delete a calendar event."""
    supabase = get_supabase()
    supabase.table("calendar_events").delete().eq("id", event_id).execute()
    return {"deleted": True}
