"""
Public Intake Form router — no auth required.

Accepts case submissions from the public intake form, creates the
client profile and case in LegalFlow, and pushes the contact to
SuiteDash via their API so the client exists in both systems.
"""

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from typing import Optional

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


class IntakeSubmission(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    date_of_birth: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    case_type: Optional[str] = None
    violation_type: Optional[str] = None
    specific_violation: Optional[str] = None
    adverse_party: Optional[str] = None
    brief_description: Optional[str] = None
    affiliate_name: Optional[str] = None


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_intake(body: IntakeSubmission):
    """Public endpoint — no auth required. Creates client + case in
    LegalFlow and pushes contact to SuiteDash."""

    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    name = f"{body.first_name} {body.last_name}".strip()

    # ── 1. Create client in LegalFlow ────────────────────────────────
    # Check if client already exists
    profile_id = None
    try:
        existing = supabase.table("profiles").select("id").eq("email", body.email).limit(1).execute()
        if existing.data:
            profile_id = existing.data[0]["id"]
    except Exception:
        pass

    if not profile_id:
        # Create auth user + profile
        try:
            import secrets, string
            temp_pw = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
            auth_resp = supabase.auth.admin.create_user({
                "email": body.email,
                "password": temp_pw,
                "email_confirm": True,
                "user_metadata": {"full_name": name},
            })
            if auth_resp and hasattr(auth_resp, 'user') and auth_resp.user:
                profile_id = str(auth_resp.user.id)
        except Exception as e:
            logger.warning(f"Auth user creation failed: {e}")

        if not profile_id:
            # Fallback — use attorney profile
            try:
                atty = supabase.table("profiles").select("id").eq("role", "attorney").limit(1).execute()
                if atty.data:
                    profile_id = atty.data[0]["id"]
            except Exception:
                pass

        if not profile_id:
            raise HTTPException(status_code=500, detail="Could not create client")

        # Create profile row
        try:
            full_address = ", ".join(p for p in [body.address, body.city, body.state, body.zip_code] if p)
            supabase.table("profiles").insert({
                "id": profile_id,
                "role": "client",
                "full_name": name,
                "email": body.email,
                "phone": body.phone or "",
                "address": full_address,
                "county": "",
                "state": body.state or "",
            }).execute()
        except Exception as e:
            logger.warning(f"Profile insert failed (may exist): {e}")

    # ── 2. Create case in LegalFlow ──────────────────────────────────
    defendants = [d.strip() for d in (body.adverse_party or "").split(",") if d.strip()]
    full_address = ", ".join(p for p in [body.address, body.city, body.state, body.zip_code] if p)

    structured_facts = (
        f"=== PLAINTIFF ===\n"
        f"Name: {name}\n"
        f"Date of Birth: {body.date_of_birth or 'N/A'}\n"
        f"Address: {full_address}\n"
        f"Phone: {body.phone}\n"
        f"Email: {body.email}\n\n"
        f"=== CASE INFORMATION ===\n"
        f"Case Type: {body.case_type or 'Not specified'}\n"
        f"Type of Violation: {body.violation_type or 'Not specified'}\n"
        f"Specific Violation: {body.specific_violation or 'Not specified'}\n"
        f"Adverse Party: {', '.join(defendants) if defendants else 'Not specified'}\n"
        f"Affiliate: {body.affiliate_name or 'N/A'}\n\n"
        f"=== SOURCE ===\n"
        f"Submitted via: LegalFlow Intake Form\n"
        f"Submitted at: {now}\n\n"
        f"=== CASE FACTS ===\n{body.brief_description or 'Awaiting details'}\n\n"
        f"=== DAMAGES DESCRIBED ===\n"
    )

    case_resp = supabase.table("cases").insert({
        "client_id": profile_id,
        "status": "submitted",
        "case_facts": structured_facts,
        "damages_description": "",
        "created_at": now,
        "updated_at": now,
    }).execute()

    case_id = case_resp.data[0]["id"] if case_resp.data else None

    # Link defendants
    if case_id:
        for dname in defendants:
            try:
                d = supabase.table("defendants").select("id").ilike("name", dname).limit(1).execute()
                if d.data:
                    def_id = d.data[0]["id"]
                else:
                    ins = supabase.table("defendants").insert({"name": dname, "is_custom": True}).execute()
                    def_id = ins.data[0]["id"] if ins.data else None
                if def_id:
                    supabase.table("case_defendants").insert({"case_id": case_id, "defendant_id": def_id}).execute()
            except Exception:
                pass

    # Notify attorney
    try:
        from utils.notifications import notify_attorney_new_submission
        if case_id:
            notify_attorney_new_submission(case_id=case_id, client_name=name)
    except Exception:
        pass

    # ── 3. Push contact to SuiteDash ─────────────────────────────────
    suitedash_synced = False
    sd_public = os.environ.get("SUITEDASH_API_KEY", "")
    sd_secret = os.environ.get("SUITEDASH_SECRET_KEY", "")

    if sd_public and sd_secret:
        try:
            sd_payload = {
                "first_name": body.first_name,
                "last_name": body.last_name,
                "email": body.email,
                "phone": body.phone,
                "role": "Client",
                "address": {
                    "address_line_1": body.address or "",
                    "city": body.city or "",
                    "state": body.state or "",
                    "country": "US",
                    "zip": body.zip_code or "",
                },
            }
            if body.affiliate_name:
                sd_payload["tags"] = ["Intake-Form", body.affiliate_name]
            else:
                sd_payload["tags"] = ["Intake-Form"]

            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://app.suitedash.com/secure-api/contacts",
                    headers={
                        "X-Public-ID": sd_public,
                        "X-Secret-Key": sd_secret,
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json=sd_payload,
                )
                if resp.status_code in (200, 201):
                    suitedash_synced = True
                    logger.info(f"Pushed contact to SuiteDash: {name}")
                else:
                    logger.warning(f"SuiteDash sync failed: {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"SuiteDash sync error: {e}")

    logger.info(f"Intake submitted: {name} ({body.email}), case={case_id}, suitedash={suitedash_synced}")

    return {
        "status": "success",
        "message": f"Thank you {body.first_name}. Your case has been submitted and is under review.",
        "case_id": case_id,
        "suitedash_synced": suitedash_synced,
    }


@router.post("/submit-with-files", status_code=status.HTTP_201_CREATED)
async def submit_intake_with_files(
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    date_of_birth: str = Form(""),
    address: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    zip_code: str = Form(""),
    case_type: str = Form(""),
    violation_type: str = Form(""),
    specific_violation: str = Form(""),
    adverse_party: str = Form(""),
    brief_description: str = Form(""),
    affiliate_name: str = Form(""),
    files: list[UploadFile] = File(default=[]),
):
    """Same as /submit but accepts multipart form data with file uploads."""
    # First create the case via the JSON endpoint
    body = IntakeSubmission(
        first_name=first_name, last_name=last_name, email=email, phone=phone,
        date_of_birth=date_of_birth, address=address, city=city, state=state,
        zip_code=zip_code, case_type=case_type, violation_type=violation_type,
        specific_violation=specific_violation, adverse_party=adverse_party,
        brief_description=brief_description, affiliate_name=affiliate_name,
    )
    result = await submit_intake(body)
    case_id = result.get("case_id")

    # Upload files
    files_uploaded = 0
    if case_id and files:
        supabase = get_supabase()
        for file in files:
            if not file.filename:
                continue
            try:
                content = await file.read()
                if not content:
                    continue
                safe_name = file.filename.replace(" ", "_")
                storage_path = f"cases/{case_id}/{safe_name}"
                supabase.storage.from_("documents").upload(
                    storage_path, content,
                    {"content-type": file.content_type or "application/octet-stream"},
                )
                supabase.table("case_documents").insert({
                    "case_id": case_id,
                    "file_name": file.filename,
                    "file_type": file.filename.split(".")[-1] if "." in file.filename else "bin",
                    "storage_path": storage_path,
                    "document_category": "other",
                }).execute()
                files_uploaded += 1
            except Exception as e:
                logger.warning(f"File upload failed for {file.filename}: {e}")

    result["files_uploaded"] = files_uploaded
    return result
