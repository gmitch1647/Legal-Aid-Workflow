"""
Documents router.

Handles file upload to Supabase Storage and metadata tracking in the
``case_documents`` table.  All endpoints are scoped to a specific case.
"""

import logging
import os
import uuid
from pathlib import Path
from datetime import datetime, timezone
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from utils.email_service import send_email
from utils.supabase_client import get_supabase
from utils.referral_portal_access import get_referral_portal_partner

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"
STAFF_ROLES = {"attorney", "staff_attorney"}
MAX_DISCOVERY_DELIVERY_FILES = 10
MAX_DISCOVERY_DELIVERY_BYTES = 20 * 1024 * 1024


class DiscoveryDocumentDeliveryPayload(BaseModel):
    document_ids: list[str] = Field(min_length=1, max_length=MAX_DISCOVERY_DELIVERY_FILES)
    message: Optional[str] = Field(default=None, max_length=2000)


EXCHANGE_DOCUMENT_TYPES = {
    "interrogatories",
    "requests_for_production",
    "requests_for_admission",
    "discovery_response",
    "declaration",
    "settlement_draft",
    "court_filing",
    "other",
}
EXCHANGE_PACKAGE_STAGES = {
    "attorney_draft",
    "owner_working_copy",
    "returned_for_review",
    "final_attorney_version",
    "filed_served",
}
MAX_EXCHANGE_FILES = 20


class DocumentExchangeCreatePayload(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    document_type: Literal[
        "interrogatories", "requests_for_production", "requests_for_admission",
        "discovery_response", "declaration", "settlement_draft", "court_filing", "other",
    ] = "other"
    document_ids: list[str] = Field(min_length=1, max_length=MAX_EXCHANGE_FILES)
    message: Optional[str] = Field(default=None, max_length=4000)
    stage: Literal[
        "attorney_draft", "owner_working_copy", "returned_for_review",
        "final_attorney_version", "filed_served",
    ] = "attorney_draft"


class DocumentExchangePackagePayload(BaseModel):
    document_ids: list[str] = Field(min_length=1, max_length=MAX_EXCHANGE_FILES)
    message: Optional[str] = Field(default=None, max_length=4000)
    stage: Literal[
        "attorney_draft", "owner_working_copy", "returned_for_review",
        "final_attorney_version", "filed_served",
    ] = "returned_for_review"


class DocumentExchangeCommentPayload(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    package_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Delegate to the shared auth helper in cases.py (auto-creates profile)."""
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_staff(profile: dict) -> None:
    if profile.get("role") not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Attorney or staff access required.")


def _owner_reviewer_id(supabase) -> Optional[str]:
    try:
        response = (
            supabase.table("settlement_package_reviewers")
            .select("owner_profile_id")
            .eq("active", True)
            .limit(1)
            .execute()
        )
        return (response.data or [{}])[0].get("owner_profile_id")
    except Exception:
        logger.exception("Could not resolve the active LegalFlow owner reviewer")
        return None


def _document_exchange_participants(supabase, case: dict, profile: dict) -> tuple[dict, dict]:
    """Return case participants, allowing a referral attorney only on the attorney's own referral case."""
    if profile.get("role") != "affiliate":
        _require_staff(profile)
    client_response = (
        supabase.table("profiles")
        .select("id,full_name,assigned_attorney_id")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    client = (client_response.data or [None])[0]
    if not client or not client.get("assigned_attorney_id"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assign an attorney to this client before using Document Exchange.")
    owner_id = _owner_reviewer_id(supabase)
    if not owner_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Configure the LegalFlow owner before using Document Exchange.")
    affiliate_id = None
    if profile.get("role") == "affiliate":
        partner = get_referral_portal_partner(supabase, profile)
        if not partner or str(case.get("referral_partner_id")) != str(partner.get("id")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This Document Exchange is available only for your own referral cases.")
        affiliate_id = profile["id"]
    allowed = {str(owner_id), str(client["assigned_attorney_id"])}
    if affiliate_id:
        allowed.add(str(affiliate_id))
    if str(profile.get("id")) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the LegalFlow owner, assigned attorney, or the originating referral attorney can use this document exchange.")
    return client, {"id": owner_id, "affiliate_id": affiliate_id}


def _fetch_case_with_access(case_id: str, profile: dict) -> dict:
    """Fetch a case and verify the caller has access."""
    supabase = get_supabase()
    resp = (
        supabase.table("cases")
        .select("*")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found.",
        )
    case = resp.data[0]
    if profile["role"] == "client" and case["client_id"] != profile["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this case.",
        )
    if profile.get("role") == "affiliate":
        partner = get_referral_portal_partner(supabase, profile)
        if not partner or str(case.get("referral_partner_id")) != str(partner.get("id")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to documents for this referral case.",
            )
    return case


# ---------------------------------------------------------------------------
# POST /cases/{case_id}/documents -- upload document
# ---------------------------------------------------------------------------


@router.post("/cases/{case_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    case_id: str,
    file: UploadFile = File(...),
    document_category: str = Form("other"),
    parent_document_id: str | None = Form(None),
    authorization: str = Header(...),
):
    """Upload a document for a case.

    The file is stored in Supabase Storage under
    ``documents/cases/{case_id}/{filename}`` and a metadata row is
    created in ``case_documents``.
    """
    profile = await _get_current_user(authorization)
    _fetch_case_with_access(case_id, profile)

    supabase = get_supabase()
    category = str(document_category or "other").strip().lower()

    if category == "complaint_exhibit":
        if profile.get("role") not in ("attorney", "staff_attorney"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only attorneys can attach complaint exhibits.")
        if not parent_document_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose the complaint this exhibit belongs to.")
        parent_result = (
            supabase.table("case_documents")
            .select("id,case_id,document_category")
            .eq("id", parent_document_id)
            .eq("case_id", case_id)
            .limit(1)
            .execute()
        )
        if not parent_result.data or str(parent_result.data[0].get("document_category") or "").lower() != "complaint":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exhibits must be attached to an uploaded complaint in the same case.")
    elif parent_document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only complaint exhibits can have a parent complaint.")

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    file_name = file.filename or "upload"
    file_type = file.content_type or "application/octet-stream"

    # Determine storage path.  Keep complaint exhibits under their parent
    # complaint folder so related supporting material remains easy to audit.
    storage_path = (
        f"cases/{case_id}/complaints/{parent_document_id}/exhibits/{file_name}"
        if category == "complaint_exhibit"
        else f"cases/{case_id}/{file_name}"
    )

    # Upload to Supabase Storage
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": file_type},
        )
    except Exception as exc:
        error_msg = str(exc)
        # If file already exists, try with a timestamp suffix
        if "Duplicate" in error_msg or "already exists" in error_msg.lower():
            name_base, ext = os.path.splitext(file_name)
            ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            file_name = f"{name_base}_{ts}{ext}"
            storage_path = (
                f"cases/{case_id}/complaints/{parent_document_id}/exhibits/{file_name}"
                if category == "complaint_exhibit"
                else f"cases/{case_id}/{file_name}"
            )
            try:
                supabase.storage.from_(STORAGE_BUCKET).upload(
                    path=storage_path,
                    file=file_content,
                    file_options={"content-type": file_type},
                )
            except Exception as exc2:
                logger.exception("Failed to upload file %s", storage_path)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"File upload failed: {exc2}",
                )
        else:
            logger.exception("Failed to upload file %s", storage_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"File upload failed: {exc}",
            )

    # Uploaded PDF complaints retain their source PDF but get a separate
    # editable DOCX derivative for all complaint downloads.
    word_document_path = None
    if category == "complaint" and Path(file_name).suffix.lower() == ".pdf":
        try:
            from utils.complaint_word_converter import complaint_word_file_name, pdf_bytes_to_docx

            word_file_name = complaint_word_file_name(file_name)
            word_document_path = str(Path(storage_path).with_name(word_file_name))
            word_bytes = pdf_bytes_to_docx(file_content)
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=word_document_path,
                file=word_bytes,
                file_options={
                    "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                },
            )
        except Exception as exc:
            logger.exception("Could not create Word derivative for uploaded complaint %s", storage_path)
            try:
                supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
            except Exception:
                logger.warning("Could not clean up complaint source PDF at %s", storage_path)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The complaint PDF could not be converted to a Word document. Upload a Word complaint or a readable PDF and try again.",
            ) from exc

    # Create case_documents metadata record
    doc_payload = {
        "case_id": case_id,
        "file_name": file_name,
        "file_type": file_type,
        "file_size": file_size,
        "storage_path": storage_path,
        "word_document_path": word_document_path,
        "document_category": category,
        "parent_document_id": parent_document_id,
        "uploaded_by": profile["id"],
    }

    try:
        doc_resp = supabase.table("case_documents").insert(doc_payload).execute()
        if not doc_resp.data:
            raise RuntimeError("Document insert returned no data.")
        return doc_resp.data[0]
    except Exception as exc:
        logger.exception("Failed to create document record for case %s", case_id)
        # Best-effort: remove both the uploaded source and a generated Word
        # derivative, if present, so no orphaned complaint copy remains.
        try:
            paths_to_remove = [storage_path]
            if word_document_path:
                paths_to_remove.append(word_document_path)
            supabase.storage.from_(STORAGE_BUCKET).remove(paths_to_remove)
        except Exception:
            logger.warning("Could not clean up uploaded file at %s", storage_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create document record: {exc}",
        )


# ---------------------------------------------------------------------------
# POST /cases/{case_id}/complaints/{complaint_id}/exhibits/{document_id}
# ---------------------------------------------------------------------------


@router.post("/cases/{case_id}/complaints/{complaint_id}/exhibits/{document_id}")
async def attach_existing_document_as_exhibit(
    case_id: str,
    complaint_id: str,
    document_id: str,
    authorization: str = Header(...),
):
    """Attach an existing case document to one uploaded complaint.

    The case-document row is linked through ``parent_document_id``; no second
    storage upload or duplicated document record is created.  Its original
    document category remains intact for the case file.
    """
    profile = await _get_current_user(authorization)
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only attorneys can attach complaint exhibits.")
    _fetch_case_with_access(case_id, profile)
    if complaint_id == document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A complaint cannot be attached as its own exhibit.")

    supabase = get_supabase()
    complaint_result = (
        supabase.table("case_documents")
        .select("id,document_category")
        .eq("id", complaint_id)
        .eq("case_id", case_id)
        .limit(1)
        .execute()
    )
    if not complaint_result.data or str(complaint_result.data[0].get("document_category") or "").lower() != "complaint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose an uploaded complaint in this case.")

    document_result = (
        supabase.table("case_documents")
        .select("id,file_name,document_category,parent_document_id")
        .eq("id", document_id)
        .eq("case_id", case_id)
        .limit(1)
        .execute()
    )
    if not document_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The case document was not found.")

    document = document_result.data[0]
    if str(document.get("document_category") or "").lower() in ("complaint", "pii"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Complaint or PII files cannot be attached as existing exhibits from the document list.")

    already_attached = str(document.get("parent_document_id") or "") == str(complaint_id)
    try:
        updated = (
            supabase.table("case_documents")
            .update({"parent_document_id": complaint_id})
            .eq("id", document_id)
            .eq("case_id", case_id)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not attach existing document %s to complaint %s", document_id, complaint_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not attach the case document as an exhibit.") from exc

    return {
        "message": "Document is already attached to this complaint." if already_attached else "Document attached as an exhibit.",
        "document_id": document_id,
        "complaint_id": complaint_id,
        "already_attached": already_attached,
        "document": (updated.data[0] if getattr(updated, "data", None) else {**document, "parent_document_id": complaint_id}),
    }


# ---------------------------------------------------------------------------
# GET /cases/{case_id}/documents -- list documents
# ---------------------------------------------------------------------------


@router.get("/cases/{case_id}/documents")
async def list_documents(case_id: str, authorization: str = Header(...)):
    """List all documents for a case.

    Attorney sees all documents.  Client sees only documents for their
    own case (enforced by the access check).
    """
    profile = await _get_current_user(authorization)
    _fetch_case_with_access(case_id, profile)

    supabase = get_supabase()

    resp = (
        supabase.table("case_documents")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .execute()
    )

    docs = resp.data or []

    for doc in docs:
        if doc.get("storage_path"):
            try:
                url_resp = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(
                    doc["storage_path"], 3600
                )
                doc["url"] = url_resp.get("signedURL") or url_resp.get("signedUrl") or ""
            except Exception:
                doc["url"] = ""

    return docs


# ---------------------------------------------------------------------------
# GET /cases/{case_id}/documents/{doc_id}/access -- issue fresh document link
# ---------------------------------------------------------------------------


@router.get("/cases/{case_id}/documents/{doc_id}/access")
async def get_document_access_url(
    case_id: str,
    doc_id: str,
    authorization: str = Header(...),
):
    """Issue a new, authorization-scoped storage URL for one document.

    Storage links intentionally expire.  The frontend calls this endpoint at
    click time rather than reusing a URL from a previously loaded document
    list, which prevents an expired Storage JWT from being opened after a
    case page has been left open for a while.  PII links are kept especially
    short-lived because they contain sensitive records.
    """
    profile = await _get_current_user(authorization)
    _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()

    doc_resp = (
        supabase.table("case_documents")
        .select("id, case_id, storage_path, document_category, file_name")
        .eq("id", doc_id)
        .eq("case_id", case_id)
        .limit(1)
        .execute()
    )
    if not doc_resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    doc = doc_resp.data[0]
    storage_path = doc.get("storage_path")
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This document is not available in secure storage.",
        )

    category = str(doc.get("document_category") or "").lower()
    expires_in = 300 if category == "pii" else 900
    try:
        url_resp = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(storage_path, expires_in)
        url = url_resp.get("signedURL") or url_resp.get("signedUrl") or ""
    except Exception as exc:
        logger.exception("Could not create a fresh document access URL for %s", doc_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not prepare the secure document link.",
        ) from exc

    if not url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not prepare the secure document link.",
        )

    return {
        "url": url,
        "expires_in": expires_in,
        "file_name": doc.get("file_name") or "Document",
    }


# ---------------------------------------------------------------------------
# GET /cases/{case_id}/documents/{doc_id}/word-download -- complaint DOCX
# ---------------------------------------------------------------------------


@router.get("/cases/{case_id}/documents/{doc_id}/word-download")
async def get_uploaded_complaint_word_download(
    case_id: str,
    doc_id: str,
    authorization: str = Header(...),
):
    """Issue an authorized Word-document download for an uploaded complaint.

    PDF complaint sources are converted once and retain their source PDF.  Existing
    historic PDF uploads are converted lazily on first Word download so they gain
    the same behavior without being re-uploaded.
    """
    profile = await _get_current_user(authorization)
    _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()

    doc_result = (
        supabase.table("case_documents")
        .select("id,case_id,file_name,file_type,storage_path,word_document_path,document_category")
        .eq("id", doc_id)
        .eq("case_id", case_id)
        .limit(1)
        .execute()
    )
    if not doc_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint document not found.")

    complaint = doc_result.data[0]
    if str(complaint.get("document_category") or "").lower() != "complaint":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only uploaded complaint documents can be downloaded as Word files.")

    source_path = complaint.get("storage_path")
    source_name = complaint.get("file_name") or "complaint"
    if not source_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The complaint source file is unavailable.")

    source_extension = Path(source_name).suffix.lower()
    word_path = complaint.get("word_document_path")
    if source_extension in (".docx", ".doc"):
        word_path = source_path
    elif source_extension == ".pdf" and not word_path:
        try:
            from utils.complaint_word_converter import complaint_word_file_name, pdf_bytes_to_docx

            source_bytes = supabase.storage.from_(STORAGE_BUCKET).download(source_path)
            word_name = complaint_word_file_name(source_name)
            word_path = str(Path(source_path).with_name(word_name))
            word_bytes = pdf_bytes_to_docx(source_bytes)
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=word_path,
                file=word_bytes,
                file_options={
                    "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                },
            )
            supabase.table("case_documents").update({"word_document_path": word_path}).eq("id", doc_id).execute()
        except Exception as exc:
            logger.exception("Could not generate a Word download for complaint %s", doc_id)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A Word copy of this complaint could not be generated.",
            ) from exc
    elif source_extension != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload complaints as PDF or Word files to download a Word copy.",
        )

    if not word_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The Word complaint copy is unavailable.")

    try:
        word_bytes = supabase.storage.from_(STORAGE_BUCKET).download(word_path)
    except Exception as exc:
        logger.exception("Could not download complaint Word copy for %s", doc_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not prepare the Word complaint download.") from exc

    is_legacy_doc = Path(word_path).suffix.lower() == ".doc"
    download_name = Path(source_name).with_suffix(".doc" if is_legacy_doc else ".docx").name
    media_type = (
        "application/msword"
        if is_legacy_doc
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return Response(
        content=word_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


# ---------------------------------------------------------------------------
# DELETE /cases/{case_id}/documents/{doc_id} -- delete a document
# ---------------------------------------------------------------------------


@router.delete("/cases/{case_id}/documents/{doc_id}")
async def delete_document(case_id: str, doc_id: str, authorization: str = Header(...)):
    """Delete a document from a case (storage + metadata)."""
    profile = await _get_current_user(authorization)

    if profile["role"] not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Only attorneys can delete documents.")

    supabase = get_supabase()

    doc_resp = supabase.table("case_documents").select("*").eq("id", doc_id).eq("case_id", case_id).limit(1).execute()
    if not doc_resp.data:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = doc_resp.data[0]

    # Delete from storage
    storage_path = doc.get("storage_path")
    if storage_path:
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception as e:
            logger.warning("Could not delete file from storage: %s", e)

    # Delete metadata row
    supabase.table("case_documents").delete().eq("id", doc_id).execute()

    return {"deleted": True}


# ---------------------------------------------------------------------------
# Discovery delivery — user-confirmed selected-document delivery to the
# case's assigned attorney. Files are attached directly; no expiring links or
# sensitive PII categories are exposed through this workflow.
# ---------------------------------------------------------------------------


@router.get("/cases/{case_id}/discovery-deliveries")
async def list_discovery_document_deliveries(case_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()
    response = (
        supabase.table("discovery_document_deliveries")
        .select("*")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    deliveries = response.data or []
    delivery_ids = [item["id"] for item in deliveries if item.get("id")]
    items_by_delivery: dict[str, list[dict]] = {}
    if delivery_ids:
        item_response = (
            supabase.table("discovery_document_delivery_items")
            .select("delivery_id,case_document_id,file_name")
            .in_("delivery_id", delivery_ids)
            .execute()
        )
        for item in item_response.data or []:
            items_by_delivery.setdefault(str(item.get("delivery_id")), []).append(item)
    for delivery in deliveries:
        delivery["items"] = items_by_delivery.get(str(delivery.get("id")), [])
        delivery["document_count"] = len(delivery["items"])
    return deliveries


@router.post("/cases/{case_id}/discovery-deliveries", status_code=status.HTTP_201_CREATED)
async def deliver_discovery_documents_to_assigned_attorney(
    case_id: str,
    payload: DiscoveryDocumentDeliveryPayload,
    authorization: str = Header(...),
):
    """Attach selected discovery files to an assigned attorney's LegalFlow email.

    This is a user-confirmed action. Every send creates a fresh audit row so a
    user may resend later if needed; account, W-9, PII, and non-discovery files
    are intentionally excluded from this email workflow.
    """
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    case = _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()

    client_response = (
        supabase.table("profiles")
        .select("id,full_name,assigned_attorney_id")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    client = (client_response.data or [None])[0]
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client profile not found for this case.")
    attorney_id = client.get("assigned_attorney_id")
    if not attorney_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assign an attorney to this client before sending discovery documents.")
    attorney_response = (
        supabase.table("profiles")
        .select("id,full_name,email,role")
        .eq("id", attorney_id)
        .limit(1)
        .execute()
    )
    attorney = (attorney_response.data or [None])[0]
    if not attorney or attorney.get("role") not in STAFF_ROLES or not str(attorney.get("email") or "").strip():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The assigned attorney needs an active LegalFlow email address before discovery can be sent.")

    document_ids = list(dict.fromkeys(str(item).strip() for item in payload.document_ids if str(item).strip()))
    if not document_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose at least one discovery document to send.")
    documents_response = (
        supabase.table("case_documents")
        .select("id,case_id,file_name,file_type,file_size,storage_path,document_category")
        .eq("case_id", case_id)
        .in_("id", document_ids)
        .execute()
    )
    documents = documents_response.data or []
    if len(documents) != len(document_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more selected discovery documents are no longer available in this case.")
    invalid_documents = [
        item.get("file_name") or "Document"
        for item in documents
        if str(item.get("document_category") or "").lower() != "discovery" or not item.get("storage_path")
    ]
    if invalid_documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only documents uploaded with the Discovery category can be delivered through this workflow.",
        )
    total_bytes = sum(int(item.get("file_size") or 0) for item in documents)
    if total_bytes > MAX_DISCOVERY_DELIVERY_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected discovery files exceed the 20 MB email attachment limit. Send fewer files in separate deliveries.")

    now = datetime.now(timezone.utc).isoformat()
    delivery_id = str(uuid.uuid4())
    clean_message = (payload.message or "").strip() or None
    delivery_record = {
        "id": delivery_id,
        "case_id": case_id,
        "client_id": client["id"],
        "recipient_profile_id": attorney["id"],
        "recipient_email": attorney["email"],
        "sent_by": profile["id"],
        "message": clean_message,
        "status": "sending",
        "created_at": now,
        "updated_at": now,
    }
    supabase.table("discovery_document_deliveries").insert(delivery_record).execute()
    supabase.table("discovery_document_delivery_items").insert([
        {
            "id": str(uuid.uuid4()),
            "delivery_id": delivery_id,
            "case_document_id": item["id"],
            "file_name": item.get("file_name") or "Discovery document",
            "created_at": now,
        }
        for item in documents
    ]).execute()

    try:
        attachments = []
        for document in documents:
            document_bytes = supabase.storage.from_(STORAGE_BUCKET).download(document["storage_path"])
            attachments.append({
                "filename": document.get("file_name") or "Discovery document",
                "content": document_bytes,
            })
    except Exception as exc:
        logger.exception("Could not download discovery documents for delivery %s", delivery_id)
        supabase.table("discovery_document_deliveries").update({
            "status": "failed",
            "failure_reason": "One or more selected files could not be retrieved from secure storage.",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", delivery_id).execute()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not retrieve the selected discovery documents for delivery.") from exc

    case_label = str(case.get("case_number") or case.get("plaintiff_name") or "Case")
    client_name = str(client.get("full_name") or "Client")
    uploaded_by = str(profile.get("full_name") or "LegalFlow user")
    custom_note = f"<p><strong>Message from {escape(uploaded_by)}:</strong><br>{escape(clean_message)}</p>" if clean_message else ""
    document_list = "".join(f"<li>{escape(str(item.get('file_name') or 'Discovery document'))}</li>" for item in documents)
    delivered = await send_email(
        to=attorney["email"],
        subject=f"Discovery documents: {client_name} — {case_label}",
        body=(
            "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;\">"
            f"<p>Hello {escape(str(attorney.get('full_name') or 'Attorney'))},</p>"
            f"<p>Discovery documents for <strong>{escape(client_name)}</strong> in <strong>{escape(case_label)}</strong> were sent to you through LegalFlow.</p>"
            "<p>The selected files are attached to this email:</p>"
            f"<ul>{document_list}</ul>"
            f"{custom_note}"
            "<p>Please save the attachments to the case file and review them in accordance with your office procedures.</p>"
            "</div>"
        ),
        attachments=attachments,
        idempotency_key=f"discovery-delivery:{delivery_id}",
    )
    if not delivered:
        supabase.table("discovery_document_deliveries").update({
            "status": "failed",
            "failure_reason": "LegalFlow could not deliver the discovery email. Please try sending again.",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", delivery_id).execute()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The discovery email could not be delivered. No documents were sent; you can retry from the case page.")

    sent_at = datetime.now(timezone.utc).isoformat()
    supabase.table("discovery_document_deliveries").update({
        "status": "sent",
        "sent_at": sent_at,
        "updated_at": sent_at,
    }).eq("id", delivery_id).execute()
    return {
        "id": delivery_id,
        "status": "sent",
        "sent_at": sent_at,
        "recipient_name": attorney.get("full_name") or "Assigned attorney",
        "recipient_email": attorney["email"],
        "document_count": len(documents),
        "documents": [{"id": item["id"], "file_name": item.get("file_name")} for item in documents],
    }


# ---------------------------------------------------------------------------
# Document Exchange — private, client-separated collaboration between the
# LegalFlow owner and the case's currently assigned attorney. Documents stay
# protected in LegalFlow; notification emails carry no document attachments or
# storage links.
# ---------------------------------------------------------------------------


def _exchange_status_for(sender_id: str, owner_id: str, stage: str, affiliate_id: str | None = None) -> str:
    if stage in {"final_attorney_version", "filed_served"}:
        return "finalized"
    if affiliate_id and str(sender_id) == str(affiliate_id):
        return "awaiting_attorney"
    return "awaiting_attorney" if str(sender_id) == str(owner_id) else "awaiting_owner"


def _recipient_for_exchange(profile_id: str, owner_id: str, attorney_id: str, affiliate_id: str | None = None) -> str:
    if affiliate_id:
        return attorney_id if str(profile_id) == str(affiliate_id) else affiliate_id
    return attorney_id if str(profile_id) == str(owner_id) else owner_id


def _exchange_thread_or_404(supabase, case_id: str, thread_id: str) -> dict:
    response = (
        supabase.table("case_document_exchange_threads")
        .select("*")
        .eq("id", thread_id)
        .eq("case_id", case_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document Exchange thread not found in this case.")
    return response.data[0]


def _selected_exchange_documents(supabase, case_id: str, raw_document_ids: list[str]) -> list[dict]:
    document_ids = list(dict.fromkeys(str(item).strip() for item in raw_document_ids if str(item).strip()))
    if not document_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose at least one case document for this package.")
    response = (
        supabase.table("case_documents")
        .select("id,case_id,file_name,document_category,storage_path,created_at")
        .eq("case_id", case_id)
        .in_("id", document_ids)
        .execute()
    )
    documents = response.data or []
    if len(documents) != len(document_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more selected documents are no longer available in this case.")
    restricted = [item.get("file_name") or "Document" for item in documents if str(item.get("document_category") or "").lower() == "pii" or not item.get("storage_path")]
    if restricted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PII or unavailable files cannot be sent through Document Exchange. Use the protected PII workflow instead.")
    return documents


async def _notify_document_exchange_recipient(
    *,
    recipient: dict,
    sender: dict,
    client: dict,
    case: dict,
    thread: dict,
    documents: list[dict],
    message: Optional[str],
    version_number: int,
) -> None:
    """Best-effort email notice. Documents remain inside LegalFlow."""
    recipient_email = str(recipient.get("email") or "").strip()
    if not recipient_email:
        return
    frontend_url = os.environ.get("FRONTEND_URL", "https://legalflow.me").rstrip("/")
    case_url = f"{frontend_url}/attorney/cases/{case['id']}"
    safe_title = escape(str(thread.get("title") or "Document package"))
    safe_client = escape(str(client.get("full_name") or "Client"))
    safe_sender = escape(str(sender.get("full_name") or "LegalFlow user"))
    safe_case = escape(str(case.get("case_number") or case.get("plaintiff_name") or "Case"))
    safe_message = escape(str(message or "")).replace("\n", "<br>")
    document_summary = ", ".join(escape(str(item.get("file_name") or "Document")) for item in documents[:5])
    if len(documents) > 5:
        document_summary += f" and {len(documents) - 5} more"
    note = f"<p><strong>Message:</strong><br>{safe_message}</p>" if safe_message else ""
    try:
        await send_email(
            to=recipient_email,
            subject=f"Document Exchange: {safe_client} — {safe_title}",
            body=(
                "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;\">"
                f"<p>Hello {escape(str(recipient.get('full_name') or 'there'))},</p>"
                f"<p><strong>{safe_sender}</strong> sent version {version_number} of <strong>{safe_title}</strong> for <strong>{safe_client}</strong> ({safe_case}) in LegalFlow.</p>"
                f"<p><strong>Documents:</strong> {document_summary}</p>"
                f"{note}"
                f"<p><a href=\"{case_url}\" style=\"display:inline-block;background:#334155;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;\">Open Document Exchange</a></p>"
                "<p style=\"font-size:12px;color:#64748b;\">For security, the documents are not attached to this email. Review and reply from the case workspace in LegalFlow.</p>"
                "</div>"
            ),
            idempotency_key=f"case-document-exchange:{thread['id']}:v{version_number}",
        )
    except Exception:
        logger.exception("Could not send Document Exchange notification for thread %s", thread.get("id"))


def _attach_exchange_rows(supabase, threads: list[dict], profile: dict) -> list[dict]:
    thread_ids = [item["id"] for item in threads if item.get("id")]
    if not thread_ids:
        return []
    packages_response = (
        supabase.table("case_document_exchange_packages")
        .select("*")
        .in_("thread_id", thread_ids)
        .order("version_number", desc=False)
        .execute()
    )
    packages = packages_response.data or []
    # A recipient opening the case sees the package as viewed. The thread itself
    # retains the original sent timestamp for its audit history.
    unseen_ids = [item["id"] for item in packages if item.get("recipient_id") == profile.get("id") and item.get("status") == "sent"]
    if unseen_ids:
        viewed_at = datetime.now(timezone.utc).isoformat()
        supabase.table("case_document_exchange_packages").update({"status": "viewed", "viewed_at": viewed_at}).in_("id", unseen_ids).execute()
        for item in packages:
            if item.get("id") in unseen_ids:
                item["status"] = "viewed"
                item["viewed_at"] = viewed_at
    package_ids = [item["id"] for item in packages if item.get("id")]
    items_by_package: dict[str, list[dict]] = {}
    if package_ids:
        items_response = (
            supabase.table("case_document_exchange_items")
            .select("package_id,case_document_id,file_name")
            .in_("package_id", package_ids)
            .execute()
        )
        for item in items_response.data or []:
            items_by_package.setdefault(str(item.get("package_id")), []).append(item)
    comments_response = (
        supabase.table("case_document_exchange_comments")
        .select("*")
        .in_("thread_id", thread_ids)
        .order("created_at", desc=False)
        .execute()
    )
    comments_by_thread: dict[str, list[dict]] = {}
    for comment in comments_response.data or []:
        comments_by_thread.setdefault(str(comment.get("thread_id")), []).append(comment)
    profile_ids = {str(item.get("sender_id")) for item in packages if item.get("sender_id")}
    profile_ids.update(str(item.get("author_id")) for item in comments_response.data or [] if item.get("author_id"))
    profile_names: dict[str, str] = {}
    if profile_ids:
        profile_response = supabase.table("profiles").select("id,full_name").in_("id", list(profile_ids)).execute()
        profile_names = {str(item.get("id")): str(item.get("full_name") or "LegalFlow user") for item in profile_response.data or []}
    packages_by_thread: dict[str, list[dict]] = {}
    for package in packages:
        package["items"] = items_by_package.get(str(package.get("id")), [])
        package["sender_name"] = profile_names.get(str(package.get("sender_id")), "LegalFlow user")
        packages_by_thread.setdefault(str(package.get("thread_id")), []).append(package)
    for thread in threads:
        thread["packages"] = packages_by_thread.get(str(thread.get("id")), [])
        thread["comments"] = comments_by_thread.get(str(thread.get("id")), [])
        for comment in thread["comments"]:
            comment["author_name"] = profile_names.get(str(comment.get("author_id")), "LegalFlow user")
    return threads


@router.get("/cases/{case_id}/document-exchanges")
async def list_case_document_exchanges(case_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    case = _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()
    _document_exchange_participants(supabase, case, profile)
    response = (
        supabase.table("case_document_exchange_threads")
        .select("*")
        .eq("case_id", case_id)
        .order("last_activity_at", desc=True)
        .limit(100)
        .execute()
    )
    threads = _attach_exchange_rows(supabase, response.data or [], profile)
    return {"threads": threads, "viewer_id": profile.get("id")}


@router.post("/cases/{case_id}/document-exchanges", status_code=status.HTTP_201_CREATED)
async def create_case_document_exchange(
    case_id: str,
    payload: DocumentExchangeCreatePayload,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    case = _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()
    client, owner = _document_exchange_participants(supabase, case, profile)
    documents = _selected_exchange_documents(supabase, case_id, payload.document_ids)
    recipient_id = _recipient_for_exchange(profile["id"], owner["id"], client["assigned_attorney_id"], owner.get("affiliate_id"))
    recipient_response = supabase.table("profiles").select("id,full_name,email,role").eq("id", recipient_id).limit(1).execute()
    recipient = (recipient_response.data or [None])[0]
    if not recipient:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The other Document Exchange participant is unavailable.")
    now = datetime.now(timezone.utc).isoformat()
    thread_id = str(uuid.uuid4())
    package_id = str(uuid.uuid4())
    clean_title = payload.title.strip()
    clean_message = (payload.message or "").strip() or None
    thread = {
        "id": thread_id,
        "case_id": case_id,
        "client_id": client["id"],
        "assigned_attorney_id": client["assigned_attorney_id"],
        "title": clean_title,
        "document_type": payload.document_type,
        "status": _exchange_status_for(profile["id"], owner["id"], payload.stage, owner.get("affiliate_id")),
        "created_by": profile["id"],
        "last_activity_at": now,
        "created_at": now,
        "updated_at": now,
    }
    package = {
        "id": package_id,
        "thread_id": thread_id,
        "case_id": case_id,
        "sender_id": profile["id"],
        "recipient_id": recipient_id,
        "version_number": 1,
        "stage": payload.stage,
        "message": clean_message,
        "status": "sent",
        "sent_at": now,
        "created_at": now,
    }
    supabase.table("case_document_exchange_threads").insert(thread).execute()
    supabase.table("case_document_exchange_packages").insert(package).execute()
    supabase.table("case_document_exchange_items").insert([
        {"id": str(uuid.uuid4()), "package_id": package_id, "case_document_id": item["id"], "file_name": item.get("file_name") or "Case document", "created_at": now}
        for item in documents
    ]).execute()
    await _notify_document_exchange_recipient(
        recipient=recipient, sender=profile, client=client, case=case, thread=thread,
        documents=documents, message=clean_message, version_number=1,
    )
    return {"thread": _attach_exchange_rows(supabase, [thread], profile)[0]}


@router.post("/cases/{case_id}/document-exchanges/{thread_id}/packages", status_code=status.HTTP_201_CREATED)
async def add_case_document_exchange_package(
    case_id: str,
    thread_id: str,
    payload: DocumentExchangePackagePayload,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    case = _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()
    client, owner = _document_exchange_participants(supabase, case, profile)
    thread = _exchange_thread_or_404(supabase, case_id, thread_id)
    if thread.get("status") == "archived":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This Document Exchange thread is archived.")
    documents = _selected_exchange_documents(supabase, case_id, payload.document_ids)
    recipient_id = _recipient_for_exchange(profile["id"], owner["id"], client["assigned_attorney_id"], owner.get("affiliate_id"))
    recipient_response = supabase.table("profiles").select("id,full_name,email,role").eq("id", recipient_id).limit(1).execute()
    recipient = (recipient_response.data or [None])[0]
    if not recipient:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The other Document Exchange participant is unavailable.")
    package_response = (
        supabase.table("case_document_exchange_packages")
        .select("version_number")
        .eq("thread_id", thread_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    version_number = int((package_response.data or [{"version_number": 0}])[0].get("version_number") or 0) + 1
    now = datetime.now(timezone.utc).isoformat()
    clean_message = (payload.message or "").strip() or None
    package_id = str(uuid.uuid4())
    package = {
        "id": package_id,
        "thread_id": thread_id,
        "case_id": case_id,
        "sender_id": profile["id"],
        "recipient_id": recipient_id,
        "version_number": version_number,
        "stage": payload.stage,
        "message": clean_message,
        "status": "sent",
        "sent_at": now,
        "created_at": now,
    }
    supabase.table("case_document_exchange_packages").insert(package).execute()
    supabase.table("case_document_exchange_items").insert([
        {"id": str(uuid.uuid4()), "package_id": package_id, "case_document_id": item["id"], "file_name": item.get("file_name") or "Case document", "created_at": now}
        for item in documents
    ]).execute()
    thread_update = {
        "status": _exchange_status_for(profile["id"], owner["id"], payload.stage, owner.get("affiliate_id")),
        "last_activity_at": now,
        "updated_at": now,
    }
    supabase.table("case_document_exchange_threads").update(thread_update).eq("id", thread_id).execute()
    thread.update(thread_update)
    await _notify_document_exchange_recipient(
        recipient=recipient, sender=profile, client=client, case=case, thread=thread,
        documents=documents, message=clean_message, version_number=version_number,
    )
    return {"thread": _attach_exchange_rows(supabase, [thread], profile)[0]}


@router.post("/cases/{case_id}/document-exchanges/{thread_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_case_document_exchange_comment(
    case_id: str,
    thread_id: str,
    payload: DocumentExchangeCommentPayload,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    case = _fetch_case_with_access(case_id, profile)
    supabase = get_supabase()
    _document_exchange_participants(supabase, case, profile)
    thread = _exchange_thread_or_404(supabase, case_id, thread_id)
    if payload.package_id:
        package_response = (
            supabase.table("case_document_exchange_packages")
            .select("id")
            .eq("id", payload.package_id)
            .eq("thread_id", thread_id)
            .limit(1)
            .execute()
        )
        if not package_response.data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The selected package does not belong to this Document Exchange thread.")
    now = datetime.now(timezone.utc).isoformat()
    comment = {
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "package_id": payload.package_id,
        "author_id": profile["id"],
        "body": payload.body.strip(),
        "created_at": now,
    }
    supabase.table("case_document_exchange_comments").insert(comment).execute()
    supabase.table("case_document_exchange_threads").update({"last_activity_at": now, "updated_at": now}).eq("id", thread_id).execute()
    comment["author_name"] = profile.get("full_name") or "LegalFlow user"
    return comment


@router.get("/clients/{client_id}/document-exchanges")
async def list_client_document_exchanges(client_id: str, authorization: str = Header(...)):
    """Return a client-wide overview while retaining separate case threads.

    The LegalFlow owner can see all of a client's exchange threads. A staff
    attorney can see only the threads assigned to that attorney, and never a
    different attorney's client collaboration.
    """
    profile = await _get_current_user(authorization)
    _require_staff(profile)
    supabase = get_supabase()
    owner_id = _owner_reviewer_id(supabase)
    if not owner_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Configure the LegalFlow owner before using Document Exchange.")
    query = supabase.table("case_document_exchange_threads").select("*").eq("client_id", client_id)
    if str(profile.get("id")) != str(owner_id):
        query = query.eq("assigned_attorney_id", profile.get("id"))
    response = query.order("last_activity_at", desc=True).limit(200).execute()
    threads = _attach_exchange_rows(supabase, response.data or [], profile)
    case_ids = [item.get("case_id") for item in threads if item.get("case_id")]
    case_labels: dict[str, str] = {}
    if case_ids:
        case_response = supabase.table("cases").select("id,case_number,plaintiff_name").in_("id", case_ids).execute()
        case_labels = {
            str(item.get("id")): str(item.get("case_number") or item.get("plaintiff_name") or "Case")
            for item in case_response.data or []
        }
    for thread in threads:
        thread["case_label"] = case_labels.get(str(thread.get("case_id")), "Case")
    return {"threads": threads, "viewer_id": profile.get("id")}
