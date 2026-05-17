"""
Credit Reports router — pull reports via Experian API,
store on client profiles, feed to disputer.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
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


# ---------------------------------------------------------------------------
# GET /config — check what's configured
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_config(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    from utils.experian_api import is_configured
    return {
        "experian": is_configured(),
    }


# ---------------------------------------------------------------------------
# POST /pull — pull a credit report for a client
# ---------------------------------------------------------------------------

class PullReportPayload(BaseModel):
    client_id: str
    first_name: str
    last_name: str
    ssn: str
    dob: str  # MM/DD/YYYY
    address: str
    city: str
    state: str
    zip_code: str
    middle_name: str = ""


@router.post("/pull")
async def pull_credit_report(
    payload: PullReportPayload,
    authorization: str = Header(default=None),
):
    """Pull a credit report from Experian and store it on the client profile."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    from utils.experian_api import is_configured, pull_credit_report, extract_accounts_from_report, extract_scores_from_report

    if not is_configured():
        raise HTTPException(status_code=400, detail="Experian API not configured")

    try:
        report_data = await pull_credit_report(
            first_name=payload.first_name,
            last_name=payload.last_name,
            ssn=payload.ssn,
            dob=payload.dob,
            address=payload.address,
            city=payload.city,
            state=payload.state,
            zip_code=payload.zip_code,
            middle_name=payload.middle_name,
        )

        accounts = extract_accounts_from_report(report_data)
        scores = extract_scores_from_report(report_data)

        # Store in database
        supabase = get_supabase()
        record = {
            "client_id": payload.client_id,
            "bureau": "experian",
            "pulled_at": datetime.now(timezone.utc).isoformat(),
            "report_data": report_data,
            "accounts": accounts,
            "scores": scores,
            "pulled_by": profile["id"],
        }

        try:
            supabase.table("credit_reports").insert(record).execute()
        except Exception as e:
            logger.warning(f"Could not save credit report: {e}")

        return {
            "status": "success",
            "bureau": "experian",
            "accounts": accounts,
            "scores": scores,
            "account_count": len(accounts),
            "pulled_at": record["pulled_at"],
        }

    except Exception as e:
        logger.exception("Experian credit pull failed")
        raise HTTPException(status_code=500, detail=f"Credit pull failed: {str(e)[:500]}")


# ---------------------------------------------------------------------------
# GET /client/{client_id} — get stored reports for a client
# ---------------------------------------------------------------------------

@router.get("/client/{client_id}")
async def get_client_reports(
    client_id: str,
    authorization: str = Header(default=None),
):
    """Get all stored credit reports for a client."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = (
        supabase.table("credit_reports")
        .select("id, client_id, bureau, pulled_at, scores, accounts, pulled_by")
        .eq("client_id", client_id)
        .order("pulled_at", desc=True)
        .limit(20)
        .execute()
    )

    return resp.data or []


# ---------------------------------------------------------------------------
# GET /client/{client_id}/scores — get score history for charts
# ---------------------------------------------------------------------------

@router.get("/client/{client_id}/scores")
async def get_score_history(
    client_id: str,
    authorization: str = Header(default=None),
):
    """Get credit score history for a client (for trend charts)."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = (
        supabase.table("credit_reports")
        .select("bureau, pulled_at, scores")
        .eq("client_id", client_id)
        .order("pulled_at", desc=False)
        .limit(50)
        .execute()
    )

    history = []
    for r in (resp.data or []):
        scores = r.get("scores") or {}
        for model, data in scores.items():
            history.append({
                "date": r["pulled_at"],
                "bureau": r["bureau"],
                "model": model,
                "score": data.get("score", 0),
            })

    return history


# ---------------------------------------------------------------------------
# DELETE /report/{report_id} — delete a stored report
# ---------------------------------------------------------------------------

@router.delete("/report/{report_id}")
async def delete_report(
    report_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("credit_reports").delete().eq("id", report_id).execute()
    return {"deleted": True}
