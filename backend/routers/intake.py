"""
Public Intake Form router — no auth required for submissions.
Also includes form management endpoints for attorneys.
"""

import logging
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel
from typing import Optional

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

REFERRAL_ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "png", "jpg", "jpeg"}
REFERRAL_MAX_FILES = 10
REFERRAL_MAX_FILE_BYTES = 10 * 1024 * 1024


async def _prepare_referral_documents(files: list[UploadFile]) -> list[dict]:
    """Validate public referral uploads before creating a client or case record."""
    candidates = [upload for upload in files if upload and upload.filename]
    if not candidates:
        raise HTTPException(status_code=422, detail="Upload at least one supporting document to submit this referral.")
    if len(candidates) > REFERRAL_MAX_FILES:
        raise HTTPException(status_code=422, detail=f"Upload no more than {REFERRAL_MAX_FILES} supporting documents at one time.")

    prepared = []
    for upload in candidates:
        original_name = os.path.basename(upload.filename or "")
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
        if extension not in REFERRAL_ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=422, detail=f"{original_name or 'This file'} is not an accepted supporting-document type.")

        content = await upload.read()
        if not content:
            raise HTTPException(status_code=422, detail=f"{original_name} is empty.")
        if len(content) > REFERRAL_MAX_FILE_BYTES:
            raise HTTPException(status_code=422, detail=f"{original_name} exceeds the 10 MB file limit.")

        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name).strip("._") or f"supporting_document.{extension}"
        prepared.append({
            "file_name": original_name,
            "safe_name": safe_name,
            "file_type": extension,
            "content_type": upload.content_type or "application/octet-stream",
            "content": content,
        })
    return prepared


async def _prepare_referral_complaint(complaint: UploadFile | None) -> dict | None:
    """Validate one optional complaint separately from supporting documents."""
    if not complaint or not getattr(complaint, "filename", None):
        return None
    return (await _prepare_referral_documents([complaint]))[0]


async def _prepare_secure_information_form(secure_information_form: UploadFile | None) -> dict | None:
    """Validate the optional secure client-information form as one private case file."""
    if not secure_information_form or not getattr(secure_information_form, "filename", None):
        return None
    return (await _prepare_referral_documents([secure_information_form]))[0]


def _store_prepared_referral_documents(
    case_id: str,
    documents: list[dict],
    *,
    complaint: dict | None = None,
    secure_information_form: dict | None = None,
) -> int:
    """Store public-referral files without public URLs, preserving special document categories."""
    supabase = get_supabase()
    items = [(document, "other") for document in documents]
    if complaint:
        items.append((complaint, "complaint"))
    if secure_information_form:
        items.append((secure_information_form, "pii"))

    uploaded = 0
    for document, category in items:
        folder = "complaints" if category == "complaint" else "secure-information" if category == "pii" else "case-submission"
        storage_path = f"cases/{case_id}/{folder}/{uuid4().hex}_{document['safe_name']}"
        try:
            supabase.storage.from_("documents").upload(
                path=storage_path,
                file=document["content"],
                file_options={
                    "content-type": document["content_type"],
                    "upsert": "false",
                },
            )
        except Exception:
            logger.exception("Could not upload referral document %s", document["file_name"])
            raise

        word_document_path = None
        if category == "complaint" and document["file_type"] == "pdf":
            try:
                from pathlib import Path
                from utils.complaint_word_converter import complaint_word_file_name, pdf_bytes_to_docx

                word_file_name = complaint_word_file_name(document["safe_name"])
                word_document_path = str(Path(storage_path).with_name(word_file_name))
                supabase.storage.from_("documents").upload(
                    path=word_document_path,
                    file=pdf_bytes_to_docx(document["content"]),
                    file_options={
                        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "upsert": "false",
                    },
                )
            except Exception as exc:
                logger.exception("Could not create Word derivative for referral complaint %s", document["file_name"])
                try:
                    supabase.storage.from_("documents").remove([storage_path])
                except Exception:
                    logger.warning("Could not clean up intake complaint source after conversion failure")
                raise HTTPException(
                    status_code=422,
                    detail="The complaint PDF could not be converted to a Word document. Upload a Word complaint or a readable PDF and try again.",
                ) from exc

        supabase.table("case_documents").insert({
            "case_id": case_id,
            "file_name": document["file_name"],
            "file_type": document["file_type"],
            "file_size": len(document["content"]),
            "storage_path": storage_path,
            "word_document_path": word_document_path,
            "document_category": category,
        }).execute()
        uploaded += 1
    return uploaded


def _active_referral_partner_for_slug(slug: str) -> dict:
    """Return the active partner workspace for a public referral-form slug."""
    cleaned_slug = re.sub(r"[^a-z0-9-]+", "", str(slug or "").strip().lower())
    if not cleaned_slug:
        raise HTTPException(status_code=404, detail="Referral workspace not found.")
    partner_response = (
        get_supabase().table("referral_partners")
        .select("id,full_name,assigned_attorney_id,pipeline_id,submission_slug,portal_active")
        .eq("submission_slug", cleaned_slug)
        .eq("portal_active", True)
        .limit(1)
        .execute()
    )
    partner = (partner_response.data or [None])[0]
    if not partner:
        raise HTTPException(status_code=404, detail="Referral workspace not found.")
    return partner


# ---------------------------------------------------------------------------
# Form Management (attorney-only)
# ---------------------------------------------------------------------------

async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


@router.get("/forms")
async def list_forms(authorization: str = Header(default=None)):
    """List all intake forms."""
    supabase = get_supabase()
    result = supabase.table("intake_forms").select("*").order("created_at").execute()
    return result.data or []


@router.get("/forms/{form_slug}")
async def get_form(form_slug: str):
    """Get a single form by slug — public endpoint for rendering the form."""
    supabase = get_supabase()
    result = supabase.table("intake_forms").select("*").eq("slug", form_slug).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Form not found")
    return result.data[0]


@router.post("/forms", status_code=status.HTTP_201_CREATED)
async def create_form(body: dict, authorization: str = Header(...)):
    """Create a new intake form."""
    profile = await _get_current_user(authorization)

    supabase = get_supabase()
    name = body.get("name", "New Form")
    slug = body.get("slug") or name.lower().replace(" ", "-").replace("_", "-")

    existing = supabase.table("intake_forms").select("id").eq("slug", slug).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"Form with slug '{slug}' already exists")

    result = supabase.table("intake_forms").insert({
        "name": name,
        "slug": slug,
        "description": body.get("description", ""),
        "fields": body.get("fields", []),
        "is_active": body.get("is_active", True),
        "settings": body.get("settings", {}),
        "created_by": profile["id"],
    }).execute()

    return result.data[0] if result.data else {}


@router.patch("/forms/{form_id}")
async def update_form(form_id: str, body: dict, authorization: str = Header(...)):
    """Update an intake form."""
    await _get_current_user(authorization)

    supabase = get_supabase()
    allowed = ["name", "description", "fields", "is_active", "settings", "slug"]
    update_data = {k: v for k, v in body.items() if k in allowed}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = supabase.table("intake_forms").update(update_data).eq("id", form_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Form not found")
    return result.data[0]


@router.delete("/forms/{form_id}")
async def delete_form(form_id: str, authorization: str = Header(...)):
    """Delete an intake form."""
    await _get_current_user(authorization)

    supabase = get_supabase()
    form = supabase.table("intake_forms").select("is_default").eq("id", form_id).limit(1).execute()
    if form.data and form.data[0].get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete the default form")

    supabase.table("intake_forms").delete().eq("id", form_id).execute()
    return {"deleted": True}


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
    requested_assistance: Optional[str] = None
    referral_slug: Optional[str] = None
    sync_to_suitedash: bool = True


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_intake(body: IntakeSubmission):
    """Public endpoint — no auth required. Creates client + case in
    LegalFlow and pushes contact to SuiteDash."""

    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    name = f"{body.first_name} {body.last_name}".strip()
    referral_workspace = _active_referral_partner_for_slug(body.referral_slug) if body.referral_slug else None
    if referral_workspace:
        # The dedicated partner link is the source of truth; do not trust a public
        # form field to choose or impersonate a referral partner.
        body.affiliate_name = referral_workspace.get("full_name") or body.affiliate_name

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
        f"Referral Organization: {body.affiliate_name or 'N/A'}\n"
        f"Requested Assistance: {body.requested_assistance or 'LegalFlow Intake Team'}\n\n"
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

    if referral_workspace and case_id:
        # Keep Ethan's referral records in the private partner pipeline while the
        # client is assigned to Esther for the legal work. The owner retains
        # firm-wide visibility through the existing attorney role.
        partner_id = referral_workspace["id"]
        client_update = {"referral_partner_id": partner_id}
        if referral_workspace.get("assigned_attorney_id"):
            client_update["assigned_attorney_id"] = referral_workspace["assigned_attorney_id"]
        supabase.table("profiles").update(client_update).eq("id", profile_id).execute()

        case_update = {"referral_partner_id": partner_id}
        if referral_workspace.get("pipeline_id"):
            case_update["pipeline_id"] = referral_workspace["pipeline_id"]
            case_update["status"] = f"{referral_workspace.get('submission_slug')}-submitted"
        supabase.table("cases").update(case_update).eq("id", case_id).execute()

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

    # The main LegalFlow owner is notified for all submissions. Partner-link
    # referrals also notify their configured working attorney (Esther for Ethan's
    # workspace) without trusting a public recipient field.
    try:
        from utils.notifications import notify_attorney_new_submission
        if case_id:
            notify_attorney_new_submission(case_id=case_id, client_name=name)
            if referral_workspace and referral_workspace.get("assigned_attorney_id"):
                notify_attorney_new_submission(
                    case_id=case_id,
                    client_name=name,
                    attorney_id=referral_workspace["assigned_attorney_id"],
                )
    except Exception:
        logger.exception("Could not create one or more intake submission notifications")

    # ── 3. Push contact to SuiteDash ─────────────────────────────────
    suitedash_synced = False
    sd_public = os.environ.get("SUITEDASH_API_KEY", "")
    sd_secret = os.environ.get("SUITEDASH_SECRET_KEY", "")

    if body.sync_to_suitedash and sd_public and sd_secret:
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
    requested_assistance: str = Form(""),
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
        requested_assistance=requested_assistance,
        sync_to_suitedash=False,
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


@router.get("/referral-config/{referral_slug}")
async def get_referral_workspace_config(referral_slug: str):
    """Public display configuration for one active referral partner form."""
    partner = _active_referral_partner_for_slug(referral_slug)
    return {
        "partner_name": partner.get("full_name") or "Referral Partner",
        "submission_slug": partner.get("submission_slug"),
        "requested_assistance": "LegalFlow Intake Team",
    }


@router.post("/referral-submit", status_code=status.HTTP_201_CREATED)
async def submit_case_referral(
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    date_of_birth: str = Form(...),
    address: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    zip_code: str = Form(...),
    case_type: str = Form(...),
    violation_type: str = Form(...),
    specific_violation: str = Form(""),
    adverse_party: str = Form(...),
    brief_description: str = Form(""),
    affiliate_name: str = Form(...),
    requested_assistance: str = Form(...),
    referral_slug: str = Form(""),
    certification: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    complaint: UploadFile | None = File(default=None),
    secure_information_form: UploadFile | None = File(default=None),
):
    """Public Case Referral Hub endpoint; every completed submission enters Submitted."""
    required_values = {
        "Client first name": first_name,
        "Client last name": last_name,
        "Client email": email,
        "Client phone": phone,
        "Client date of birth": date_of_birth,
        "Client address": address,
        "City": city,
        "State": state,
        "ZIP code": zip_code,
        "Case type": case_type,
        "Type of violation": violation_type,
        "Adverse party": adverse_party,
        "Referral organization": affiliate_name,
        "Requested assistance": requested_assistance,
    }
    missing = [label for label, value in required_values.items() if not str(value or "").strip()]
    if missing:
        raise HTTPException(status_code=422, detail=f"Complete the required field: {missing[0]}.")
    if str(certification).strip().lower() not in {"true", "1", "yes", "on"}:
        raise HTTPException(status_code=422, detail="Confirm that the referral information is accurate before submitting.")

    prepared_complaint = await _prepare_referral_complaint(complaint)
    prepared_secure_information_form = await _prepare_secure_information_form(secure_information_form)
    prepared_documents = await _prepare_referral_documents(files) if files else []
    if not prepared_documents and not prepared_complaint and not prepared_secure_information_form:
        raise HTTPException(status_code=422, detail="Upload a complaint, Secure Information Form, or at least one supporting document to submit this referral.")
    resolved_referral_slug = referral_slug.strip() if isinstance(referral_slug, str) else ""
    referral_workspace = _active_referral_partner_for_slug(resolved_referral_slug) if resolved_referral_slug else None
    # A private partner link has a fixed internal destination. It is never
    # controlled by the public “who should help” field.
    locked_assistance = "Main LegalFlow — Esther Oise" if referral_workspace else requested_assistance.strip()
    body = IntakeSubmission(
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=email.strip(),
        phone=phone.strip(),
        date_of_birth=date_of_birth.strip(),
        address=address.strip(),
        city=city.strip(),
        state=state.strip(),
        zip_code=zip_code.strip(),
        case_type=case_type.strip(),
        violation_type=violation_type.strip(),
        specific_violation=specific_violation.strip(),
        adverse_party=adverse_party.strip(),
        brief_description=brief_description.strip(),
        affiliate_name=(referral_workspace.get("full_name") if referral_workspace else affiliate_name.strip()),
        requested_assistance=locked_assistance,
        referral_slug=referral_workspace.get("submission_slug") if referral_workspace else None,
        sync_to_suitedash=False,
    )
    result = await submit_intake(body)
    case_id = result.get("case_id")
    if not case_id:
        raise HTTPException(status_code=500, detail="The case submission could not be created.")

    try:
        result["files_uploaded"] = _store_prepared_referral_documents(
            case_id,
            prepared_documents,
            complaint=prepared_complaint,
            secure_information_form=prepared_secure_information_form,
        )
        result["complaint_uploaded"] = bool(prepared_complaint)
        result["secure_information_form_uploaded"] = bool(prepared_secure_information_form)
    except Exception as exc:
        logger.exception("Case referral documents could not be stored for case %s", case_id)
        raise HTTPException(status_code=500, detail="The case was created but supporting documents could not be stored. Please contact LegalFlow support.") from exc

    result["message"] = f"Thank you {body.first_name}. Your referral is now in Case Submission for review."
    return result
