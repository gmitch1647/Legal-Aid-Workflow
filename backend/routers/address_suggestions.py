"""Address suggestion endpoint for LegalFlow forms.

The endpoint performs a short, on-demand lookup only. It does not persist address
queries or selected results; forms remain usable when the provider is unavailable.
"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

STATE_CODES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}


def _state_name(address: dict[str, Any]) -> str:
    code = str(address.get("ISO3166-2-lvl4") or "").upper().removeprefix("US-")
    if code in STATE_CODES:
        return STATE_CODES[code]
    state = str(address.get("state") or "").strip()
    if state.upper() in STATE_CODES:
        return STATE_CODES[state.upper()]
    return state


def _normalise_result(row: dict[str, Any]) -> dict[str, str] | None:
    address = row.get("address") or {}
    if not isinstance(address, dict):
        return None
    road = str(
        address.get("road")
        or address.get("pedestrian")
        or address.get("residential")
        or address.get("footway")
        or ""
    ).strip()
    house_number = str(address.get("house_number") or "").strip()
    line1 = " ".join(part for part in [house_number, road] if part).strip()
    city = str(
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
        or address.get("municipality")
        or ""
    ).strip()
    state = _state_name(address)
    zip_code = str(address.get("postcode") or "").strip()
    display_name = str(row.get("display_name") or "").strip()
    if not line1 or not display_name:
        return None
    return {
        "line1": line1,
        "city": city,
        "state": state,
        "zip_code": zip_code,
        "display_name": display_name,
    }


@router.get("/address-suggestions")
async def address_suggestions(query: str = Query(..., min_length=1, max_length=180)) -> dict[str, list[dict[str, str]]]:
    """Return up to five U.S. address suggestions for a live form input."""
    phrase = " ".join(query.split())
    if len(phrase) < 3:
        return {"suggestions": []}

    try:
        async with httpx.AsyncClient(timeout=4.0, headers={
            "Accept": "application/json",
            "Accept-Language": "en-US,en",
            "User-Agent": "LegalFlow/1.0 (address autocomplete)",
        }) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": phrase,
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "limit": 5,
                    "countrycodes": "us",
                    "dedupe": 1,
                },
            )
            response.raise_for_status()
            rows = response.json()
    except (httpx.HTTPError, ValueError):
        logger.warning("Address suggestion provider unavailable")
        return {"suggestions": []}

    suggestions = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        suggestion = _normalise_result(row)
        if suggestion:
            suggestions.append(suggestion)
    return {"suggestions": suggestions[:5]}
