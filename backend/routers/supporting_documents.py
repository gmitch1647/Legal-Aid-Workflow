"""Reusable attorney supporting-document library and case attachment endpoints."""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status

from utils.supabase_client import get_supabase

router = APIRouter()

STORAGE_BUCKET = "documents"
ATTORNEY_ROLES = ("attorney", "staff_attorney")


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared

    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") not in ATTORNEY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only attorneys can manage supporting documents.",
        )


def _require_case_access(case_id: str, profile: dict) -> dict:
    from routers.documents import _fetch_case_with_access

    return _fetch_case_with_access(case_id, profile)


def _library_document_or_404(document_id: str, profile: dict) -> dict:
    supabase = get_supabase()
    result = (
        supabase.table("supporting_documents")
        .select("*")
        .eq("id", document_id)
        .eq("owner_id", profile["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supporting document not found.")
    return result.data[0]


@router.get("/supporting-documents")
async def list_supporting_documents(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    result = (
        get_supabase().table("supporting_documents")
        .select("*")
        .eq("owner_id", profile["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/supporting-documents", status_code=status.HTTP_201_CREATED)
async def upload_supporting_document(
    file: UploadFile = File(...),
    description: str | None = Form(None),
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a document to upload.")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Supporting documents must be 25 MB or smaller.")

    file_name = file.filename or "supporting_document"
    file_type = file.content_type or "application/octet-stream"
    path = f"supporting/{profile['id']}/{file_name}"
    storage = get_supabase().storage.from_(STORAGE_BUCKET)
    try:
        storage.upload(path=path, file=content, file_options={"content-type": file_type})
    except Exception as exc:
        message = str(exc).lower()
        if "duplicate" not in message and "already exists" not in message:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not upload supporting document.") from exc
        base, extension = os.path.splitext(file_name)
        suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        file_name = f"{base}_{suffix}{extension}"
        path = f"supporting/{profile['id']}/{file_name}"
        try:
            storage.upload(path=path, file=content, file_options={"content-type": file_type})
        except Exception as retry_exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not upload supporting document.") from retry_exc

    payload = {
        "owner_id": profile["id"],
        "file_name": file_name,
        "file_type": file_type,
        "file_size": len(content),
        "storage_path": path,
        "description": (description or "").strip() or None,
    }
    try:
        result = get_supabase().table("supporting_documents").insert(payload).execute()
        if not result.data:
            raise RuntimeError("Supporting document metadata was not created.")
        return result.data[0]
    except Exception as exc:
        try:
            storage.remove([path])
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save supporting document.") from exc


@router.delete("/supporting-documents/{document_id}")
async def delete_supporting_document(document_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    document = _library_document_or_404(document_id, profile)
    try:
        get_supabase().table("supporting_documents").delete().eq("id", document_id).eq("owner_id", profile["id"]).execute()
        get_supabase().storage.from_(STORAGE_BUCKET).remove([document["storage_path"]])
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not delete supporting document.") from exc
    return {"message": "Supporting document deleted."}


@router.get("/supporting-documents/{document_id}/access")
async def get_supporting_document_access(document_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    document = _library_document_or_404(document_id, profile)
    try:
        signed = get_supabase().storage.from_(STORAGE_BUCKET).create_signed_url(document["storage_path"], 900)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create a secure document link.") from exc
    url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("url")
    if not url:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create a secure document link.")
    return {"url": url, "file_name": document["file_name"]}


@router.get("/cases/{case_id}/supporting-documents")
async def list_case_supporting_documents(case_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    _require_case_access(case_id, profile)
    result = (
        get_supabase().table("case_supporting_documents")
        .select("id,case_id,supporting_document_id,added_at,supporting_documents(*)")
        .eq("case_id", case_id)
        .eq("owner_id", profile["id"])
        .order("added_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/cases/{case_id}/supporting-documents")
async def attach_supporting_documents_to_case(
    case_id: str,
    document_ids: list[str],
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    _require_case_access(case_id, profile)
    ids = list(dict.fromkeys(str(document_id) for document_id in document_ids if document_id))
    if not ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose at least one supporting document.")

    supabase = get_supabase()
    available = (
        supabase.table("supporting_documents")
        .select("id")
        .eq("owner_id", profile["id"])
        .in_("id", ids)
        .execute()
    )
    available_ids = {row["id"] for row in available.data or []}
    if set(ids) != available_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more selected documents are not available in your supporting-document library.")

    payloads = [
        {"case_id": case_id, "supporting_document_id": document_id, "owner_id": profile["id"], "added_by": profile["id"]}
        for document_id in ids
    ]
    try:
        result = supabase.table("case_supporting_documents").upsert(
            payloads,
            on_conflict="case_id,supporting_document_id",
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not attach supporting documents to this case.") from exc
    return {"message": "Supporting documents attached to the case.", "attached_count": len(ids), "items": result.data or []}
