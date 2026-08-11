"""
Documents router.

Handles file upload to Supabase Storage and metadata tracking in the
``case_documents`` table.  All endpoints are scoped to a specific case.
"""

import logging
import os
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Delegate to the shared auth helper in cases.py (auto-creates profile)."""
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)

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
