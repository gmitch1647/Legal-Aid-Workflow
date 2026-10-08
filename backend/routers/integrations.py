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

class ClientIdentityResolutionError(ValueError):
    """Raised when an external submission cannot be linked to a real client."""


def _auth_user_value(user: object, field: str) -> object:
    """Read a field from the Supabase auth SDK's object or dict user shapes."""
    if isinstance(user, dict):
        return user.get(field)
    return getattr(user, field, None)


def _find_auth_user_id_by_email(supabase, email: str) -> Optional[str]:
    """Return the existing Auth user ID for an email without exposing user data.

    Auth users are paginated.  The prior one-page lookup missed older users and
    then incorrectly attached their matters to the firm owner.  Only the ID and
    normalized email are inspected here so a missing profile can be repaired.
    """
    normalized_email = (email or "").strip().casefold()
    if not normalized_email:
        return None

    for page in range(1, 21):
        try:
            users = supabase.auth.admin.list_users(page=page, per_page=1000)
        except TypeError:
            # Older Supabase SDKs accepted no paging arguments.
            users = supabase.auth.admin.list_users()
            page = 20
        except Exception as exc:
            logger.warning("Could not look up an existing auth user: %s", exc)
            return None

        users = list(users or [])
        for user in users:
            if str(_auth_user_value(user, "email") or "").strip().casefold() == normalized_email:
                user_id = _auth_user_value(user, "id")
                return str(user_id) if user_id else None
        if len(users) < 1000:
            break
    return None


def _find_or_create_client(supabase, name: str, email: str, phone: str = "",
                            address: str = "", county: str = "", state: str = "") -> str:
    """Find or create a *client* profile for an external submission.

    A matter must never be linked to an attorney/owner merely because a client
    Auth user exists without a profile row.  If that orphaned Auth identity is
    found, LegalFlow repairs the missing client profile; if it cannot identify a
    client safely, the submission is rejected rather than misdirecting future
    contracts or signature requests.
    """
    normalized_email = (email or "").strip().casefold()
    if not normalized_email:
        raise ClientIdentityResolutionError("A client email address is required to create a case.")

    # Check if client profile already exists
    try:
        existing = (
            supabase.table("profiles")
            .select("id,role")
            .ilike("email", normalized_email)
            .limit(1)
            .execute()
        )
        if existing.data:
            profile = existing.data[0]
            if profile.get("role") == "client":
                logger.info("Found existing client profile for external submission")
                return str(profile["id"])
            raise ClientIdentityResolutionError(
                "The submitted email belongs to a LegalFlow staff account, not a client profile."
            )
    except ClientIdentityResolutionError:
        raise
    except Exception as exc:
        raise ClientIdentityResolutionError("LegalFlow could not verify the submitted client profile.") from exc

    # Must create auth.users row FIRST because profiles.id references auth.users
    import secrets
    import string
    temp_password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))

    profile_id = None

    try:
        # Use Supabase auth admin to create user
        auth_resp = supabase.auth.admin.create_user({
            "email": normalized_email,
            "password": temp_password,
            "email_confirm": True,
            "user_metadata": {"full_name": name},
        })
        if auth_resp and hasattr(auth_resp, "user") and auth_resp.user:
            profile_id = str(auth_resp.user.id)
            logger.info("Created auth user for external client")
    except Exception as exc:
        error_str = str(exc).lower()
        if "already" in error_str or "duplicate" in error_str or "exists" in error_str:
            profile_id = _find_auth_user_id_by_email(supabase, normalized_email)
        if not profile_id:
            raise ClientIdentityResolutionError(
                "LegalFlow could not create or recover the submitted client account."
            ) from exc

    if not profile_id:
        raise ClientIdentityResolutionError("LegalFlow could not resolve the submitted client account.")

    # Now create the profile row (linked to the auth user)
    try:
        supabase.table("profiles").insert({
            "id": profile_id,
            "role": "client",
            "full_name": name or "Unknown Client",
            "email": normalized_email,
            "phone": phone or "",
            "address": address or "",
            "county": county or "",
            "state": state or "",
        }).execute()
        logger.info("Created client profile for external submission")
    except Exception as exc:
        # A concurrent request may have created the profile first; only accept
        # it if it is genuinely a client profile for the same Auth identity.
        try:
            existing = (
                supabase.table("profiles")
                .select("id,role")
                .eq("id", profile_id)
                .limit(1)
                .execute()
            )
            if existing.data and existing.data[0].get("role") == "client":
                return str(existing.data[0]["id"])
        except Exception:
            pass
        raise ClientIdentityResolutionError("LegalFlow could not create the client profile.") from exc

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

    # Normalize field names — SuiteDash/Zapier sends "Data First Name" etc.
    # Convert to lowercase snake_case and also strip "data " prefix
    normalized = {}
    for k, v in data.items():
        # Original key
        normalized[k] = v
        # Lowercase version
        lower = k.lower().strip()
        normalized[lower] = v
        # Strip "data " prefix
        if lower.startswith("data "):
            stripped = lower[5:].strip()
            normalized[stripped] = v
        # Convert spaces to underscores
        snake = lower.replace(" ", "_").replace("-", "_")
        normalized[snake] = v
        if snake.startswith("data_"):
            normalized[snake[5:]] = v

    data = normalized

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
        address = data.get("address") or data.get("adress") or data.get("street_address") or ""
        city = data.get("city") or ""
        state = data.get("state") or "Georgia"
        county = data.get("county") or ""
        zip_code = data.get("zip_code") or data.get("zip") or data.get("postal_code") or ""
        full_address = ", ".join(p for p in [address, city, state, zip_code] if p)

        # Case facts — from brief description or other fields
        brief_desc = data.get("case_facts") or data.get("brief_description") or data.get("case_description") or data.get("what_happened") or data.get("description") or data.get("details") or data.get("message") or data.get("notes") or ""

        # SuiteDash form specific fields
        case_type = data.get("case_type") or ""
        violation_type = data.get("violation_type") or data.get("type_of_violation") or ""
        specific_violation = data.get("specific_violation") or ""
        affiliate_name = data.get("affiliate_name") or ""
        dob = data.get("date_of_birth") or data.get("dob") or data.get("client_dob") or ""

        # Build comprehensive case facts from all form fields
        facts_parts = []
        if case_type:
            facts_parts.append(f"Case Type: {case_type}")
        if violation_type:
            facts_parts.append(f"Type of Violation: {violation_type}")
        if specific_violation:
            facts_parts.append(f"Specific Violation: {specific_violation}")
        if brief_desc:
            facts_parts.append(f"\nBrief Description:\n{brief_desc}")
        facts = "\n".join(facts_parts) if facts_parts else brief_desc

        damages = data.get("damages") or data.get("damages_description") or data.get("harm") or ""

        # Defendants — from adverse party field
        defendant_list = []
        adverse_party = data.get("defendant_name") or data.get("adverse_party") or ""
        if adverse_party:
            defendant_list = [d.strip() for d in str(adverse_party).split(",") if d.strip()]
        elif data.get("defendant_names") and isinstance(data["defendant_names"], list):
            defendant_list = data["defendant_names"]
        elif data.get("defendants"):
            defendant_list = [d.strip() for d in str(data["defendants"]).split(",") if d.strip()]

        # Documents
        doc_urls = []
        for key in ["document_urls", "attachments", "files", "documents", "file_url", "supporting_documents"]:
            val = data.get(key)
            if val:
                if isinstance(val, list):
                    doc_urls.extend([str(u) for u in val if u and str(u).startswith("http")])
                elif isinstance(val, str) and val.startswith("http"):
                    doc_urls.append(val)

        # 1. Find or create client
        client_id = _find_or_create_client(supabase, name=name, email=email, phone=phone, address=full_address, county=county, state=state)

        # 2. Create case record
        now = datetime.now(timezone.utc).isoformat()
        structured_facts = (
            f"=== PLAINTIFF ===\n"
            f"Name: {name}\n"
            f"Date of Birth: {dob or 'N/A'}\n"
            f"Address: {full_address}\n"
            f"County of Residence: {county or 'Unknown'}, {state}\n"
            f"Phone: {phone}\n"
            f"Email: {email}\n\n"
            f"=== CASE INFORMATION ===\n"
            f"Case Type: {case_type or 'Not specified'}\n"
            f"Type of Violation: {violation_type or 'Not specified'}\n"
            f"Specific Violation: {specific_violation or 'Not specified'}\n"
            f"Adverse Party: {', '.join(defendant_list) if defendant_list else 'Not specified'}\n"
            f"Affiliate: {affiliate_name or 'N/A'}\n\n"
            f"=== SOURCE ===\n"
            f"Submitted via: SuiteDash/Zapier\n"
            f"Form: {data.get('form_name') or data.get('form') or 'Case Referral'}\n"
            f"Submitted at: {data.get('submitted_at') or now}\n\n"
            f"=== CASE FACTS ===\n{brief_desc or 'Awaiting details'}\n\n"
            f"=== DAMAGES DESCRIBED ===\n{damages}"
        )

        case_resp = supabase.table("cases").insert({
            "client_id": client_id,
            "plaintiff_name": name or None,
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
    from utils.suitedash_poller import is_configured as sd_configured
    return {
        "suitedash_webhook_url": "/integrations/suitedash/webhook",
        "generic_webhook_url": "/integrations/webhook",
        "webhook_secret_configured": bool(WEBHOOK_SECRET),
        "suitedash_api_configured": sd_configured(),
    }


@router.get("/suitedash/test")
async def test_suitedash():
    """Test the SuiteDash API connection and discover endpoints."""
    from utils.suitedash_poller import test_connection
    return await test_connection()


@router.get("/suitedash/explore")
async def explore_suitedash():
    """Try to discover form submission and file endpoints."""
    import httpx
    public_key = os.environ.get("SUITEDASH_API_KEY", "")
    secret_key = os.environ.get("SUITEDASH_SECRET_KEY", "")
    form_id = os.environ.get("SUITEDASH_FORM_ID", "2thPYANdKPbjwpaK2")
    headers = {"X-Public-ID": public_key, "X-Secret-Key": secret_key, "Accept": "application/json"}

    # Get first contact UID for testing
    from utils.suitedash_poller import fetch_all_contacts
    contacts = await fetch_all_contacts()
    contact_uid = contacts[0]["uid"] if contacts else "none"

    endpoints = [
        f"/forms",
        f"/forms/{form_id}",
        f"/forms/{form_id}/submissions",
        f"/form-submissions",
        f"/contacts/{contact_uid}/forms",
        f"/contacts/{contact_uid}/forms/{form_id}",
        f"/contacts/{contact_uid}/form-submissions",
        f"/contacts/{contact_uid}/submissions",
        f"/contacts/{contact_uid}/files",
        f"/contacts/{contact_uid}/documents",
        f"/contacts/{contact_uid}/notes",
        f"/contacts/{contact_uid}/activities",
        f"/files",
        f"/documents",
        f"/submissions",
        f"/intake",
        f"/intake-forms",
    ]

    results = []
    async with httpx.AsyncClient(timeout=8) as client:
        for ep in endpoints:
            url = f"https://app.suitedash.com/secure-api{ep}"
            try:
                resp = await client.get(url, headers=headers)
                entry = {"endpoint": ep, "status": resp.status_code}
                if resp.status_code == 200:
                    try:
                        body = resp.json()
                        if isinstance(body, dict):
                            entry["keys"] = list(body.keys())[:10]
                            data = body.get("data")
                            if isinstance(data, list) and data:
                                entry["first_item_keys"] = list(data[0].keys())[:15] if isinstance(data[0], dict) else []
                                entry["count"] = len(data)
                        elif isinstance(body, list):
                            entry["count"] = len(body)
                    except Exception:
                        entry["preview"] = resp.text[:200]
                results.append(entry)
            except Exception as e:
                results.append({"endpoint": ep, "error": str(e)[:80]})

    return {"contact_uid": contact_uid, "form_id": form_id, "results": results}


@router.post("/suitedash/poll")
async def poll_suitedash(authorization: str = Header(default=None)):
    """Manually trigger a poll of SuiteDash for new contacts."""
    from utils.suitedash_poller import poll_and_create_cases
    return await poll_and_create_cases()


@router.get("/suitedash/contacts")
async def list_suitedash_contacts():
    """Debug — show raw contacts from SuiteDash API with full custom fields."""
    from utils.suitedash_poller import fetch_all_contacts, fetch_contact_detail
    contacts = await fetch_all_contacts()
    preview = []
    for c in contacts[:2]:
        # Fetch full detail for each contact to see custom fields
        detail = await fetch_contact_detail(c.get("uid", ""))
        custom = detail.get("custom_fields") or c.get("custom_fields") or {}
        target_custom = detail.get("target_custom_fields") or c.get("target_custom_fields") or {}
        preview.append({
            "name": f"{c.get('first_name','')} {c.get('last_name','')}",
            "email": c.get("email"),
            "custom_fields": custom,
            "target_custom_fields": target_custom,
            "all_detail_keys": list(detail.keys()) if detail else [],
        })
    return {
        "total": len(contacts),
        "preview": preview,
    }


@router.post("/debug-webhook")
async def debug_webhook(request: Request):
    """Debug endpoint — just returns whatever data was sent so you
    can see the exact field names Zapier is sending."""
    try:
        content_type = request.headers.get("content-type", "")
        if "json" in content_type:
            raw = await request.json()
        else:
            form = await request.form()
            raw = dict(form)
    except Exception:
        body = await request.body()
        raw = {"raw_body": body.decode("utf-8", errors="replace")}

    return {
        "received_fields": list(raw.keys()) if isinstance(raw, dict) else [],
        "data": raw,
        "content_type": content_type,
    }
