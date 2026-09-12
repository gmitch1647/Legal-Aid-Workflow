"""Dedicated credit-repair lead intake, document, and management routes."""
import html
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field

from utils.email_service import send_email
from utils.referral_portal_access import get_referral_portal_partner
from utils.supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

STORAGE_BUCKET = "documents"
MAX_LEAD_DOCUMENTS = 10
MAX_LEAD_DOCUMENT_BYTES = 15 * 1024 * 1024
MAX_LEAD_DOCUMENT_TOTAL_BYTES = 25 * 1024 * 1024
ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".heic", ".txt", ".csv",
}


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as shared
    return await shared(authorization)


def _require_staff(profile: dict) -> None:
    if profile.get("role") not in {"owner", "attorney", "staff_attorney"}:
        raise HTTPException(status_code=403, detail="Credit repair lead access is restricted to authorized staff.")


def _lead_or_404(lead_id: str) -> dict:
    result = (
        get_supabase()
        .table("credit_repair_leads")
        .select("id,referral_partner_id")
        .eq("id", lead_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return result.data[0]


def _require_lead_document_access(lead_id: str, profile: dict) -> dict:
    lead = _lead_or_404(lead_id)
    if profile.get("role") in {"owner", "attorney", "staff_attorney"}:
        return lead
    if profile.get("role") == "affiliate":
        partner = get_referral_portal_partner(get_supabase(), profile)
        if partner and str(lead.get("referral_partner_id")) == str(partner.get("id")):
            return lead
    raise HTTPException(status_code=403, detail="You do not have access to these Credit Repair documents.")


def _safe_file_name(value: str | None) -> str:
    original = os.path.basename(value or "credit_repair_document")
    normalized = "".join(character if character.isalnum() or character in {".", "-", "_", " "} else "_" for character in original).strip()
    return normalized[:180] or "credit_repair_document"


def _owner_email(supabase) -> str | None:
    """Resolve the configured LegalFlow owner with an attorney fallback."""
    try:
        reviewer = (
            supabase.table("settlement_package_reviewers")
            .select("owner_profile_id")
            .eq("active", True)
            .limit(1)
            .execute()
        )
        owner_id = ((reviewer.data or [None])[0] or {}).get("owner_profile_id")
        if owner_id:
            owner = supabase.table("profiles").select("email").eq("id", owner_id).limit(1).execute()
            email = str((((owner.data or [None])[0] or {}).get("email") or "")).strip()
            if email:
                return email
        fallback = (
            supabase.table("profiles")
            .select("email")
            .eq("role", "attorney")
            .order("created_at")
            .limit(1)
            .execute()
        )
        return str((((fallback.data or [None])[0] or {}).get("email") or "")).strip() or None
    except Exception:
        logger.exception("Could not resolve the Credit Repair Lead notification owner")
        return None


async def _notify_owner_of_new_lead(lead: dict, partner_name: str | None, document_count: int) -> None:
    """Alert the owner after a Credit Repair Lead and its attachments have saved."""
    try:
        owner_email = _owner_email(get_supabase())
        if not owner_email:
            logger.warning("No owner email is configured for Credit Repair Lead %s", lead.get("id"))
            return
        frontend_url = str(os.environ.get("FRONTEND_URL", "https://legalflow.me")).rstrip("/")
        lead_name = html.escape(str(lead.get("full_name") or "New Credit Repair lead"))
        contact = html.escape(str(lead.get("email") or lead.get("phone") or "No contact details provided"))
        issue = html.escape(str(lead.get("case_type") or "Not specified"))
        adverse_party = html.escape(str(lead.get("adverse_party") or "Not specified"))
        source = html.escape(str(partner_name or "Direct Credit Repair form"))
        document_label = f"{document_count} supporting document{'s' if document_count != 1 else ''}" if document_count else "No supporting documents"
        delivered = await send_email(
            to=owner_email,
            subject=f"New Credit Repair Lead: {lead.get('full_name') or 'New submission'}",
            body=("<div style='font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;'>"
                  "<h2 style='margin:0 0 14px;color:#047857;'>New Credit Repair Lead Submitted</h2>"
                  f"<p><strong>Lead:</strong> {lead_name}<br>"
                  f"<strong>Contact:</strong> {contact}<br>"
                  f"<strong>Issue:</strong> {issue}<br>"
                  f"<strong>Creditor or bureau:</strong> {adverse_party}<br>"
                  f"<strong>Source:</strong> {source}<br>"
                  f"<strong>Documents:</strong> {html.escape(document_label)}</p>"
                  f"<p><a href='{frontend_url}/attorney/credit-repair-leads' style='display:inline-block;background:#059669;color:#ffffff;padding:10px 14px;border-radius:7px;text-decoration:none;font-weight:bold;'>Open Credit Repair Leads</a></p>"
                  "<p style='color:#64748b;font-size:12px;'>This submission is in the separate Credit Repair workflow, not the legal case pipeline.</p>"
                  "</div>"),
            idempotency_key=f"credit-repair-lead-owner:{lead.get('id')}",
        )
        if not delivered:
            logger.warning("Owner Credit Repair Lead alert was not delivered for lead %s", lead.get("id"))
    except Exception:
        # A completed lead must remain saved if a provider is temporarily unavailable.
        logger.exception("Could not send the owner Credit Repair Lead notification for lead %s", lead.get("id"))


async def _store_lead_documents(
    lead_id: str,
    files: list[UploadFile],
    uploaded_by: str | None,
) -> list[dict]:
    if len(files) > MAX_LEAD_DOCUMENTS:
        raise HTTPException(status_code=413, detail=f"Attach no more than {MAX_LEAD_DOCUMENTS} documents.")

    prepared: list[tuple[str, str, bytes]] = []
    total_bytes = 0
    for file in files:
        file_name = _safe_file_name(file.filename)
        extension = os.path.splitext(file_name)[1].lower()
        if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail="Accepted documents are PDF, Word, image, text, or CSV files.",
            )
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"{file_name} is empty.")
        if len(content) > MAX_LEAD_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail=f"{file_name} exceeds the 15 MB per-file limit.")
        total_bytes += len(content)
        if total_bytes > MAX_LEAD_DOCUMENT_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail="Credit Repair documents may not exceed 25 MB in total.")
        prepared.append((file_name, file.content_type or "application/octet-stream", content))

    storage = get_supabase().storage.from_(STORAGE_BUCKET)
    uploaded_paths: list[str] = []
    stored_documents: list[dict] = []
    try:
        for file_name, file_type, content in prepared:
            path = f"credit-repair-leads/{lead_id}/{uuid4().hex}_{file_name}"
            storage.upload(path=path, file=content, file_options={"content-type": file_type})
            uploaded_paths.append(path)
            result = get_supabase().table("credit_repair_lead_documents").insert({
                "lead_id": lead_id,
                "file_name": file_name,
                "file_type": file_type,
                "file_size": len(content),
                "storage_path": path,
                "uploaded_by": uploaded_by,
            }).execute()
            if not result.data:
                raise RuntimeError("Credit Repair document metadata was not created.")
            stored_documents.append(result.data[0])
        return stored_documents
    except HTTPException:
        raise
    except Exception as exc:
        try:
            if uploaded_paths:
                storage.remove(uploaded_paths)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Could not save the Credit Repair documents.") from exc


class CreditRepairLeadCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[str] = None
    state: Optional[str] = Field(default=None, max_length=2)
    street_address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=120)
    zip: Optional[str] = Field(default=None, max_length=20)
    case_type: Optional[str] = Field(default=None, max_length=120)
    adverse_party: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=10000)
    source: str = Field(default="credit_repair_form", max_length=120)
    referral_slug: Optional[str] = Field(default=None, max_length=80)


class CreditRepairLeadUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    date_of_birth: Optional[str] = None
    state: Optional[str] = Field(default=None, max_length=2)
    street_address: Optional[str] = Field(default=None, max_length=300)
    city: Optional[str] = Field(default=None, max_length=120)
    zip: Optional[str] = Field(default=None, max_length=20)
    case_type: Optional[str] = Field(default=None, max_length=120)
    adverse_party: Optional[str] = Field(default=None, max_length=300)
    description: Optional[str] = Field(default=None, max_length=10000)
    notes: Optional[str] = Field(default=None, max_length=10000)
    status: Optional[str] = None
    assigned_to: Optional[str] = None


async def _parse_create_request(request: Request) -> tuple[CreditRepairLeadCreate, list[UploadFile]]:
    content_type = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type:
        return CreditRepairLeadCreate.model_validate(await request.json()), []

    form = await request.form()
    values: dict[str, str] = {}
    for field_name in CreditRepairLeadCreate.model_fields:
        value = form.get(field_name)
        if isinstance(value, str) and value.strip():
            values[field_name] = value.strip()
    files = [value for value in form.getlist("files") if getattr(value, "filename", None)]
    return CreditRepairLeadCreate.model_validate(values), files


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_credit_repair_lead(request: Request, authorization: str = Header(default=None)):
    payload, files = await _parse_create_request(request)
    profile = None
    if authorization:
        try:
            profile = await _get_current_user(authorization)
        except Exception:
            profile = None

    record = payload.model_dump(exclude_none=True)
    referral_slug = record.pop("referral_slug", None)
    referral_partner = None
    record["created_by"] = (profile or {}).get("id")
    if referral_slug:
        partner_result = (
            get_supabase()
            .table("referral_partners")
            .select("id,full_name,company")
            .eq("submission_slug", referral_slug.strip())
            .limit(1)
            .execute()
        )
        if not partner_result.data:
            raise HTTPException(status_code=422, detail="This referral form link is no longer active.")
        referral_partner = partner_result.data[0]
        record["referral_partner_id"] = referral_partner["id"]

    result = get_supabase().table("credit_repair_leads").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save the credit repair lead.")
    lead = result.data[0]
    try:
        lead["credit_repair_lead_documents"] = await _store_lead_documents(
            lead["id"], files, (profile or {}).get("id")
        )
    except Exception:
        try:
            get_supabase().table("credit_repair_leads").delete().eq("id", lead["id"]).execute()
        except Exception:
            pass
        raise

    partner_name = ((referral_partner or {}).get("company") or (referral_partner or {}).get("full_name"))
    await _notify_owner_of_new_lead(
        lead,
        partner_name,
        len(lead.get("credit_repair_lead_documents") or []),
    )
    return lead


LEAD_SELECT = "*, referral_partners(id, full_name, email, company), credit_repair_lead_documents(id, file_name, file_type, file_size, created_at)"


@router.get("")
async def list_credit_repair_leads(authorization: str = Header(...), status_filter: Optional[str] = None):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    query = get_supabase().table("credit_repair_leads").select(LEAD_SELECT).order("created_at", desc=True).limit(500)
    if status_filter:
        query = query.eq("status", status_filter)
    return query.execute().data or []


@router.get("/{lead_id}")
async def get_credit_repair_lead(lead_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    result = get_supabase().table("credit_repair_leads").select(LEAD_SELECT).eq("id", lead_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return result.data[0]


@router.get("/{lead_id}/documents")
async def list_credit_repair_lead_documents(lead_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_lead_document_access(lead_id, profile)
    result = (
        get_supabase()
        .table("credit_repair_lead_documents")
        .select("id,lead_id,file_name,file_type,file_size,created_at")
        .eq("lead_id", lead_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/{lead_id}/documents/{document_id}/access")
async def get_credit_repair_lead_document_access(lead_id: str, document_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_lead_document_access(lead_id, profile)
    result = (
        get_supabase()
        .table("credit_repair_lead_documents")
        .select("id,file_name,storage_path")
        .eq("id", document_id)
        .eq("lead_id", lead_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit Repair document not found.")
    document = result.data[0]
    try:
        signed = get_supabase().storage.from_(STORAGE_BUCKET).create_signed_url(document["storage_path"], 900)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not create a secure document link.") from exc
    url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("url")
    if not url:
        raise HTTPException(status_code=500, detail="Could not create a secure document link.")
    return {"url": url, "file_name": document["file_name"]}


@router.patch("/{lead_id}")
async def update_credit_repair_lead(lead_id: str, payload: CreditRepairLeadUpdate, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    allowed_statuses = {"new", "contacted", "qualified", "documents_pending", "active", "not_qualified", "closed"}
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("status") and changes["status"] not in allowed_statuses:
        raise HTTPException(status_code=422, detail="Invalid credit repair lead status.")
    if "last_contacted_at" not in changes and changes.get("status") == "contacted":
        changes["last_contacted_at"] = datetime.now(timezone.utc).isoformat()
    if not changes:
        raise HTTPException(status_code=400, detail="No lead changes were supplied.")
    result = get_supabase().table("credit_repair_leads").update(changes).eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return result.data[0]


@router.delete("/{lead_id}")
async def delete_credit_repair_lead(lead_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    result = get_supabase().table("credit_repair_leads").delete().eq("id", lead_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Credit repair lead not found.")
    return {"deleted": True, "id": lead_id}
