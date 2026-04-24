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
        # Check if client already exists
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

    # Create new client profile
    # First create auth user (or skip if no email)
    profile_id = str(uuid.uuid4())

    if email:
        try:
            # Try to create Supabase auth user
            auth_resp = supabase.auth.admin.create_user({
                "email": email,
                "email_confirm": True,
                "user_metadata": {"full_name": name},
            })
            if auth_resp and auth_resp.user:
                profile_id = str(auth_resp.user.id)
        except Exception as e:
            logger.warning(f"Could not create auth user for {email}: {e}")
            # Check if user already exists in auth
            try:
                users = supabase.auth.admin.list_users()
                for u in users:
                    if hasattr(u, 'email') and u.email == email:
                        profile_id = str(u.id)
                        break
            except Exception:
                pass

    # Create profile row
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
        # Profile might already exist (race condition)
        logger.warning(f"Could not create profile for {email}: {e}")
        existing = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
        if existing.data:
            profile_id = existing.data[0]["id"]

    return profile_id


# ---------------------------------------------------------------------------
# POST /suitedash/webhook — receive case submission from SuiteDash
# ---------------------------------------------------------------------------

@router.post("/suitedash/webhook", status_code=status.HTTP_201_CREATED)
async def suitedash_webhook(body: SuiteDashWebhook, request: Request):
    """Receive a case submission from SuiteDash.

    Creates a client profile and case record in LegalFlow.
    SuiteDash should be configured to POST to this URL when
    a new intake form is submitted.
    """
    # Verify webhook secret if configured
    if not _verify_webhook(request):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    supabase = get_supabase()

    # Parse client name
    name = (
        body.full_name or
        body.name or
        f"{body.first_name or ''} {body.last_name or ''}".strip() or
        "Unknown Client"
    )

    # Parse case facts from various possible fields
    facts = (
        body.case_facts or
        body.case_description or
        body.what_happened or
        body.description or
        body.details or
        ""
    )

    # Parse damages
    damages = body.damages or body.damages_description or body.harm or ""

    # Parse defendants
    defendant_list = []
    if body.defendant_names:
        defendant_list = body.defendant_names
    elif body.defendants:
        defendant_list = [d.strip() for d in body.defendants.split(",") if d.strip()]
    elif body.defendant_name:
        defendant_list = [body.defendant_name]

    # Parse documents
    doc_urls = body.document_urls or body.attachments or []
    if body.files:
        for f in body.files:
            if isinstance(f, dict) and f.get("url"):
                doc_urls.append(f["url"])

    # Build address
    address_parts = [body.address or ""]
    if body.city:
        address_parts.append(body.city)
    if body.state:
        address_parts.append(body.state)
    if body.zip_code:
        address_parts.append(body.zip_code)
    address = ", ".join(p for p in address_parts if p)

    # 1. Find or create client
    client_id = _find_or_create_client(
        supabase,
        name=name,
        email=body.email or "",
        phone=body.phone or "",
        address=address,
        county=body.county or "",
        state=body.state or "Georgia",
    )

    # 2. Create case record
    now = datetime.now(timezone.utc).isoformat()

    # Build structured case_facts with plaintiff header
    structured_facts = (
        f"=== PLAINTIFF ===\n"
        f"Name: {name}\n"
        f"County of Residence: {body.county or 'Unknown'}, {body.state or 'Georgia'}\n\n"
        f"=== SOURCE ===\n"
        f"Submitted via: SuiteDash\n"
        f"Form: {body.form_name or 'intake'}\n"
        f"Submission ID: {body.submission_id or 'N/A'}\n"
        f"Submitted at: {body.submitted_at or now}\n\n"
        f"=== CASE FACTS ===\n{facts}\n\n"
        f"=== DAMAGES DESCRIBED ===\n{damages}"
    )

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
            # Check if defendant exists
            d = supabase.table("defendants").select("id").ilike("name", dname.strip()).limit(1).execute()
            if d.data:
                def_id = d.data[0]["id"]
            else:
                # Create custom defendant
                ins = supabase.table("defendants").insert({
                    "name": dname.strip(),
                    "is_custom": True,
                }).execute()
                def_id = ins.data[0]["id"] if ins.data else None

            if def_id:
                supabase.table("case_defendants").insert({
                    "case_id": case_id,
                    "defendant_id": def_id,
                }).execute()
        except Exception as e:
            logger.warning(f"Could not link defendant {dname}: {e}")

    # 4. Download and attach documents
    for doc_url in doc_urls:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(doc_url, follow_redirects=True, timeout=30)
                if resp.status_code == 200:
                    filename = doc_url.split("/")[-1].split("?")[0] or "document"
                    storage_path = f"cases/{case_id}/{filename}"
                    supabase.storage.from_("documents").upload(
                        storage_path,
                        resp.content,
                        {"content-type": resp.headers.get("content-type", "application/octet-stream")},
                    )
                    supabase.table("case_documents").insert({
                        "case_id": case_id,
                        "file_name": filename,
                        "file_type": filename.split(".")[-1] if "." in filename else "bin",
                        "storage_path": storage_path,
                        "document_category": "other",
                        "uploaded_by": client_id,
                    }).execute()
        except Exception as e:
            logger.warning(f"Could not download document {doc_url}: {e}")

    # 5. Notify attorney
    try:
        from utils.notifications import notify_attorney_new_submission
        notify_attorney_new_submission(case_id=case_id, client_name=name)
    except Exception as e:
        logger.warning(f"Notification failed: {e}")

    logger.info(f"SuiteDash webhook: created client {name} ({body.email}) + case {case_id}")

    return {
        "status": "success",
        "client_id": client_id,
        "case_id": case_id,
        "client_name": name,
        "defendants_linked": len(defendant_list),
        "documents_attached": len(doc_urls),
    }


# ---------------------------------------------------------------------------
# POST /webhook — generic webhook (Zapier, Make.com, etc.)
# ---------------------------------------------------------------------------

@router.post("/webhook", status_code=status.HTTP_201_CREATED)
async def generic_webhook(body: GenericWebhook, request: Request):
    """Generic webhook for any integration platform (Zapier, Make, etc.)."""
    if not _verify_webhook(request):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    # Convert to SuiteDash format and reuse
    sd = SuiteDashWebhook(
        full_name=body.client_name,
        email=body.client_email,
        phone=body.client_phone,
        case_facts=body.case_facts,
        damages=body.damages,
        defendant_names=body.defendants,
        document_urls=body.documents,
        source=body.source or "webhook",
    )
    return await suitedash_webhook(sd, request)


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
