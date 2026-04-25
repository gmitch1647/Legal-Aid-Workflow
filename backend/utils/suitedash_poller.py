"""
SuiteDash API Poller — checks for new form submissions periodically.

Polls the SuiteDash API every N minutes for new contacts/form submissions
and creates cases in LegalFlow automatically.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

SUITEDASH_BASE = "https://app.suitedash.com/secure-api"


def _get_headers() -> dict:
    """Build SuiteDash API auth headers."""
    public_key = os.environ.get("SUITEDASH_API_KEY", "")
    secret_key = os.environ.get("SUITEDASH_SECRET_KEY", "")
    return {
        "X-Public-ID": public_key,
        "X-Secret-Key": secret_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(
        os.environ.get("SUITEDASH_API_KEY") and
        os.environ.get("SUITEDASH_SECRET_KEY")
    )


async def test_connection() -> dict:
    """Quick test of SuiteDash API — tries the most likely combos only."""
    public_key = os.environ.get("SUITEDASH_API_KEY", "")
    secret_key = os.environ.get("SUITEDASH_SECRET_KEY", "")

    results = {"configured": is_configured(), "tests": []}

    combos = [
        ("https://app.suitedash.com/secure-api/contacts", {"X-Public-ID": public_key, "X-Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/contacts", {"X-Public-Key": public_key, "X-Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/contacts", {"Public-ID": public_key, "Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/forms", {"X-Public-ID": public_key, "X-Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/me", {"X-Public-ID": public_key, "X-Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/clients", {"X-Public-ID": public_key, "X-Secret-Key": secret_key}),
        ("https://app.suitedash.com/secure-api/leads", {"X-Public-ID": public_key, "X-Secret-Key": secret_key}),
    ]

    async with httpx.AsyncClient(timeout=8) as client:
        for url, auth in combos:
            try:
                resp = await client.get(url, headers={**auth, "Accept": "application/json"})
                entry = {"url": url, "auth": list(auth.keys()), "status": resp.status_code}
                if resp.status_code == 200:
                    try:
                        body = resp.json()
                        entry["keys"] = list(body.keys())[:10] if isinstance(body, dict) else ["list", len(body)]
                    except Exception:
                        entry["preview"] = resp.text[:200]
                elif resp.status_code in (401, 403):
                    entry["preview"] = resp.text[:200]
                results["tests"].append(entry)
            except Exception as e:
                results["tests"].append({"url": url, "error": str(e)[:100]})

    return results


async def fetch_all_contacts() -> list[dict]:
    """Fetch all contacts from SuiteDash."""
    headers = _get_headers()
    all_contacts = []
    page = 1

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            url = f"{SUITEDASH_BASE}/contacts"
            params = {"page": page}

            try:
                resp = await client.get(url, headers=headers, params=params)
                if resp.status_code != 200:
                    logger.warning(f"SuiteDash API returned {resp.status_code}: {resp.text[:200]}")
                    break

                body = resp.json()
                if not body.get("success"):
                    break

                contacts = body.get("data") or []
                if not contacts:
                    break

                all_contacts.extend(contacts)
                logger.info(f"Fetched page {page}: {len(contacts)} contacts")

                # Check if there are more pages
                meta = body.get("meta") or {}
                total_pages = meta.get("last_page") or meta.get("total_pages") or 1
                if page >= total_pages:
                    break
                page += 1

                # Safety limit
                if page > 20:
                    break

            except Exception as e:
                logger.error(f"SuiteDash API error on page {page}: {e}")
                break

    return all_contacts


async def fetch_contact_detail(contact_uid: str) -> dict:
    """Fetch a single contact's full details from SuiteDash."""
    headers = _get_headers()
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(f"{SUITEDASH_BASE}/contacts/{contact_uid}", headers=headers)
            if resp.status_code == 200:
                body = resp.json()
                return body.get("data") or body
        except Exception as e:
            logger.warning(f"Could not fetch contact {contact_uid}: {e}")
    return {}


async def poll_and_create_cases() -> dict:
    """Poll SuiteDash for new contacts and create cases in LegalFlow."""
    if not is_configured():
        return {"status": "skipped", "reason": "SuiteDash not configured"}

    from utils.supabase_client import get_supabase
    supabase = get_supabase()

    contacts = await fetch_all_contacts()
    if not contacts:
        return {"status": "ok", "new_contacts": 0, "cases_created": 0}

    cases_created = 0
    errors = []

    for contact in contacts:
        email = contact.get("email") or contact.get("primary_email") or ""
        if not email:
            continue

        # Check if we already have this client
        try:
            existing = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
            if existing.data:
                continue  # Already imported
        except Exception:
            pass

        # Extract fields
        name = (
            contact.get("full_name") or
            contact.get("name") or
            f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip() or
            "Unknown Client"
        )
        phone = contact.get("phone") or contact.get("primary_phone") or ""
        address = contact.get("address") or contact.get("street") or ""
        city = contact.get("city") or ""
        state = contact.get("state") or "Georgia"
        county = contact.get("county") or ""

        # Create via the webhook handler (reuses all the logic)
        try:
            from routers.integrations import _find_or_create_client
            client_id = _find_or_create_client(
                supabase, name=name, email=email, phone=phone,
                address=f"{address}, {city}, {state}".strip(", "),
                county=county, state=state,
            )

            now = datetime.now(timezone.utc).isoformat()
            case_resp = supabase.table("cases").insert({
                "client_id": client_id,
                "status": "submitted",
                "case_facts": f"=== PLAINTIFF ===\nName: {name}\nCounty of Residence: {county or 'Unknown'}, {state}\n\n=== SOURCE ===\nSubmitted via: SuiteDash API Poll\nImported at: {now}\n\n=== CASE FACTS ===\nAwaiting details — client imported from SuiteDash.\n\n=== DAMAGES DESCRIBED ===\n",
                "created_at": now,
                "updated_at": now,
            }).execute()

            if case_resp.data:
                cases_created += 1
                logger.info(f"Created case for SuiteDash contact: {name} ({email})")

                # Notify attorney
                try:
                    from utils.notifications import notify_attorney_new_submission
                    notify_attorney_new_submission(case_id=case_resp.data[0]["id"], client_name=name)
                except Exception:
                    pass

        except Exception as e:
            errors.append(f"{name}: {e}")
            logger.warning(f"Could not create case for {name}: {e}")

    return {
        "status": "ok",
        "contacts_found": len(contacts),
        "cases_created": cases_created,
        "errors": errors,
    }
