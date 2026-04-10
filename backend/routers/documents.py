"""
Documents router.

Handles file upload to Supabase Storage and metadata tracking in the
``case_documents`` table.  All endpoints are scoped to a specific case.
"""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


async def _get_current_user(authorization: str) -> dict:
    """Validate the bearer token and return the user's profile."""
    supabase = get_supabase()

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format.",
        )

    token = authorization[len("Bearer "):]

    try:
        user_response = supabase.auth.get_user(token)
        user_id = user_response.user.id
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    profile_resp = (
        supabase.table("profiles")
        .select("*")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )

    if not profile_resp.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Profile not found.",
        )

    return profile_resp.data[0]


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

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    file_name = file.filename or "upload"
    file_type = file.content_type or "application/octet-stream"

    # Determine storage path
    storage_path = f"cases/{case_id}/{file_name}"

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
            storage_path = f"cases/{case_id}/{file_name}"
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

    # Create case_documents metadata record
    doc_payload = {
        "case_id": case_id,
        "file_name": file_name,
        "file_type": file_type,
        "file_size": file_size,
        "storage_path": storage_path,
        "document_category": document_category,
        "uploaded_by": profile["id"],
    }

    try:
        doc_resp = supabase.table("case_documents").insert(doc_payload).execute()
        if not doc_resp.data:
            raise RuntimeError("Document insert returned no data.")
        return doc_resp.data[0]
    except Exception as exc:
        logger.exception("Failed to create document record for case %s", case_id)
        # Best-effort: remove the uploaded file
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not clean up uploaded file at %s", storage_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create document record: {exc}",
        )


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

    return resp.data or []
