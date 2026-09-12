"""Dedicated credit-repair lead intake, document, and management routes."""
import os
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field

from utils.referral_portal_access import get_referral_portal_partner
from utils.supabase_client import get_supabase

router = APIRouter()

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
    record["created_by"] = (profile or {}).get("id")
    if referral_slug:
        partner_result = (
            get_supabase()
            .table("referral_partners")
            .select("id")
            .eq("submission_slug", referral_slug.strip())
            .limit(1)
            .execute()
        )
        if not partner_result.data:
            raise HTTPException(status_code=422, detail="This referral form link is no longer active.")
        record["referral_partner_id"] = partner_result.data[0]["id"]

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
