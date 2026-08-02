"""Attorney directory and letterhead records used by document workflows."""

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
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


class AttorneyCreate(BaseModel):
    full_name: str
    bar_number: Optional[str] = ""
    firm_name: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    is_default: bool = False


def _directory_letterhead(profile: dict, current_profile_id: str, has_default: bool) -> dict:
    """Map an existing LegalFlow attorney profile to a durable letterhead record."""
    profile_id = str(profile["id"])
    return {
        "profile_id": profile_id,
        "full_name": str(profile.get("full_name") or "").strip() or "Attorney",
        "bar_number": str(profile.get("bar_number") or "").strip(),
        "firm_name": str(profile.get("firm_name") or "").strip(),
        "address": str(profile.get("address") or "").strip(),
        "phone": str(profile.get("phone") or "").strip(),
        "email": str(profile.get("email") or "").strip(),
        "created_by": profile_id,
        # When no custom default exists, make the logged-in attorney's own
        # profile the natural default for the closing-statement letterhead.
        "is_default": bool(not has_default and profile_id == str(current_profile_id)),
    }


@router.get("")
async def list_attorneys(authorization: str = Header(default=None)):
    """Return all saved letterheads plus attorneys already present in LegalFlow."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    saved_response = supabase.table("attorneys").select("*").order("full_name").execute()
    saved_records = saved_response.data or []
    by_profile_id = {
        str(record.get("profile_id")): record
        for record in saved_records
        if record.get("profile_id")
    }
    has_default = any(bool(record.get("is_default")) for record in saved_records)

    try:
        profile_response = (
            supabase.table("profiles")
            .select("id,role,full_name,email,phone,address,bar_number,firm_name")
            .in_("role", ["attorney", "staff_attorney"])
            .order("full_name")
            .execute()
        )
        system_attorneys = profile_response.data or []
    except Exception as exc:
        # Existing saved letterheads still remain usable if a legacy schema has
        # not yet exposed one of the profile fields.
        logger.warning("Could not synchronize system attorney profiles: %s", exc)
        system_attorneys = []

    for system_profile in system_attorneys:
        profile_id = str(system_profile.get("id") or "")
        if not profile_id:
            continue
        desired = _directory_letterhead(system_profile, profile["id"], has_default)
        existing = by_profile_id.get(profile_id)
        if existing:
            changes = {
                key: value
                for key, value in desired.items()
                if key in {"full_name", "bar_number", "firm_name", "address", "phone", "email"}
                and str(existing.get(key) or "") != str(value or "")
            }
            if changes:
                try:
                    response = supabase.table("attorneys").update(changes).eq("id", existing["id"]).execute()
                    if response.data:
                        existing = response.data[0]
                        by_profile_id[profile_id] = existing
                except Exception as exc:
                    logger.warning("Could not refresh letterhead for attorney profile %s: %s", profile_id, exc)
            continue

        try:
            response = supabase.table("attorneys").insert(desired).execute()
            if response.data:
                created = response.data[0]
                saved_records.append(created)
                by_profile_id[profile_id] = created
                has_default = has_default or bool(created.get("is_default"))
        except Exception as exc:
            logger.warning("Could not add system attorney profile %s to the letterhead directory: %s", profile_id, exc)

    return sorted(saved_records, key=lambda item: (str(item.get("full_name") or "").lower(), str(item.get("id") or "")))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_attorney(body: AttorneyCreate, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

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
