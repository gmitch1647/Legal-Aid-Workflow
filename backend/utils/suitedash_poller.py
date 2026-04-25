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

SUITEDASH_BASE = "https://app.suitedash.com/api/v1"


def _get_headers() -> dict:
    """Build SuiteDash API auth headers."""
    public_key = os.environ.get("SUITEDASH_API_KEY", "")
    secret_key = os.environ.get("SUITEDASH_SECRET_KEY", "")
    return {
        "X-Public-Key": public_key,
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
    """Test the SuiteDash API connection and discover available endpoints."""
    public_key = os.environ.get("SUITEDASH_API_KEY", "")
    secret_key = os.environ.get("SUITEDASH_SECRET_KEY", "")

    results = {
        "configured": is_configured(),
        "tests": [],
    }

    # Try different base URLs
    base_urls = [
        "https://app.suitedash.com/api/v1",
        "https://app.suitedash.com/api",
        "https://app.suitedash.com/secure/api/v1",
        "https://app.suitedash.com/secure/api",
    ]

    # Try different auth header formats
    auth_variants = [
        {"X-Public-Key": public_key, "X-Secret-Key": secret_key},
        {"X-Public-ID": public_key, "X-Secret-Key": secret_key},
        {"Public-ID": public_key, "Secret-Key": secret_key},
        {"Authorization": f"Bearer {public_key}"},
        {"Authorization": f"Bearer {secret_key}"},
        {"x-api-key": public_key},
        {"x-api-key": secret_key},
    ]

    endpoints = ["/contacts", "/forms", "/me", "/account", "/projects", "/clients"]

    async with httpx.AsyncClient(timeout=10) as client:
        for base in base_urls:
            for auth_headers in auth_variants:
                headers = {**auth_headers, "Accept": "application/json"}
                for endpoint in endpoints:
                    url = f"{base}{endpoint}"
                    try:
                        resp = await client.get(url, headers=headers)
                        if resp.status_code in (200, 201):
                            entry = {
                                "url": url,
                                "auth": list(auth_headers.keys()),
                                "status": resp.status_code,
                                "working": True,
                            }
                            try:
                                body = resp.json()
                                if isinstance(body, dict):
                                    entry["keys"] = list(body.keys())[:15]
                                elif isinstance(body, list):
                                    entry["count"] = len(body)
                                    if body and isinstance(body[0], dict):
                                        entry["first_keys"] = list(body[0].keys())[:15]
                            except Exception:
                                entry["body_preview"] = resp.text[:300]
                            results["tests"].append(entry)
                            # Found a working combo — no need to test more auth for this base+endpoint
                            break
                    except Exception:
                        pass
                else:
                    continue
                break  # Found working auth for this base URL

        # If nothing worked, report the last few attempts for debugging
        if not results["tests"]:
            # Try one more thing — just hit the base URLs directly
            for base in base_urls:
                for auth_headers in auth_variants[:3]:
                    headers = {**auth_headers, "Accept": "application/json"}
                    try:
                        resp = await client.get(base, headers=headers)
                        results["tests"].append({
                            "url": base,
                            "auth": list(auth_headers.keys()),
                            "status": resp.status_code,
                            "body_preview": resp.text[:300],
                        })
                    except Exception as e:
                        results["tests"].append({
                            "url": base,
                            "error": str(e),
                        })

    return results


async def fetch_recent_contacts(since_minutes: int = 10) -> list[dict]:
    """Fetch contacts created in the last N minutes from SuiteDash."""
    headers = _get_headers()

    async with httpx.AsyncClient(timeout=30) as client:
        # Try the contacts endpoint with recent filter
        url = f"{SUITEDASH_BASE}/contacts"
        params = {
            "per_page": 50,
            "sort": "-created_at",
        }

        try:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code != 200:
                logger.warning(f"SuiteDash contacts API returned {resp.status_code}: {resp.text[:200]}")
                return []

            body = resp.json()
            contacts = []

            # Handle different response formats
            if isinstance(body, list):
                contacts = body
            elif isinstance(body, dict):
                contacts = body.get("data") or body.get("contacts") or body.get("results") or []

            # Filter to only recent contacts
            cutoff = datetime.now(timezone.utc).timestamp() - (since_minutes * 60)
            recent = []
            for c in contacts:
                created = c.get("created_at") or c.get("created") or c.get("date_created") or ""
                if created:
                    try:
                        if isinstance(created, (int, float)):
                            ts = created
                        else:
                            ts = datetime.fromisoformat(str(created).replace("Z", "+00:00")).timestamp()
                        if ts >= cutoff:
                            recent.append(c)
                    except Exception:
                        recent.append(c)  # Include if we can't parse the date
                else:
                    recent.append(c)  # Include if no date

            return recent

        except Exception as e:
            logger.error(f"SuiteDash API error: {e}")
            return []


async def poll_and_create_cases() -> dict:
    """Poll SuiteDash for new contacts and create cases in LegalFlow."""
    if not is_configured():
        return {"status": "skipped", "reason": "SuiteDash not configured"}

    from utils.supabase_client import get_supabase
    supabase = get_supabase()

    contacts = await fetch_recent_contacts(since_minutes=10)
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
