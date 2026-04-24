"""
Integrations router — connects external platforms to LegalFlow.

Currently supports:
- SuiteDash webhook (POST /integrations/suitedash/webhook)
- Generic webhook (POST /integrations/webhook)

When a webhook is received, it:
1. Creates a client profile (if one doesn't already exist)
2. Creates a case record with the submitted facts
3. Downloads and attaches any documents
4. Sends a notification to the attorney
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Header, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Webhook secret for verification (optional)
# ---------------------------------------------------------------------------

import os
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")


def _verify_webhook(request: Request, secret: str = None):
    """Verify webhook authenticity if a secret is configured."""
    if not WEBHOOK_SECRET:
        return True  # No secret configured, accept all
    provided = secret or request.headers.get("x-webhook-secret", "")
    return provided == WEBHOOK_SECRET


# ---------------------------------------------------------------------------
# Models — flexible to accept different formats
# ---------------------------------------------------------------------------

class SuiteDashWebhook(BaseModel):
    # Client info
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    county: Optional[str] = None
    zip_code: Optional[str] = None

    # Case info
    case_type: Optional[str] = None
    case_description: Optional[str] = None
    case_facts: Optional[str] = None
    description: Optional[str] = None
    what_happened: Optional[str] = None
    details: Optional[str] = None

    # Defendants
    defendant_name: Optional[str] = None
    defendant_names: Optional[list[str]] = None
    defendants: Optional[str] = None

    # Damages
    damages: Optional[str] = None
    damages_description: Optional[str] = None
    harm: Optional[str] = None

    # Documents (URLs to download)
    document_urls: Optional[list[str]] = None
    attachments: Optional[list[str]] = None
    files: Optional[list[dict]] = None

    # Metadata
    submission_id: Optional[str] = None
    form_name: Optional[str] = None
    submitted_at: Optional[str] = None
    source: Optional[str] = "suitedash"

    class Config:
        extra = "allow"  # Accept any additional fields


class GenericWebhook(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    case_facts: Optional[str] = None
    damages: Optional[str] = None
    defendants: Optional[list[str]] = None
    documents: Optional[list[str]] = None
    source: Optional[str] = "webhook"

    class Config:
        extra = "allow"


# ---------------------------------------------------------------------------
# Helper: find or create client profile
# ---------------------------------------------------------------------------

def _find_or_create_client(supabase, name: str, email: str, phone: str = "",
                            address: str = "", county: str = "", state: str = "") -> str:
    """Find existing client by email or create a new one. Returns profile ID."""

    if email:
        try:
            existing = (
                supabase.table("profiles")
                .select("id")
                .eq("email", email)
                .limit(1)
                .execute()
            )
            if existing.data:
                logger.info(f"Found existing client: {email}")
                return existing.data[0]["id"]
        except Exception as e:
            logger.warning(f"Profile lookup failed: {e}")

    # Create new profile with a generated UUID
    profile_id = str(uuid.uuid4())

    try:
        supabase.table("profiles").insert({
            "id": profile_id,
            "role": "client",
            "full_name": name or "Unknown Client",
            "email": email or "",
            "phone": phone or "",
            "address": address or "",
            "county": county or "",
            "state": state or "",
        }).execute()
        logger.info(f"Created client profile: {name} ({email})")
    except Exception as e:
        logger.warning(f"Could not create profile: {e}")
        # Try to find by email again in case of race condition
        if email:
            try:
                existing = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
                if existing.data:
                    return existing.data[0]["id"]
            except Exception:
                pass

    return profile_id


# ---------------------------------------------------------------------------
# POST /suitedash/webhook — receive case submission from SuiteDash
# ---------------------------------------------------------------------------

@router.post("/suitedash/webhook", status_code=status.HTTP_201_CREATED)
async def suitedash_webhook(request: Request):
    """Receive a case submission from SuiteDash via Zapier.

    Accepts any JSON or form-encoded payload. Handles null values,
    empty strings, and missing fields gracefully.
    """
    # Verify webhook secret if configured
    if not _verify_webhook(request):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    # Parse body — accept JSON or form data
    try:
        content_type = request.headers.get("content-type", "")
        if "json" in content_type:
            raw = await request.json()
        elif "form" in content_type:
            form = await request.form()
            raw = {k: v for k, v in form.items() if k and v}
        else:
            raw = await request.json()
    except Exception:
        try:
            body = await request.body()
            import json
            raw = json.loads(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Could not parse request body")

    # Clean the data — remove nulls, empty strings, and empty keys
    def clean(val):
        if val is None:
            return ""
        if isinstance(val, str):
            return val.strip()
        return val

    data = {}
    for k, v in raw.items():
        key = str(k).strip() if k else ""
        if not key:
            continue  # skip empty keys
        cleaned = clean(v)
        if cleaned != "" and cleaned is not None:
            data[key] = cleaned

    logger.info(f"SuiteDash webhook received: {list(data.keys())}")

    try:
        supabase = get_supabase()

        # Parse client name
        name = data.get("full_name") or data.get("name") or data.get("client_name") or data.get("contact_name") or ""
        if not name:
            first = data.get("first_name") or data.get("firstname") or ""
            last = data.get("last_name") or data.get("lastname") or ""
            name = f"{first} {last}".strip()
        if not name:
            name = "Unknown Client"

        email = data.get("email") or data.get("client_email") or data.get("contact_email") or ""
        phone = data.get("phone") or data.get("client_phone") or data.get("phone_number") or ""
        address = data.get("address") or data.get("street_address") or ""
        city = data.get("city") or ""
        state = data.get("state") or "Georgia"
        county = data.get("county") or ""
        zip_code = data.get("zip_code") or data.get("zip") or data.get("postal_code") or ""
        full_address = ", ".join(p for p in [address, city, state, zip_code] if p)

        facts = data.get("case_facts") or data.get("case_description") or data.get("what_happened") or data.get("description") or data.get("details") or data.get("message") or data.get("notes") or ""
        damages = data.get("damages") or data.get("damages_description") or data.get("harm") or ""

        defendant_list = []
        if data.get("defendant_names") and isinstance(data["defendant_names"], list):
            defendant_list = data["defendant_names"]
        elif data.get("defendants"):
            defendant_list = [d.strip() for d in str(data["defendants"]).split(",") if d.strip()]
        elif data.get("defendant_name"):
            defendant_list = [str(data["defendant_name"])]

        doc_urls = []
        for key in ["document_urls", "attachments", "files", "documents", "file_url"]:
            val = data.get(key)
            if val:
                if isinstance(val, list):
                    doc_urls.extend([str(u) for u in val if u])
                elif isinstance(val, str) and val.startswith("http"):
                    doc_urls.append(val)

        # 1. Find or create client
        client_id = _find_or_create_client(supabase, name=name, email=email, phone=phone, address=full_address, county=county, state=state)

        # 2. Create case record
        now = datetime.now(timezone.utc).isoformat()
        structured_facts = f"=== PLAINTIFF ===\nName: {name}\nCounty of Residence: {county or 'Unknown'}, {state}\n\n=== SOURCE ===\nSubmitted via: SuiteDash/Zapier\nForm: {data.get('form_name') or data.get('form') or 'intake'}\nSubmitted at: {data.get('submitted_at') or now}\n\n=== CASE FACTS ===\n{facts}\n\n=== DAMAGES DESCRIBED ===\n{damages}"

        case_resp = supabase.table("cases").insert({
            "client_id": client_id,
            "status": "submitted",
            "case_facts": structured_facts,
            "damages_description": damages,
            "created_at": now,
            "updated_at": now,
        }).execute()

        if not case_resp.data:
            raise HTTPException(status_code=500, detail="Failed to create case")
        case_id = case_resp.data[0]["id"]

        # 3. Link defendants
        for dname in defendant_list:
            try:
                d = supabase.table("defendants").select("id").ilike("name", dname.strip()).limit(1).execute()
                if d.data:
                    def_id = d.data[0]["id"]
                else:
                    ins = supabase.table("defendants").insert({"name": dname.strip(), "is_custom": True}).execute()
                    def_id = ins.data[0]["id"] if ins.data else None
                if def_id:
                    supabase.table("case_defendants").insert({"case_id": case_id, "defendant_id": def_id}).execute()
            except Exception as e:
                logger.warning(f"Could not link defendant {dname}: {e}")

        # 4. Notify attorney
        try:
            from utils.notifications import notify_attorney_new_submission
            notify_attorney_new_submission(case_id=case_id, client_name=name)
        except Exception as e:
            logger.warning(f"Notification failed: {e}")

        logger.info(f"SuiteDash webhook: created client {name} ({email}) + case {case_id}")

        return {
            "status": "success",
            "client_id": client_id,
            "case_id": case_id,
            "client_name": name,
            "defendants_linked": len(defendant_list),
            "documents_attached": len(doc_urls),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Webhook processing failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Webhook processing failed: {type(e).__name__}: {str(e)[:500]}",
        )


# ---------------------------------------------------------------------------
# POST /webhook — generic webhook (Zapier, Make.com, etc.)
# ---------------------------------------------------------------------------

@router.post("/webhook", status_code=status.HTTP_201_CREATED)
async def generic_webhook(request: Request):
    """Generic webhook for any integration platform (Zapier, Make, etc.)."""
    return await suitedash_webhook(request)


# ---------------------------------------------------------------------------
# GET /status — check integration configuration
# ---------------------------------------------------------------------------

@router.get("/status")
async def integration_status():
    """Return the webhook URL and configuration status."""
    return {
        "suitedash_webhook_url": "/integrations/suitedash/webhook",
        "generic_webhook_url": "/integrations/webhook",
        "webhook_secret_configured": bool(WEBHOOK_SECRET),
        "instructions": (
            "Configure SuiteDash to POST form submissions to: "
            "https://[your-railway-url]/integrations/suitedash/webhook "
            "When a client submits an intake form, their profile and case "
            "will be automatically created in LegalFlow."
        ),
    }
