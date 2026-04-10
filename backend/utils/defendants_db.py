"""
Defendant database helpers.

Provides CRUD operations for the ``defendants`` table in Supabase.
All functions use the shared service-role client and return plain
dictionaries (or lists of dictionaries) that can be passed directly
to Pydantic response models.
"""

import logging
from typing import Optional
from uuid import UUID

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def get_all_defendants() -> list[dict]:
    """Fetch every defendant from the database, ordered by name.

    Returns
    -------
    list[dict]
        A list of defendant records.  Returns an empty list if the
        query fails or no defendants exist.
    """
    supabase = get_supabase()

    try:
        response = (
            supabase.table("defendants")
            .select("*")
            .order("name")
            .execute()
        )
        return response.data or []
    except Exception:
        logger.exception("Failed to fetch defendants")
        return []


def get_defendant_by_id(defendant_id: UUID | str) -> Optional[dict]:
    """Fetch a single defendant by primary key.

    Parameters
    ----------
    defendant_id:
        UUID (or its string representation) of the defendant.

    Returns
    -------
    dict | None
        The defendant record, or ``None`` if not found / on error.
    """
    supabase = get_supabase()

    try:
        response = (
            supabase.table("defendants")
            .select("*")
            .eq("id", str(defendant_id))
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None
    except Exception:
        logger.exception("Failed to fetch defendant %s", defendant_id)
        return None


def create_defendant(data: dict) -> Optional[dict]:
    """Insert a new defendant record.

    Parameters
    ----------
    data:
        Dictionary of column values.  At minimum must include ``name``.
        Optional keys: ``principal_address``, ``ga_registered_agent``,
        ``entity_type``, ``is_custom``.

    Returns
    -------
    dict | None
        The newly created defendant record, or ``None`` on failure.
    """
    supabase = get_supabase()

    # Build a clean payload with only recognised columns
    payload: dict = {
        "name": data["name"],
    }
    if "principal_address" in data and data["principal_address"] is not None:
        payload["principal_address"] = data["principal_address"]
    if "ga_registered_agent" in data and data["ga_registered_agent"] is not None:
        payload["ga_registered_agent"] = data["ga_registered_agent"]
    if "entity_type" in data and data["entity_type"] is not None:
        payload["entity_type"] = data["entity_type"]
    if "is_custom" in data:
        payload["is_custom"] = bool(data["is_custom"])

    try:
        response = (
            supabase.table("defendants")
            .insert(payload)
            .execute()
        )
        if response.data:
            logger.info("Defendant created: %s", response.data[0].get("id"))
            return response.data[0]

        logger.warning("Defendant insert returned no data for payload: %s", payload)
        return None
    except Exception:
        logger.exception("Failed to create defendant with payload: %s", payload)
        return None


def update_defendant(
    defendant_id: UUID | str,
    data: dict,
) -> Optional[dict]:
    """Update an existing defendant record.

    Parameters
    ----------
    defendant_id:
        UUID (or string) of the defendant to update.
    data:
        Dictionary of column values to change.  Only recognised keys
        are applied; unknown keys are silently ignored.

    Returns
    -------
    dict | None
        The updated defendant record, or ``None`` if the update failed
        or no matching row was found.
    """
    supabase = get_supabase()

    # Only allow known mutable columns
    allowed_keys = {
        "name",
        "principal_address",
        "ga_registered_agent",
        "entity_type",
        "is_custom",
    }
    payload = {k: v for k, v in data.items() if k in allowed_keys}

    if not payload:
        logger.warning(
            "update_defendant called with no valid fields for defendant %s",
            defendant_id,
        )
        return get_defendant_by_id(defendant_id)

    try:
        response = (
            supabase.table("defendants")
            .update(payload)
            .eq("id", str(defendant_id))
            .execute()
        )
        if response.data:
            logger.info("Defendant %s updated", defendant_id)
            return response.data[0]

        logger.warning("Defendant update returned no data for id %s", defendant_id)
        return None
    except Exception:
        logger.exception("Failed to update defendant %s", defendant_id)
        return None
