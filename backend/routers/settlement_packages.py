"""Attorney settlement package submission and reviewer staging workflow."""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

STORAGE_BUCKET = "documents"
MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_SUFFIXES = {".pdf", ".docx"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename(value: str, fallback: str) -> str:
    filename = os.path.basename(value or fallback).strip()
    filename = re.sub(r"[^A-Za-z0-9._ -]+", "_", filename)
    return filename[:180] or fallback


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as shared
    return await shared(authorization)


def _require_internal(profile: dict) -> None:
    if profile.get("role") not in {"attorney", "staff_attorney"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Attorney access is required.")


def _reviewer_profile_id() -> Optional[str]:
    """Return the configured owner account for settlement-package review."""
    try:
        response = (
            get_supabase().table("settlement_package_reviewers")
            .select("owner_profile_id").eq("active", True).limit(1).execute()
        )
        row = (response.data or [None])[0]
        return str(row["owner_profile_id"]) if row and row.get("owner_profile_id") else None
    except Exception:
        logger.exception("Could not load settlement package reviewer configuration")
        return None


def _is_reviewer(profile: dict) -> bool:
    return bool(_reviewer_profile_id() and str(profile.get("id")) == _reviewer_profile_id())


def _require_reviewer(profile: dict) -> None:
    _require_internal(profile)
    if not _is_reviewer(profile):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the configured settlement reviewer can approve, return, or send this package.")


def _require_submitter(profile: dict) -> None:
    _require_internal(profile)
    if _is_reviewer(profile):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The settlement reviewer receives attorney submissions and cannot submit a package for review.")


def _can_view_package(package: dict, profile: dict) -> bool:
    return _is_reviewer(profile) or str(package.get("submitted_by")) == str(profile.get("id"))


def _case_with_access(case_id: str, profile: dict) -> dict:
    from routers.documents import _fetch_case_with_access
    return _fetch_case_with_access(case_id, profile)


def _validate_attachment(content: bytes, filename: str) -> None:
    if not content:
        raise HTTPException(status_code=400, detail=f"{filename} is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail=f"{filename} exceeds the 20 MB limit.")
    suffix = os.path.splitext(filename)[1].lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Settlement package documents must be PDF or DOCX files.")


def _event(supabase, package_id: str, event_type: str, actor_id: str, comment: str = "") -> None:
    try:
        supabase.table("settlement_package_events").insert({
            "package_id": package_id,
            "event_type": event_type,
            "actor_id": actor_id,
            "comment": comment or None,
            "created_at": _now(),
        }).execute()
    except Exception:
        logger.exception("Could not record settlement package event %s", event_type)


def _package_summary(row: dict) -> dict:
    return {
        **row,
        "has_settlement_agreement": bool(row.get("settlement_storage_path")),
        "has_credit_disclosure": bool(row.get("credit_disclosure_storage_path")),
    }


class ReviewDecision(BaseModel):
    comments: str = Field(default="", max_length=5000)


@router.get("/settlement-packages")
async def list_settlement_packages(
    status_filter: Optional[str] = None,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_internal(profile)
    supabase = get_supabase()
    query = supabase.table("settlement_package_submissions").select("*").order("submitted_at", desc=True).limit(100)
    if not _is_reviewer(profile):
        query = query.eq("submitted_by", profile["id"])
    if status_filter:
        query = query.eq("status", status_filter)
    response = query.execute()
    return [_package_summary(row) for row in response.data or []]


@router.get("/settlement-packages/access")
async def settlement_package_access(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_internal(profile)
    reviewer = _is_reviewer(profile)
    return {"can_review": reviewer, "can_submit": not reviewer, "role": "reviewer" if reviewer else "submitting_attorney"}


@router.get("/cases/{case_id}/settlement-packages")
async def list_case_settlement_packages(case_id: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_internal(profile)
    _case_with_access(case_id, profile)
    query = (
        get_supabase().table("settlement_package_submissions")
        .select("*")
        .eq("case_id", case_id)
        .order("submitted_at", desc=True)
    )
    if not _is_reviewer(profile):
        query = query.eq("submitted_by", profile["id"])
    response = (
        query
        .limit(25)
        .execute()
    )
    return [_package_summary(row) for row in response.data or []]


@router.post("/cases/{case_id}/settlement-packages", status_code=status.HTTP_201_CREATED)
async def submit_settlement_package(
    case_id: str,
    settlement_agreement: UploadFile = File(...),
    credit_disclosure: Optional[UploadFile] = File(default=None),
    settlement_amount: str = Form(default=""),
    attorney_notes: str = Form(default=""),
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_submitter(profile)
    case = _case_with_access(case_id, profile)

    settlement_name = _safe_filename(settlement_agreement.filename or "Settlement_Agreement.pdf", "Settlement_Agreement.pdf")
    settlement_bytes = await settlement_agreement.read()
    _validate_attachment(settlement_bytes, settlement_name)

    disclosure_name = ""
    disclosure_bytes = b""
    if credit_disclosure:
        disclosure_name = _safe_filename(credit_disclosure.filename or "Credit_Disclosure.pdf", "Credit_Disclosure.pdf")
        disclosure_bytes = await credit_disclosure.read()
        _validate_attachment(disclosure_bytes, disclosure_name)

    supabase = get_supabase()
    package_id = str(uuid.uuid4())
    base_path = f"settlement-review/{case_id}/{package_id}"
    settlement_path = f"{base_path}/settlement_{settlement_name}"
    disclosure_path = f"{base_path}/credit_disclosure_{disclosure_name}" if disclosure_bytes else None
    uploaded_paths: list[str] = []
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=settlement_path,
            file=settlement_bytes,
            file_options={"content-type": settlement_agreement.content_type or "application/octet-stream"},
        )
        uploaded_paths.append(settlement_path)
        if disclosure_path:
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=disclosure_path,
                file=disclosure_bytes,
                file_options={"content-type": credit_disclosure.content_type or "application/octet-stream"},
            )
            uploaded_paths.append(disclosure_path)

        record = {
            "id": package_id,
            "case_id": case["id"],
            "submitted_by": profile["id"],
            "status": "awaiting_review",
            "settlement_file_name": settlement_name,
            "settlement_storage_path": settlement_path,
            "settlement_file_size": len(settlement_bytes),
            "credit_disclosure_file_name": disclosure_name or None,
            "credit_disclosure_storage_path": disclosure_path,
            "credit_disclosure_file_size": len(disclosure_bytes) if disclosure_bytes else None,
            "settlement_amount": settlement_amount.strip() or None,
            "attorney_notes": attorney_notes.strip() or None,
            "submitted_at": _now(),
            "updated_at": _now(),
        }
        created = supabase.table("settlement_package_submissions").insert(record).execute()
        if not created.data:
            raise RuntimeError("Settlement package could not be saved.")
        _event(supabase, package_id, "submitted", profile["id"], attorney_notes.strip())
        # Notify the configured owner-reviewer. This is best-effort; a
        # notification failure never blocks an already stored package.
        try:
            reviewer_id = _reviewer_profile_id()
            reviewer_response = (
                supabase.table("profiles").select("id,full_name,email")
                .eq("id", reviewer_id).limit(1).execute()
                if reviewer_id else None
            )
            reviewer = ((reviewer_response.data or [None])[0] if reviewer_response else None)
            if reviewer and str(reviewer.get("id")) != str(profile.get("id")):
                from utils.notifications import create_notification
                create_notification(
                    reviewer["id"],
                    "settlement_review",
                    "A settlement package was submitted for your review before client delivery.",
                    case_id=case["id"],
                )
                if reviewer.get("email"):
                    from utils.email_service import send_email
                    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
                    await send_email(
                        to=reviewer["email"],
                        subject="Settlement Package Ready for Review",
                        body=(
                            "<div style=\"font-family:sans-serif;font-size:14px;line-height:1.6;\">"
                            "<h2 style=\"color:#1e40af;\">Settlement Package Ready for Review</h2>"
                            "<p>An attorney submitted a settlement package for review. No documents have been sent to the client.</p>"
                            f"<p><a href=\"{frontend_url}/attorney/settlements?case_id={case['id']}\" "
                            "style=\"background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;\">Open Settlement Center</a></p>"
                            "</div>"
                        ),
                    )
        except Exception:
            logger.exception("Could not notify reviewer about settlement package %s", package_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not submit settlement package")
        if uploaded_paths:
            try:
                supabase.storage.from_(STORAGE_BUCKET).remove(uploaded_paths)
            except Exception:
                logger.warning("Could not remove incomplete settlement review storage objects")
        raise HTTPException(status_code=500, detail="Could not submit the settlement package for review.") from exc

    return _package_summary(created.data[0])


def _get_package_with_case(package_id: str, profile: dict) -> dict:
    supabase = get_supabase()
    response = (
        supabase.table("settlement_package_submissions").select("*")
        .eq("id", package_id).limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Settlement package not found.")
    package = response.data[0]
    _case_with_access(package["case_id"], profile)
    return package


def _stage_case_document(supabase, package: dict, profile: dict, kind: str) -> Optional[dict]:
    storage_path = package.get(f"{kind}_storage_path")
    if not storage_path:
        return None
    existing = (
        supabase.table("case_documents").select("*")
        .eq("case_id", package["case_id"]).eq("storage_path", storage_path).limit(1).execute()
    )
    if existing.data:
        return existing.data[0]
    file_name = package.get(f"{kind}_file_name") or ("Settlement_Agreement.pdf" if kind == "settlement" else "Credit_Disclosure.pdf")
    file_size = package.get(f"{kind}_file_size") or 0
    category = "settlement" if kind == "settlement" else "credit_disclosure"
    result = supabase.table("case_documents").insert({
        "case_id": package["case_id"],
        "file_name": file_name,
        "file_type": os.path.splitext(file_name)[1].lower().lstrip(".") or "pdf",
        "file_size": file_size,
        "storage_path": storage_path,
        "document_category": category,
        "uploaded_by": package.get("submitted_by") or profile["id"],
    }).execute()
    if not result.data:
        raise RuntimeError("Case document staging failed.")
    return result.data[0]


@router.post("/settlement-packages/{package_id}/approve")
async def approve_settlement_package(package_id: str, decision: ReviewDecision, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_reviewer(profile)
    package = _get_package_with_case(package_id, profile)
    if str(package.get("submitted_by")) == str(profile.get("id")):
        raise HTTPException(status_code=403, detail="A different attorney must review this settlement package.")
    if package.get("status") not in {"awaiting_review", "returned"}:
        raise HTTPException(status_code=400, detail="Only a pending or returned package can be approved.")

    supabase = get_supabase()
    try:
        settlement_document = _stage_case_document(supabase, package, profile, "settlement")
        disclosure_document = _stage_case_document(supabase, package, profile, "credit_disclosure")
        updated = supabase.table("settlement_package_submissions").update({
            "status": "approved",
            "settlement_document_id": settlement_document.get("id") if settlement_document else None,
            "credit_disclosure_document_id": disclosure_document.get("id") if disclosure_document else None,
            "review_comments": decision.comments.strip() or None,
            "reviewed_by": profile["id"],
            "reviewed_at": _now(),
            "updated_at": _now(),
        }).eq("id", package_id).execute()
        _event(supabase, package_id, "approved", profile["id"], decision.comments.strip())
    except Exception as exc:
        logger.exception("Could not stage approved settlement package %s", package_id)
        raise HTTPException(status_code=500, detail="Could not stage the approved settlement package.") from exc
    return _package_summary(updated.data[0])


@router.post("/settlement-packages/{package_id}/return")
async def return_settlement_package(package_id: str, decision: ReviewDecision, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_reviewer(profile)
    package = _get_package_with_case(package_id, profile)
    if str(package.get("submitted_by")) == str(profile.get("id")):
        raise HTTPException(status_code=403, detail="A different attorney must review this settlement package.")
    if package.get("status") != "awaiting_review":
        raise HTTPException(status_code=400, detail="Only a pending settlement package can be returned.")
    comments = decision.comments.strip()
    if not comments:
        raise HTTPException(status_code=400, detail="Add review comments before returning the package.")
    updated = get_supabase().table("settlement_package_submissions").update({
        "status": "returned",
        "review_comments": comments,
        "reviewed_by": profile["id"],
        "reviewed_at": _now(),
        "updated_at": _now(),
    }).eq("id", package_id).execute()
    _event(get_supabase(), package_id, "returned", profile["id"], comments)
    return _package_summary(updated.data[0])


@router.get("/settlement-packages/{package_id}/documents/{kind}")
async def download_settlement_package_document(package_id: str, kind: str, authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_internal(profile)
    if kind not in {"settlement", "credit_disclosure"}:
        raise HTTPException(status_code=404, detail="Document type not found.")
    package = _get_package_with_case(package_id, profile)
    if not _can_view_package(package, profile):
        raise HTTPException(status_code=403, detail="You can only open packages you submitted unless you are the configured reviewer.")
    storage_path = package.get(f"{kind}_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="This package does not contain that document.")
    try:
        content = get_supabase().storage.from_(STORAGE_BUCKET).download(storage_path)
    except Exception as exc:
        logger.exception("Could not access settlement package document")
        raise HTTPException(status_code=500, detail="Could not access the staged document.") from exc
    filename = package.get(f"{kind}_file_name") or "document.pdf"
    return Response(content=content, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/settlement-packages/{package_id}/send/{kind}")
async def send_approved_settlement_package_document(
    package_id: str,
    kind: str,
    authorization: str = Header(...),
):
    """Create the actual client delivery request from an already approved package file.

    The file is deliberately reused from the reviewer-staged storage path.  This is
    the final, explicit attorney action; approval alone never contacts the client.
    """
    profile = await _get_current_user(authorization)
    _require_reviewer(profile)
    if kind not in {"settlement", "credit_disclosure"}:
        raise HTTPException(status_code=404, detail="Document type not found.")
    package = _get_package_with_case(package_id, profile)
    if package.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Approve this package before sending its documents to the client.")

    storage_path = package.get(f"{kind}_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="This approved package does not contain that document.")

    supabase = get_supabase()
    document_type = "settlement" if kind == "settlement" else "credit_disclosure"
    existing = (
        supabase.table("signing_sessions").select("id,token,status")
        .eq("case_id", package["case_id"])
        .eq("document_type", document_type)
        .eq("original_path", storage_path)
        .order("created_at", desc=True).limit(1).execute()
    )
    if existing.data:
        session = existing.data[0]
        return {"status": session.get("status"), "session_id": session["id"], "already_created": True}

    case_response = supabase.table("cases").select("id,client_id").eq("id", package["case_id"]).limit(1).execute()
    case = (case_response.data or [None])[0]
    if not case:
        raise HTTPException(status_code=404, detail="The related case is no longer available.")
    client_response = supabase.table("profiles").select("id,full_name,email").eq("id", case["client_id"]).limit(1).execute()
    client = (client_response.data or [None])[0]
    if not client or not client.get("email"):
        raise HTTPException(status_code=400, detail="The case client needs an email address before this package can be sent.")

    from routers.signing import _generate_token
    session_id = str(uuid.uuid4())
    token = _generate_token()
    file_name = package.get(f"{kind}_file_name") or ("Settlement Agreement" if kind == "settlement" else "Credit Disclosure")
    title = f"{'Settlement Agreement' if kind == 'settlement' else 'Credit Disclosure'} — {client.get('full_name') or 'Client'}"
    message = (
        "Please review and sign the attached settlement agreement at your earliest convenience."
        if kind == "settlement"
        else "This is your credit disclosure. Please review it carefully and make sure everything is reporting properly. If you notice anything that appears incorrect or have questions, please contact your attorney."
    )
    session_status = "awaiting_signature" if kind == "settlement" else "awaiting_review"
    now = _now()
    record = {
        "id": session_id,
        "token": token,
        "title": title,
        "document_type": document_type,
        "original_path": storage_path,
        "signer_name": client.get("full_name") or "Client",
        "signer_email": client["email"],
        "case_id": case["id"],
        "client_id": client["id"],
        "sent_by": profile["id"],
        "notification_recipient_id": profile["id"],
        "notification_recipient_email": profile.get("email", ""),
        "attorney_name": profile.get("full_name", ""),
        "message": message,
        "status": session_status,
        "created_at": now,
    }
    try:
        supabase.table("signing_sessions").insert(record).execute()
        supabase.table("signature_requests").insert({
            "id": session_id,
            "title": title,
            "document_type": document_type,
            "signer_name": record["signer_name"],
            "signer_email": record["signer_email"],
            "case_id": case["id"],
            "client_id": client["id"],
            "sent_by": profile["id"],
            "notification_recipient_id": profile["id"],
            "notification_recipient_email": profile.get("email", ""),
            "status": session_status,
            "sent_at": now,
            "created_at": now,
        }).execute()
    except Exception as exc:
        logger.exception("Could not create approved settlement delivery request")
        raise HTTPException(status_code=500, detail="Could not prepare the approved document for client delivery.") from exc

    if kind == "settlement":
        try:
            from routers.closing_statements import _attach_settlement_signing_source
            _attach_settlement_signing_source(case, profile, session_id)
        except Exception:
            logger.exception("Could not stage approved settlement source for closing statement")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    signing_url = f"{frontend_url}/sign/{token}"
    try:
        from html import escape
        from utils.email_service import send_email
        is_disclosure = kind == "credit_disclosure"
        await send_email(
            to=client["email"],
            subject="Your Credit Disclosure Is Ready for Review" if is_disclosure else f"Signature Required: {title}",
            body=f"""
            <div style=\"font-family:sans-serif;font-size:14px;line-height:1.6;max-width:500px;\">
              <h2 style=\"color:#1e40af;\">{'Your Credit Disclosure' if is_disclosure else 'Signature Required'}</h2>
              <p>Hello {escape(record['signer_name'])},</p>
              <p>{escape(message)}</p>
              <p><strong>Document:</strong> {escape(file_name)}</p>
              <p><a href=\"{signing_url}\" style=\"background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;\">{'Review Credit Disclosure' if is_disclosure else 'Review &amp; Sign Document'}</a></p>
            </div>
            """,
        )
    except Exception:
        logger.exception("Could not email approved settlement package delivery link")

    _event(supabase, package_id, f"{kind}_sent", profile["id"])
    return {"status": session_status, "session_id": session_id, "already_created": False}
