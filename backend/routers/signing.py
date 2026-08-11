"""
In-app e-signature router.

Flow:
1. Attorney uploads a PDF and picks a client → POST /signing/create
   - Stores the PDF in Supabase Storage
   - Creates a signing_sessions row with a unique token
   - Emails the client a signing link
2. Client opens /sign/{token} (public page) → GET /signing/{token}
   - Returns session metadata; the PDF is served through GET /signing/{token}/pdf
3. Client draws signature and submits → POST /signing/{token}/complete
   - Receives the signature image (base64 PNG)
   - Embeds the signature + date into the PDF server-side
   - Stores the signed PDF, updates the session status
4. Attorney downloads the signed PDF from the e-sign dashboard
"""

import base64
import io
import logging
import os
import secrets
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from utils.esign_notifications import notify_attorney_of_esign_event, signed_document_filename
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
VIEW_ONLY_DOCUMENT_TYPES = {"credit_disclosure"}
OISE_ENGAGEMENT_DOCUMENT_TYPE = "oise_engagement_agreement"
OISE_ENGAGEMENT_ATTORNEY_NAME = "Esther Oise"
OISE_ENGAGEMENT_TEMPLATE_PATH = (
    Path(__file__).resolve().parents[1]
    / "assets"
    / "contracts"
    / "oise_law_group_client_representation_agreement.pdf"
)
REPRESENTATION_INTRO_ANCHORS = (
    "Client’s claims",
    "Client's claims",
)


class EngagementContractSendRequest(BaseModel):
    """Explicit confirmation payload for the Oise engagement-contract workflow."""

    case_id: str
    confirmed: bool = False


def _is_view_only_document(document_type: str | None) -> bool:
    # Direct route tests may use FastAPI's Form default instead of a submitted
    # string. Treat every non-string value as a normal signature document.
    return isinstance(document_type, str) and document_type.strip().lower() in VIEW_ONLY_DOCUMENT_TYPES


def _form_text(value: object, fallback: str) -> str:
    """Return submitted form text, falling back safely for FastAPI defaults."""
    return value.strip() if isinstance(value, str) and value.strip() else fallback


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _submission_session_id(submission_id: object) -> str:
    """Use the browser's stable submission UUID when a request is retried.

    The Settlement Center can lose a response after the document has already
    been stored. Reusing this ID lets the next request safely return that same
    signing session instead of creating a duplicate agreement and email.
    """
    if submission_id is None or submission_id == "":
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(str(submission_id)))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid document submission identifier.") from exc


def _existing_submission_session(supabase, session_id: str, attorney_id: str) -> Optional[dict]:
    """Return an existing LegalFlow session owned by the current attorney."""
    response = (
        supabase.table("signing_sessions")
        .select("id,token,status,original_path,document_type")
        .eq("id", session_id)
        .eq("sent_by", attorney_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _existing_submission_response(session: dict) -> dict:
    """Return the normal create response for a recovered first-send request."""
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return {
        "session_id": session["id"],
        "token": session["token"],
        "signing_url": f"{frontend_url}/sign/{session['token']}",
        "storage_path": session.get("original_path"),
        "status": session.get("status") or "awaiting_signature",
        "review_only": _is_view_only_document(session.get("document_type")),
        "reused": True,
    }


def _safe_filename(filename: str) -> str:
    """Return a basename suitable for a storage-path component."""
    safe_name = Path(filename or "document").name.strip()
    return safe_name or "document"


def _convert_docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to a verified PDF using LibreOffice headless mode."""
    with tempfile.TemporaryDirectory(prefix="legalflow-signing-") as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / "source.docx"
        output_dir = temp_path / "output"
        profile_dir = temp_path / "libreoffice-profile"
        source_path.write_bytes(docx_bytes)
        output_dir.mkdir()
        profile_dir.mkdir()

        try:
            result = subprocess.run(
                [
                    "libreoffice",
                    "--headless",
                    f"-env:UserInstallation={profile_dir.as_uri()}",
                    "--convert-to",
                    "pdf:writer_pdf_Export",
                    "--outdir",
                    str(output_dir),
                    str(source_path),
                ],
                capture_output=True,
                check=False,
                timeout=90,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "DOCX conversion is unavailable because LibreOffice is not installed."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("DOCX conversion timed out. Please try a smaller document.") from exc

        pdf_candidates = list(output_dir.glob("*.pdf"))
        if result.returncode != 0 or not pdf_candidates:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                "Could not convert the DOCX to PDF. "
                f"LibreOffice reported: {stderr or 'an unknown conversion error'}"
            )

        pdf_bytes = pdf_candidates[0].read_bytes()
        if not pdf_bytes.startswith(b"%PDF"):
            raise RuntimeError("DOCX conversion did not produce a valid PDF.")
        return pdf_bytes


def _validate_source_attachment(
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str],
) -> tuple[str, str]:
    """Validate the uploaded source without changing its bytes or file format."""
    safe_filename = _safe_filename(filename)
    suffix = Path(safe_filename).suffix.lower()

    if suffix == ".docx" or content_type == DOCX_MIME_TYPE:
        if not file_bytes.startswith(b"PK"):
            raise ValueError("The DOCX upload is not a valid Office document.")
        return safe_filename, DOCX_MIME_TYPE
    if file_bytes.startswith(b"%PDF"):
        return safe_filename, "application/pdf"
    raise ValueError("Only valid PDF and DOCX files can be sent for signature.")


def _source_stem(storage_path: str) -> str:
    """Return the human-facing base filename without workflow prefixes."""
    stem = Path(storage_path).stem
    return stem.removeprefix("source_").removeprefix("original_").removeprefix("signing_") or "document"


def _signing_pdf_path(source_path: str) -> str:
    """Return the separate PDF derivative path used by the signing canvas."""
    source = Path(source_path)
    if source.suffix.lower() == ".pdf":
        return source_path
    return str(source.with_name(f"signing_{_source_stem(source_path)}.pdf"))


def _signed_pdf_path(pdf_path: str) -> str:
    """Return the output path for a signed PDF without mutating the source file."""
    pdf = Path(pdf_path)
    return str(pdf.with_name(f"signed_{_source_stem(pdf_path)}.pdf"))


def _client_named_pdf_path(pdf_path: str) -> str:
    """Return the separate client-specific agreement copy used only for signing."""
    pdf = Path(pdf_path)
    return str(pdf.with_name(f"client_named_{_source_stem(pdf_path)}.pdf"))


def _personalize_representation_intro(pdf_bytes: bytes, client_name: str) -> tuple[bytes, bool]:
    """Insert the client name in the Oise representation-agreement introduction.

    Only the client-specific signing derivative is modified. The original upload is
    retained byte-for-byte in storage. The exact anchor avoids changing ordinary
    settlement agreements that do not use this representation-agreement language.
    """
    clean_name = " ".join(str(client_name or "").split())
    if not clean_name:
        return pdf_bytes, False

    import fitz  # PyMuPDF

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        changed = False
        for page in doc:
            anchor_rect = None
            for anchor in REPRESENTATION_INTRO_ANCHORS:
                matches = page.search_for(anchor)
                if matches:
                    anchor_rect = matches[0]
                    break
            if anchor_rect is None:
                continue

            # The supplied Oise agreement keeps the complete introductory
            # paragraph in the two text rows containing the anchor. Redraw just
            # those rows so longer client names flow cleanly while all other
            # contract text and the execution page remain untouched.
            paragraph_rect = fitz.Rect(54, anchor_rect.y0 - 3.0, page.rect.width - 54, anchor_rect.y1 + 22.0)
            style = _nearby_text_style(page, anchor_rect)
            intro_text = (
                f"This Agreement governs legal representation in Client's {clean_name} claims arising under the Fair "
                'Credit Reporting Act ("FCRA"), Fair Debt Collection Practices Act ("FDCPA"), and related state or '
                "federal consumer protection laws."
            )
            # Keep the client name inside the original two-line paragraph.
            # Try the surrounding PDF size first, then step down only as much as
            # needed for a longer full name; this avoids pushing into the next
            # section or covering any agreement text.
            remaining = -1.0
            for font_size, line_height in ((style["font_size"], 1.10), (9.25, 1.05), (8.5, 1.02), (8.0, 1.0), (7.5, 1.0)):
                page.add_redact_annot(paragraph_rect, fill=(1, 1, 1))
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
                remaining = page.insert_textbox(
                    paragraph_rect,
                    intro_text,
                    fontsize=font_size,
                    fontname=style["insert_font"],
                    color=(0, 0, 0),
                    lineheight=line_height,
                )
                if remaining >= 0:
                    break
            if remaining < 0:
                logger.warning("Client name could not fit in representation-agreement introduction")
                doc.close()
                return pdf_bytes, False
            changed = True
            break

        output = doc.tobytes(deflate=True) if changed else pdf_bytes
        doc.close()
        return output, changed
    except Exception as exc:
        logger.warning("Could not personalize representation-agreement introduction: %s", exc)
        return pdf_bytes, False


def _ensure_session_pdf(supabase, session: dict) -> str:
    """Return a preview PDF while keeping the original session attachment unchanged."""
    source_path = session["original_path"]
    pdf_path = _signing_pdf_path(source_path)

    try:
        # PDF uploads remain immutable source files. Load them for a possible
        # client-specific derivative; DOCX uploads retain their conversion path.
        if pdf_path == source_path:
            pdf_bytes = supabase.storage.from_(STORAGE_BUCKET).download(source_path)
            if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
                raise RuntimeError("The stored PDF could not be downloaded.")
        else:
            # Reuse an existing conversion derivative where possible, without
            # replacing the attorney's source upload.
            try:
                existing_pdf = supabase.storage.from_(STORAGE_BUCKET).download(pdf_path)
                if existing_pdf and existing_pdf.startswith(b"%PDF"):
                    pdf_bytes = existing_pdf
                else:
                    pdf_bytes = None
            except Exception:
                pdf_bytes = None

            if pdf_bytes is None:
                docx_bytes = supabase.storage.from_(STORAGE_BUCKET).download(source_path)
                if not docx_bytes:
                    raise RuntimeError("The stored DOCX could not be downloaded.")
                pdf_bytes = _convert_docx_to_pdf(docx_bytes)
                supabase.storage.from_(STORAGE_BUCKET).upload(
                    path=pdf_path,
                    file=pdf_bytes,
                    file_options={"content-type": "application/pdf", "upsert": "true"},
                )
                logger.info(
                    "Created separate signing PDF derivative for session %s without modifying %s",
                    session["id"],
                    source_path,
                )

        personalized_pdf, personalized = _personalize_representation_intro(
            pdf_bytes,
            session.get("signer_name", ""),
        )
        if not personalized:
            return pdf_path

        personalized_path = _client_named_pdf_path(pdf_path)
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=personalized_path,
            file=personalized_pdf,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        logger.info(
            "Created client-specific representation-agreement PDF for signing session %s",
            session["id"],
        )
        return personalized_path
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Could not prepare the document for signing: {exc}") from exc


def _link_signed_pdf_to_case(
    supabase,
    session: dict,
    signed_path: str,
    signed_pdf: bytes,
) -> None:
    """Record a completed in-app signature in the linked case's document list.

    Storage has already succeeded when this helper is called. Metadata failures are
    logged, rather than invalidating the completed signature, so the attorney can
    still retrieve the signed PDF from the e-sign dashboard.
    """
    case_id = session.get("case_id")
    if not case_id:
        return

    try:
        existing = (
            supabase.table("case_documents")
            .select("id")
            .eq("case_id", case_id)
            .eq("storage_path", signed_path)
            .limit(1)
            .execute()
        )
        if existing.data:
            return

        file_name = signed_document_filename(session)
        supabase.table("case_documents").insert({
            "case_id": case_id,
            "file_name": file_name,
            "file_type": "pdf",
            "file_size": len(signed_pdf),
            "storage_path": signed_path,
            "document_category": (
                "signed_closing_statement"
                if session.get("document_type") == "closing_statement"
                else (
                    "signed_contract"
                    if session.get("document_type") == OISE_ENGAGEMENT_DOCUMENT_TYPE
                    else "other"
                )
            ),
            "uploaded_by": session.get("sent_by"),
        }).execute()
    except Exception:
        logger.exception(
            "Signed PDF %s was stored but could not be added to case %s documents",
            signed_path,
            case_id,
        )


async def _send_client_signed_copy(
    supabase,
    session: dict,
    signed_path: str,
    signed_pdf: bytes,
) -> bool:
    """Email the signer one PDF copy after LegalFlow completes a signature.

    The signed copy is attached only after storage succeeds. A durable timestamp
    prevents duplicate delivery if the completion workflow is retried later.
    """
    if session.get("client_copy_sent_at") or not session.get("signer_email"):
        return False

    from html import escape
    from utils.email_service import send_email

    title = session.get("title") or "your agreement"
    file_name = signed_document_filename(session)
    delivered = await send_email(
        to=session["signer_email"],
        subject=f"Your Signed Copy: {title}",
        body=f"""
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;">
          <h2 style="color:#059669;">Your Signed Agreement</h2>
          <p>Hello {escape(str(session.get('signer_name') or ''))},</p>
          <p>Thank you for completing <strong>{escape(str(title))}</strong>. A PDF copy of the signed agreement is attached for your records.</p>
          <p style="font-size:12px;color:#64748b;">Please save this attachment in a secure location. If you have questions about the agreement, contact your attorney.</p>
        </div>
        """,
        attachments=[{"filename": file_name, "content": signed_pdf}],
        idempotency_key=f"signed-client-copy-{session['id']}",
    )
    if not delivered:
        return False

    sent_at = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("signing_sessions").update({
            "client_copy_sent_at": sent_at,
            "updated_at": sent_at,
        }).eq("id", session["id"]).execute()
        supabase.table("signature_requests").update({
            "client_copy_sent_at": sent_at,
            "updated_at": sent_at,
        }).eq("id", session["id"]).execute()
    except Exception:
        # The provider accepted the client email. Keep signature completion
        # successful and log the metadata repair need for later follow-up.
        logger.exception("Client signed copy was delivered but could not be recorded for %s", session["id"])
    return True


# ---------------------------------------------------------------------------
# POST /create — attorney uploads a document and creates a signing session
# ---------------------------------------------------------------------------

@router.get("/test")
async def test_signing_storage(authorization: str = Header(default=None)):
    """Diagnostic: upload a tiny test PDF to storage, download it back, verify."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    test_pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"

    test_path = "signing/_test/test.pdf"
    result = {"steps": []}

    # Upload
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=test_path, file=test_pdf,
            file_options={"content-type": "application/pdf"},
        )
        result["steps"].append({"upload": "OK", "size": len(test_pdf)})
    except Exception as e:
        err_str = str(e)
        if "Duplicate" in err_str or "already exists" in err_str.lower():
            result["steps"].append({"upload": "already exists (OK)"})
        else:
            result["steps"].append({"upload": f"FAILED: {e}"})
            return result

    # Download
    try:
        downloaded = supabase.storage.from_(STORAGE_BUCKET).download(test_path)
        result["steps"].append({
            "download": "OK",
            "type": str(type(downloaded)),
            "size": len(downloaded) if downloaded else 0,
            "first_20_bytes": repr(downloaded[:20]) if downloaded else "None",
            "is_pdf": downloaded[:4] == b"%PDF" if downloaded else False,
        })
    except Exception as e:
        result["steps"].append({"download": f"FAILED: {e}"})
        return result

    # Cleanup
    try:
        supabase.storage.from_(STORAGE_BUCKET).remove([test_path])
        result["steps"].append({"cleanup": "OK"})
    except Exception:
        pass

    return result


async def create_generated_pdf_signing_session(
    *,
    pdf_bytes: bytes,
    filename: str,
    signer_name: str,
    signer_email: str,
    title: str,
    document_type: str,
    case_id: str | None,
    client_id: str | None,
    message: str,
    profile: dict,
) -> dict:
    """Create an in-app signature request for a PDF generated by LegalFlow.

    This avoids round-tripping a generated PDF through the browser while keeping
    the existing immutable-source storage, audit trail, tokenized signer link,
    and unified signature-request tracking behavior.
    """
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=500, detail="The generated document is not a valid PDF.")
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Generated PDF exceeds the 20 MB signing limit.")

    safe_filename = _safe_filename(filename)
    if Path(safe_filename).suffix.lower() != ".pdf":
        safe_filename = f"{Path(safe_filename).stem or 'document'}.pdf"

    supabase = get_supabase()
    session_id = str(uuid.uuid4())
    token = _generate_token()
    storage_path = f"signing/{session_id}/source_{safe_filename}"
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
    except Exception as exc:
        logger.exception("Failed to upload generated signing document")
        raise HTTPException(status_code=500, detail="Could not store the generated document for signature.") from exc

    record = {
        "id": session_id,
        "token": token,
        "title": title,
        "document_type": document_type,
        "original_path": storage_path,
        "signer_name": signer_name,
        "signer_email": signer_email,
        "case_id": case_id,
        "client_id": client_id,
        "sent_by": profile["id"],
        "notification_recipient_id": profile["id"],
        "notification_recipient_email": profile.get("email", ""),
        "attorney_name": profile.get("full_name", ""),
        "message": message,
        "status": "awaiting_signature",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("signing_sessions").insert(record).execute()
    except Exception as exc:
        logger.exception("Failed to create generated signing session")
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not remove generated signing PDF after insert failure")
        raise HTTPException(status_code=500, detail="Could not create the signing request.") from exc

    try:
        supabase.table("signature_requests").insert({
            "id": session_id,
            "title": title,
            "document_type": document_type,
            "signer_name": signer_name,
            "signer_email": signer_email,
            "case_id": case_id,
            "client_id": client_id,
            "sent_by": profile["id"],
            "notification_recipient_id": profile["id"],
            "notification_recipient_email": profile.get("email", ""),
            "status": "awaiting_signature",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning("Could not mirror generated signing session in signature_requests: %s", exc)

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    signing_url = f"{frontend_url}/sign/{token}"
    try:
        from html import escape
        from utils.email_service import send_email
        delivered = await send_email(
            to=signer_email,
            subject=f"Signature Required: {title}",
            body=f"""
            <div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;\">
              <h2 style=\"color:#1e40af;\">Closing Statement Signature Required</h2>
              <p>Hello {escape(signer_name)},</p>
              <p>{escape(message)}</p>
              <p><strong>Document:</strong> {escape(title)}</p>
              <p><strong>From:</strong> {escape(profile.get('full_name') or 'Your Attorney')}</p>
              <p><a href=\"{signing_url}\" style=\"background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;\">Review &amp; Sign Closing Statement</a></p>
              <p style=\"font-size:12px;color:#64748b;\">For your security, do not forward this link.</p>
            </div>
            """,
        )
        if delivered:
            await notify_attorney_of_esign_event(
                supabase=supabase,
                record=record,
                event="sent",
                source_table="signing_sessions",
            )
    except Exception as exc:
        # The stored request remains actionable through LegalFlow even if email
        # delivery is temporarily unavailable.
        logger.warning("Could not email generated signing link: %s", exc)

    return {
        "session_id": session_id,
        "token": token,
        "signing_url": signing_url,
        "storage_path": storage_path,
        "status": "awaiting_signature",
    }


@router.post("/create")
async def create_signing_session(
    file: UploadFile = File(...),
    signer_name: str = Form(...),
    signer_email: str = Form(...),
    title: str = Form("Document for Signature"),
    document_type: str = Form("settlement"),
    case_id: str = Form(None),
    client_id: str = Form(None),
    message: str = Form("Please review and sign the attached document."),
    submission_id: str = Form(None),
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    document_type = _form_text(document_type, "general")
    title = _form_text(title, "Document for Signature")
    message = _form_text(message, "Please review and sign the attached document.")
    submission_id = _form_text(submission_id, "")
    is_view_only = _is_view_only_document(document_type)
    session_status = "awaiting_review" if is_view_only else "awaiting_signature"

    uploaded_content = await file.read()
    if not uploaded_content:
        raise HTTPException(status_code=400, detail="Please choose a PDF or DOCX file to upload.")
    if len(uploaded_content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    source_filename = _safe_filename(file.filename or "document.pdf")
    try:
        source_filename, source_content_type = _validate_source_attachment(
            uploaded_content,
            source_filename,
            file.content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    supabase = get_supabase()
    session_id = _submission_session_id(submission_id)
    if submission_id:
        # If the prior request created its session but the browser did not
        # receive the response, return the saved session without re-uploading
        # the document or delivering a duplicate email.
        existing_session = _existing_submission_session(supabase, session_id, profile["id"])
        if existing_session:
            return _existing_submission_response(existing_session)
    token = _generate_token()

    # Preserve the attorney's original source attachment byte-for-byte.
    # DOCX files receive a separate PDF derivative only when the signer opens it.
    storage_path = f"signing/{session_id}/source_{source_filename}"
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=uploaded_content,
            file_options={"content-type": source_content_type},
        )
    except Exception as e:
        # A response interruption can leave the first request completed while a
        # retry reaches storage at the same path. Recover the existing session
        # when possible instead of treating that successful first send as a
        # failed upload.
        if submission_id:
            existing_session = _existing_submission_session(supabase, session_id, profile["id"])
            if existing_session:
                return _existing_submission_response(existing_session)
        logger.error("Failed to upload signing document: %s", e)
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    # Create signing session record
    record = {
        "id": session_id,
        "token": token,
        "title": title,
        "document_type": document_type,
        "original_path": storage_path,
        "signer_name": signer_name,
        "signer_email": signer_email,
        "case_id": case_id if case_id else None,
        "client_id": client_id if client_id else None,
        "sent_by": profile["id"],
        "notification_recipient_id": profile["id"],
        "notification_recipient_email": profile.get("email", ""),
        "attorney_name": profile.get("full_name", ""),
        "message": message,
        "status": session_status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signing_sessions").insert(record).execute()
    except Exception as e:
        # Concurrent retries that share a submission ID can race at the insert.
        # Re-read the authoritative session before reporting an error so the
        # attorney is not asked to send the same agreement a second time.
        if submission_id:
            existing_session = _existing_submission_session(supabase, session_id, profile["id"])
            if existing_session:
                return _existing_submission_response(existing_session)
        logger.error("Failed to create signing session: %s", e)
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not clean up uploaded signing document %s", storage_path)
        raise HTTPException(status_code=500, detail="Could not create the signing session.") from e

    # Also insert into signature_requests for unified tracking
    try:
        supabase.table("signature_requests").insert({
            "id": session_id,
            "title": title,
            "document_type": document_type,
            "signer_name": signer_name,
            "signer_email": signer_email,
            "case_id": case_id if case_id else None,
            "client_id": client_id if client_id else None,
            "sent_by": profile["id"],
            "notification_recipient_id": profile["id"],
            "notification_recipient_email": profile.get("email", ""),
            "status": session_status,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("Could not insert into signature_requests: %s", e)

    # Email a secure document link to the client. Credit disclosures are
    # intentionally view-only: they never request or accept a signature.
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    signing_url = f"{frontend_url}/sign/{token}"
    if is_view_only:
        email_subject = "Your Credit Disclosure Is Ready for Review"
        email_heading = "Your Credit Disclosure"
        email_message = (
            "This is your credit disclosure. Please review it carefully and make sure "
            "everything is reporting properly. If you notice anything that appears "
            "incorrect or have questions, please contact your attorney."
        )
        email_button = "Review Credit Disclosure"
        delivery_kind = "review link"
    else:
        email_subject = f"Signature Required: {title}"
        email_heading = "Signature Required"
        email_message = message
        email_button = "Review &amp; Sign Document"
        delivery_kind = "signing link"

    try:
        from html import escape
        from utils.email_service import send_email
        delivered = await send_email(
            to=signer_email,
            subject=email_subject,
            body=f"""
            <div style="font-family:sans-serif;font-size:14px;line-height:1.6;max-width:500px;">
                <h2 style="color:#1e40af;">{email_heading}</h2>
                <p>Hello {escape(signer_name)},</p>
                <p>{escape(email_message)}</p>
                <p><strong>Document:</strong> {escape(title)}</p>
                <p><strong>From:</strong> {escape(profile.get('full_name', 'Your Attorney'))}</p>
                <div style="margin:24px 0;">
                    <a href="{signing_url}"
                       style="background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                        {email_button}
                    </a>
                </div>
                <p style="color:#64748b;font-size:12px;">
                    Or copy this link: {signing_url}
                </p>
            </div>
            """,
        )
        if delivered:
            await notify_attorney_of_esign_event(
                supabase=supabase,
                record=record,
                event="sent",
                source_table="signing_sessions",
            )
            logger.info("%s emailed to %s", delivery_kind.capitalize(), signer_email)
        else:
            logger.warning("Email provider did not accept %s for %s", delivery_kind, signer_email)
    except Exception as e:
        logger.error("Failed to email %s to %s: %s", delivery_kind, signer_email, e)

    return {
        "session_id": session_id,
        "token": token,
        "signing_url": signing_url,
        "status": session_status,
        "review_only": is_view_only,
        "reused": False,
    }


# ---------------------------------------------------------------------------
# POST /engagement-contract/send — confirmed Oise Law pipeline automation
# ---------------------------------------------------------------------------

@router.post("/engagement-contract/send")
async def send_oise_engagement_contract(
    body: EngagementContractSendRequest,
    authorization: str = Header(default=None),
):
    """Create or recover Esther Oise's client-engagement signing request.

    This endpoint is intentionally confirmation-gated and server-side. A browser
    drag alone cannot email a client, and a case cannot enter the send stage
    until the invitation is accepted for delivery by LegalFlow's email service.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    if not body.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Confirm the engagement-contract send before LegalFlow emails the client.",
        )

    supabase = get_supabase()
    case_response = (
        supabase.table("cases")
        .select("id, client_id, plaintiff_name, status")
        .eq("id", body.case_id)
        .limit(1)
        .execute()
    )
    if not case_response.data:
        raise HTTPException(status_code=404, detail="Case not found.")
    case = case_response.data[0]
    if not case.get("client_id"):
        raise HTTPException(status_code=400, detail="This case is not linked to a client profile.")

    client_response = (
        supabase.table("profiles")
        .select("id, full_name, email, assigned_attorney_id")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    if not client_response.data:
        raise HTTPException(status_code=400, detail="The linked client profile could not be found.")
    client = client_response.data[0]
    if not client.get("email"):
        raise HTTPException(
            status_code=400,
            detail="Add the client's email address before sending the representation agreement.",
        )

    assigned_attorney_id = client.get("assigned_attorney_id")
    if not assigned_attorney_id:
        raise HTTPException(
            status_code=400,
            detail="Assign Esther Oise to the client before sending this representation agreement.",
        )
    attorney_response = (
        supabase.table("profiles")
        .select("id, full_name, email, role, firm_name")
        .eq("id", assigned_attorney_id)
        .limit(1)
        .execute()
    )
    if not attorney_response.data:
        raise HTTPException(status_code=400, detail="The assigned attorney profile could not be found.")
    contract_attorney = attorney_response.data[0]
    if (contract_attorney.get("full_name") or "").strip().casefold() != OISE_ENGAGEMENT_ATTORNEY_NAME.casefold():
        raise HTTPException(
            status_code=400,
            detail="The Oise Law representation agreement can only be sent for a client assigned to Esther Oise.",
        )

    signer_name = client.get("full_name") or case.get("plaintiff_name") or "Client"
    pending_session = None
    existing_response = (
        supabase.table("signing_sessions")
        .select("id, token, status, original_path")
        .eq("case_id", case["id"])
        .eq("document_type", OISE_ENGAGEMENT_DOCUMENT_TYPE)
        .limit(10)
        .execute()
    )
    for existing in existing_response.data or []:
        if existing.get("status") in {"awaiting_signature", "viewed"}:
            pending_session = existing
            break
        if existing.get("status") in {"signed", "complete"}:
            raise HTTPException(status_code=409, detail="This case already has a signed Oise Law representation agreement.")

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    created = False
    if pending_session:
        session_id = pending_session["id"]
        token = pending_session["token"]
        original_path = pending_session.get("original_path")
    else:
        if not OISE_ENGAGEMENT_TEMPLATE_PATH.is_file():
            logger.error("Oise engagement template is missing at %s", OISE_ENGAGEMENT_TEMPLATE_PATH)
            raise HTTPException(status_code=500, detail="The Oise Law agreement template is not available.")
        template_pdf = OISE_ENGAGEMENT_TEMPLATE_PATH.read_bytes()
        if not template_pdf.startswith(b"%PDF"):
            raise HTTPException(status_code=500, detail="The Oise Law agreement template is invalid.")

        session_id = str(uuid.uuid4())
        token = _generate_token()
        filename = "Oise_Law_Group_Client_Representation_Agreement.pdf"
        original_path = f"signing/{session_id}/source_{filename}"
        try:
            supabase.storage.from_(STORAGE_BUCKET).upload(
                path=original_path,
                file=template_pdf,
                file_options={"content-type": "application/pdf"},
            )
        except Exception as exc:
            logger.exception("Could not store Oise engagement agreement source")
            raise HTTPException(status_code=500, detail="Could not prepare the representation agreement.") from exc

        record = {
            "id": session_id,
            "token": token,
            "title": "Oise Law Group PC Representation Agreement",
            "document_type": OISE_ENGAGEMENT_DOCUMENT_TYPE,
            "original_path": original_path,
            "signer_name": signer_name,
            "signer_email": client["email"],
            "case_id": case["id"],
            "client_id": case["client_id"],
            # The agreement remains associated with Esther Oise, while all
            # activity notices return to the LegalFlow user who confirmed send.
            "sent_by": contract_attorney["id"],
            "notification_recipient_id": profile["id"],
            "notification_recipient_email": profile.get("email", ""),
            "attorney_name": contract_attorney.get("full_name") or OISE_ENGAGEMENT_ATTORNEY_NAME,
            "message": "Please review and sign your Oise Law Group PC representation agreement.",
            "status": "awaiting_signature",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            supabase.table("signing_sessions").insert(record).execute()
            supabase.table("signature_requests").insert({
                "id": session_id,
                "title": record["title"],
                "document_type": OISE_ENGAGEMENT_DOCUMENT_TYPE,
                "signer_name": signer_name,
                "signer_email": client["email"],
                "case_id": case["id"],
                "client_id": case["client_id"],
                "sent_by": contract_attorney["id"],
                "notification_recipient_id": profile["id"],
                "notification_recipient_email": profile.get("email", ""),
                "status": "awaiting_signature",
                "sent_at": record["created_at"],
                "created_at": record["created_at"],
            }).execute()
        except Exception as exc:
            logger.exception("Could not create Oise engagement signing session")
            try:
                supabase.storage.from_(STORAGE_BUCKET).remove([original_path])
            except Exception:
                logger.warning("Could not clean up failed Oise engagement source upload")
            raise HTTPException(status_code=500, detail="Could not create the representation agreement request.") from exc
        created = True

    signing_url = f"{frontend_url}/sign/{token}"
    from html import escape
    from utils.email_service import send_email, get_last_email_error
    delivered = await send_email(
        to=client["email"],
        subject="Signature Required: Oise Law Group PC Representation Agreement",
        body=f"""
        <div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;\">
          <h2 style=\"color:#1e40af;\">Representation Agreement Signature Required</h2>
          <p>Hello {escape(str(signer_name))},</p>
          <p>Esther Oise has asked you to review and sign your Oise Law Group PC representation agreement.</p>
          <p><strong>Document:</strong> Oise Law Group PC Representation Agreement</p>
          <p><strong>From:</strong> {escape(str(contract_attorney.get('full_name') or OISE_ENGAGEMENT_ATTORNEY_NAME))}</p>
          <p><a href=\"{signing_url}\" style=\"background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;\">Review &amp; Sign Agreement</a></p>
          <p style=\"font-size:12px;color:#64748b;\">For your security, do not forward this link.</p>
        </div>
        """,
        idempotency_key=f"oise-engagement-{session_id}",
    )
    if not delivered:
        detail = get_last_email_error() or "The email provider did not accept the invitation."
        raise HTTPException(status_code=502, detail=f"The agreement was prepared but could not be emailed: {detail}")

    try:
        session_response = (
            supabase.table("signing_sessions")
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        session_record = (session_response.data or [None])[0]
        if session_record:
            await notify_attorney_of_esign_event(
                supabase=supabase,
                record=session_record,
                event="sent",
                source_table="signing_sessions",
            )
    except Exception:
        # The client invitation was accepted; an attorney-alert failure must not
        # prevent the confirmed agreement send or stage transition.
        logger.exception("Could not send Oise engagement sent-notification for %s", session_id)

    now = datetime.now(timezone.utc).isoformat()
    status_response = (
        supabase.table("cases")
        .update({"status": "doc_sent_for_signature", "updated_at": now})
        .eq("id", case["id"])
        .execute()
    )
    if not status_response.data:
        raise HTTPException(
            status_code=500,
            detail="The agreement was emailed, but LegalFlow could not update the case stage. Please refresh and contact support if it remains unchanged.",
        )

    return {
        "session_id": session_id,
        "status": "awaiting_signature",
        "case_status": "doc_sent_for_signature",
        "signing_url": signing_url,
        "reused": not created,
        "message": "The Oise Law representation agreement was sent to the client for signature.",
    }


# ---------------------------------------------------------------------------
# GET /{token} — public endpoint, returns session info + PDF URL
# ---------------------------------------------------------------------------

@router.get("/{token}")
async def get_signing_session(token: str):
    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("*").eq("token", token).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Signing session not found or expired.")

    session = resp.data[0]

    if session["status"] in ("signed", "complete"):
        raise HTTPException(status_code=400, detail="This document has already been signed.")

    # The first authenticated-token page load is the first secure view.  Record
    # it once for every document type, keeping the in-app session authoritative
    # and its legacy dashboard mirror aligned.  A view-only disclosure becomes
    # complete on view; a signable document remains actionable with status
    # ``viewed`` until the signer completes it.
    if not session.get("viewed_at"):
        viewed_at = datetime.now(timezone.utc).isoformat()
        is_view_only = _is_view_only_document(session.get("document_type"))
        updated_status = (
            "viewed"
            if is_view_only or session.get("status") == "awaiting_signature"
            else session.get("status")
        )
        try:
            supabase.table("signing_sessions").update({
                "status": updated_status,
                "viewed_at": viewed_at,
                "updated_at": viewed_at,
            }).eq("id", session["id"]).execute()
            supabase.table("signature_requests").update({
                "status": updated_status,
                "viewed_at": viewed_at,
                "updated_at": viewed_at,
            }).eq("id", session["id"]).execute()
            session.update({
                "status": updated_status,
                "viewed_at": viewed_at,
            })
            try:
                await notify_attorney_of_esign_event(
                    supabase=supabase,
                    record=session,
                    event="viewed",
                    source_table="signing_sessions",
                )
            except Exception:
                logger.exception("Could not send first-view alert for signing session %s", session["id"])
        except Exception:
            logger.warning("Could not record first secure document view for %s", session["id"])

    return {
        "session_id": session["id"],
        "title": session["title"],
        "document_type": session["document_type"],
        "signer_name": session["signer_name"],
        "signer_email": session["signer_email"],
        "attorney_name": session.get("attorney_name", ""),
        "message": session.get("message", ""),
        "status": session["status"],
        "review_only": _is_view_only_document(session.get("document_type")),
    }


# ---------------------------------------------------------------------------
# GET /{token}/pdf — public endpoint, serves the PDF directly (no CORS issues)
# ---------------------------------------------------------------------------

@router.get("/{token}/pdf")
async def get_signing_pdf(token: str):
    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("id, original_path, signer_name, document_type, status").eq("token", token).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Not found.")

    session = resp.data[0]
    if session["status"] in ("signed", "complete"):
        raise HTTPException(status_code=400, detail="Already signed.")

    try:
        pdf_path = _ensure_session_pdf(supabase, session)
        pdf_bytes = supabase.storage.from_(STORAGE_BUCKET).download(pdf_path)
        if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
            raise RuntimeError("The stored signing document is not a valid PDF.")
    except RuntimeError as exc:
        logger.error("Could not prepare PDF for signing: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as e:
        logger.error("Failed to download PDF for signing: %s", e)
        raise HTTPException(status_code=500, detail="Could not load document.") from e

    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=300"},
    )


# ---------------------------------------------------------------------------
# POST /{token}/complete — client submits their signature
# ---------------------------------------------------------------------------

@router.post("/{token}/complete")
async def complete_signing(token: str, request: Request):
    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("*").eq("token", token).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Signing session not found.")

    session = resp.data[0]
    if _is_view_only_document(session.get("document_type")):
        raise HTTPException(
            status_code=400,
            detail="This credit disclosure is view-only and does not require a signature.",
        )
    if session["status"] in ("signed", "complete"):
        raise HTTPException(status_code=400, detail="Already signed.")

    body = await request.json()
    signature_data = body.get("signature")
    typed_name = body.get("typed_name", "")

    if not signature_data:
        raise HTTPException(status_code=400, detail="Signature is required.")

    # Normalize legacy DOCX sessions before loading the document for signing.
    try:
        pdf_path = _ensure_session_pdf(supabase, session)
        file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(pdf_path)
        if file_bytes is None:
            raise RuntimeError("Download returned None")
        logger.info("Downloaded %d bytes from %s", len(file_bytes), pdf_path)
    except RuntimeError as exc:
        logger.error("Could not prepare original document: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as e:
        logger.error("Failed to download original document: %s", e)
        raise HTTPException(status_code=500, detail="Could not load document.") from e

    # Verify it is a PDF before placing a signature.
    if not file_bytes[:5].startswith(b"%PDF"):
        logger.error("File is not a PDF. First 20 bytes: %s", file_bytes[:20])
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF. Please upload a PDF document.")

    # Decode the signature image from base64
    try:
        if "," in signature_data:
            signature_data = signature_data.split(",", 1)[1]
        sig_bytes = base64.b64decode(signature_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature data.")

    # Embed the signature into detected execution fields and retain the placement audit.
    try:
        signed_pdf, signature_placement = _embed_signature(
            file_bytes,
            sig_bytes,
            typed_name,
            session["signer_name"],
            return_placement=True,
        )
    except Exception as e:
        logger.error("Failed to embed signature: %s", e)
        raise HTTPException(status_code=500, detail=f"Signature embedding failed: {e}")

    # Store the signed PDF separately from both the immutable source and preview PDF.
    signed_path = _signed_pdf_path(pdf_path)
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=signed_path,
            file=signed_pdf,
            file_options={"content-type": "application/pdf"},
        )
    except Exception as e:
        logger.error("Failed to upload signed PDF: %s", e)
        raise HTTPException(status_code=500, detail="Could not store signed document.")

    # Record audit trail in LegalFlow only. The signer IP is intentionally not
    # supplied to the PDF-rendering routine and will never be printed on it.
    client_ip, ip_source = _audit_client_ip(request)
    now = datetime.now(timezone.utc).isoformat()

    audit = {
        "signer_name": session["signer_name"],
        "signer_email": session["signer_email"],
        "typed_name": typed_name,
        "ip_address": client_ip,
        "ip_source": ip_source,
        "user_agent": request.headers.get("user-agent", ""),
        "signed_at": now,
        "signature_placement": signature_placement,
    }

    supabase.table("signing_sessions").update({
        "status": "signed",
        "signed_path": signed_path,
        "signed_at": now,
        "audit_trail": audit,
        "updated_at": now,
    }).eq("token", token).execute()
    signed_session = {
        **session,
        "status": "signed",
        "signed_path": signed_path,
        "signed_at": now,
        "audit_trail": audit,
    }

    _link_signed_pdf_to_case(supabase, signed_session, signed_path, signed_pdf)

    # The completed client agreement is retained in LegalFlow and emailed once
    # as a signed PDF copy for the consumer's own records. Delivery failures do
    # not affect the completed signature, stored PDF, or audit trail.
    try:
        await _send_client_signed_copy(supabase, signed_session, signed_path, signed_pdf)
    except Exception:
        logger.exception("Could not send signed client copy for signing session %s", session["id"])

    # A generated closing statement retains its own workflow record in addition
    # to the normal signing audit and linked case document.
    if session.get("document_type") == "closing_statement":
        try:
            supabase.table("closing_statements").update({
                "status": "signed",
                "signed_storage_path": signed_path,
                "updated_at": now,
            }).eq("signature_session_id", session["id"]).execute()
        except Exception:
            logger.exception(
                "Signed closing statement %s could not be marked complete", session["id"]
            )

    # A completed Oise Law client-engagement agreement advances the linked case
    # only after the signed PDF and signing audit have been safely recorded.
    if session.get("document_type") == OISE_ENGAGEMENT_DOCUMENT_TYPE and session.get("case_id"):
        try:
            supabase.table("cases").update({
                "status": "documents_signed",
                "updated_at": now,
            }).eq("id", session["case_id"]).execute()
        except Exception:
            logger.exception(
                "Oise engagement agreement %s was signed but case %s could not be moved to Documents Signed",
                session["id"],
                session["case_id"],
            )

    # Update the unified signature_requests table too
    try:
        supabase.table("signature_requests").update({
            "status": "complete",
            "signed_at": now,
            "completed_at": now,
            "updated_at": now,
        }).eq("id", session["id"]).execute()
    except Exception:
        pass

    # Email the attorney only if their E-Signature preferences permit it.  The
    # helper records an exactly-once delivery timestamp after provider success.
    try:
        await notify_attorney_of_esign_event(
            supabase=supabase,
            record=signed_session,
            event="signed",
            source_table="signing_sessions",
        )
    except Exception:
        logger.exception("Could not send signature alert for signing session %s", session["id"])

    return {"status": "signed", "message": "Document signed successfully."}


# ---------------------------------------------------------------------------
# GET /{token}/download — download the signed PDF (authenticated)
# ---------------------------------------------------------------------------

@router.get("/{token}/download")
async def download_signed_pdf(token: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("signing_sessions").select("*").eq("token", token).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = resp.data[0]
    if not session.get("signed_path"):
        raise HTTPException(status_code=400, detail="Document has not been signed yet.")

    try:
        pdf_bytes = supabase.storage.from_(STORAGE_BUCKET).download(session["signed_path"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")

    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{signed_document_filename(session)}"'},
    )


# ---------------------------------------------------------------------------
# DELETE /{session_id} — delete a signing session
# ---------------------------------------------------------------------------

@router.delete("/{session_id}")
async def delete_signing_session(session_id: str, authorization: str = Header(default=None)):
    """Delete a signing session and its stored files."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("id, original_path, signed_path").eq("id", session_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = resp.data[0]

    # Delete storage files
    paths_to_remove = [p for p in [session.get("original_path"), session.get("signed_path")] if p]
    if paths_to_remove:
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove(paths_to_remove)
        except Exception as e:
            logger.warning("Could not delete signing files: %s", e)

    # Delete signing session record
    supabase.table("signing_sessions").delete().eq("id", session_id).execute()

    # Delete from unified signature_requests table too
    try:
        supabase.table("signature_requests").delete().eq("id", session_id).execute()
    except Exception:
        pass

    return {"deleted": True}


# ---------------------------------------------------------------------------
# Helper — embed signature image into PDF using PyMuPDF (fitz)
# ---------------------------------------------------------------------------

def _audit_client_ip(request: Request) -> tuple[str, str]:
    """Capture the originating client IP for LegalFlow's audit record only.

    Railway and similar reverse proxies pass the visitor address through
    `X-Forwarded-For`; direct local runs safely fall back to FastAPI's client
    host. This helper is deliberately not used by PDF rendering code.
    """
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        client_ip = forwarded_for.split(",", 1)[0].strip()
        if client_ip:
            return client_ip, "x-forwarded-for"

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip, "x-real-ip"

    if request.client and request.client.host:
        return request.client.host, "request.client"
    return "unknown", "unavailable"


def _standard_pdf_font(source_font: str) -> str:
    """Map a source PDF font to a built-in PyMuPDF font with matching styling."""
    normalized = (source_font or "").lower().replace(" ", "")
    if any(name in normalized for name in ("times", "roman", "serif", "liberation")):
        return "tiro"  # Times-Roman: visual match for Times New Roman-style documents.
    if any(name in normalized for name in ("courier", "mono")):
        return "cour"
    return "helv"


def _nearby_text_style(page, anchor_rect) -> dict:
    """Infer date text styling from the nearest source-document text span."""
    import fitz  # PyMuPDF

    default = {"source_font": "Times-Roman", "insert_font": "tiro", "font_size": 10.0}
    nearest = None
    nearest_distance = None
    try:
        text = page.get_text("dict")
        for block in text.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not span.get("text", "").strip():
                        continue
                    span_rect = fitz.Rect(span["bbox"])
                    dx = max(anchor_rect.x0 - span_rect.x1, span_rect.x0 - anchor_rect.x1, 0)
                    dy = max(anchor_rect.y0 - span_rect.y1, span_rect.y0 - anchor_rect.y1, 0)
                    distance = dx * dx + dy * dy
                    if nearest_distance is None or distance < nearest_distance:
                        nearest = span
                        nearest_distance = distance
    except Exception as exc:
        logger.warning("Could not infer PDF text style: %s", exc)

    if not nearest:
        return default

    source_font = str(nearest.get("font") or default["source_font"])
    source_size = float(nearest.get("size") or default["font_size"])
    return {
        "source_font": source_font,
        "insert_font": _standard_pdf_font(source_font),
        # Preserve the nearby document size while retaining a readable minimum
        # and preventing unusually large heading text from overflowing fields.
        "font_size": round(max(8.0, min(source_size, 12.0)), 2),
    }


def _fit_signature_image(sig_image_bytes: bytes, target_rect):
    """Trim transparent/white canvas margins and fit the visible signature safely."""
    import fitz  # PyMuPDF
    from PIL import Image

    field_rect = fitz.Rect(target_rect)
    try:
        image = Image.open(io.BytesIO(sig_image_bytes)).convert("RGBA")
        pixels = list(image.getdata())
        ink_mask = Image.new("L", image.size, 0)
        ink_mask.putdata([
            255 if alpha > 16 and (red < 245 or green < 245 or blue < 245) else 0
            for red, green, blue, alpha in pixels
        ])
        ink_bounds = ink_mask.getbbox()
        if ink_bounds:
            # Add a small canvas margin so ascenders and descenders cannot be
            # cut off when a signer draws close to the canvas edge.
            left, top, right, bottom = ink_bounds
            padding = max(3, round(min(image.size) * 0.04))
            crop_box = (
                max(0, left - padding),
                max(0, top - padding),
                min(image.width, right + padding),
                min(image.height, bottom + padding),
            )
            image = image.crop(crop_box)

        width, height = image.size
        if width <= 0 or height <= 0:
            raise ValueError("Signature image has no drawable area")

        horizontal_padding = min(6.0, field_rect.width * 0.08)
        vertical_padding = min(3.0, field_rect.height * 0.08)
        available_width = max(20.0, field_rect.width - (horizontal_padding * 2))
        available_height = max(12.0, field_rect.height - (vertical_padding * 2))
        scale = min(available_width / width, available_height / height)
        render_width = width * scale
        render_height = height * scale
        rendered_rect = fitz.Rect(
            field_rect.x0 + (field_rect.width - render_width) / 2,
            field_rect.y0 + (field_rect.height - render_height) / 2,
            field_rect.x0 + (field_rect.width + render_width) / 2,
            field_rect.y0 + (field_rect.height + render_height) / 2,
        )
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue(), rendered_rect
    except Exception as exc:
        logger.warning("Could not trim and fit signature image: %s", exc)
        return sig_image_bytes, field_rect


def _horizontal_signature_band(page, by_rect, field_left: float, field_right: float) -> tuple[float, float]:
    """Return a compact, text-safe signature band for a horizontal `By:` row.

    Client names are commonly printed immediately below the line, while the
    final agreement paragraph can sit just above it. Keep a handwritten
    signature in the available whitespace instead of filling the entire area
    between those text blocks.
    """
    import fitz  # PyMuPDF

    preceding_bottom = None
    try:
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if not span.get("text", "").strip():
                        continue
                    span_rect = fitz.Rect(span["bbox"])
                    if span_rect.y1 > by_rect.y0 - 0.25:
                        continue
                    if span_rect.x1 < field_left or span_rect.x0 > field_right:
                        continue
                    if preceding_bottom is None or span_rect.y1 > preceding_bottom:
                        preceding_bottom = span_rect.y1
    except Exception as exc:
        logger.warning("Could not measure nearby execution-block text: %s", exc)

    # A 14–28 pt band produces a legible but restrained signature. The fallback
    # is directly on the blank portion of the By line if the agreement body
    # leaves too little space above the line.
    signature_top = max(by_rect.y0 - 18.0, 36.0)
    if preceding_bottom is not None:
        signature_top = max(signature_top, preceding_bottom + 3.5)
    signature_bottom = by_rect.y1 - 4.0

    if signature_bottom - signature_top < 14.0:
        signature_top = by_rect.y0 + 1.0
        signature_bottom = by_rect.y1 - 1.0

    return signature_top, signature_bottom


def _execution_block_placement(doc) -> Optional[dict]:
    """Locate the client-side `By:` / `Date:` pair in a two-party execution block.

    The detector chooses the leftmost paired fields on the execution page. It
    permits valid upper-half signature blocks, which are common in agreements
    followed by exhibits, while excluding the document-header area.
    """
    import fitz  # PyMuPDF

    # Attorney-managed engagement templates use an explicit client execution
    # block. Prefer it ahead of generic By:/Date: detection so signatures stay
    # within the dedicated client line and never fall back elsewhere in the PDF.
    for page in reversed(doc):
        client_signature_labels = page.search_for("Client Signature:")
        date_labels = page.search_for("Date:")
        for signature_label in client_signature_labels:
            paired_dates = [
                date_label for date_label in date_labels
                if date_label.x0 > signature_label.x1 + 45
                and abs(date_label.y0 - signature_label.y0) <= 12
            ]
            if not paired_dates:
                continue
            date_label = min(
                paired_dates,
                key=lambda rect: (abs(rect.y0 - signature_label.y0), rect.x0),
            )
            field_left = signature_label.x1 + 10
            field_right = date_label.x0 - 14
            signature_top = max(signature_label.y0 - 18, 36)
            signature_bottom = signature_label.y1 - 2
            if field_right - field_left < 80 or signature_bottom - signature_top < 12:
                continue
            signature_rect = fitz.Rect(field_left, signature_top, field_right, signature_bottom)
            return {
                "strategy": "explicit_client_execution_block",
                "layout": "horizontal",
                "page": page.number,
                "signature_rect": [
                    round(signature_rect.x0, 2), round(signature_rect.y0, 2),
                    round(signature_rect.x1, 2), round(signature_rect.y1, 2),
                ],
                "date_origin": [round(date_label.x1 + 10, 2), round(date_label.y1 - 2, 2)],
                "date_label_rect": [
                    round(date_label.x0, 2), round(date_label.y0, 2),
                    round(date_label.x1, 2), round(date_label.y1, 2),
                ],
            }

    for page in reversed(doc):
        page_rect = page.rect
        # Settlement execution blocks may appear well above the midpoint when
        # an agreement includes an exhibit or addendum page. Exclude only the
        # document-header region, not the entire upper half of the page.
        minimum_execution_y = max(72.0, page_rect.height * 0.15)
        by_labels = [
            rect for rect in page.search_for("By:")
            if rect.y0 >= minimum_execution_y
        ]
        date_labels = [
            rect for rect in page.search_for("Date:")
            if rect.y0 >= minimum_execution_y
        ]
        if not by_labels or not date_labels:
            continue

        candidates = []
        for by_rect in by_labels:
            # Most settlement agreements put the client signature and date on
            # the same execution line: ``By: ________    Date: ________``.
            # Prefer that horizontal pair before supporting the older vertical
            # layout where Date appears below By on the same column.
            horizontal_dates = [
                date_rect for date_rect in date_labels
                if date_rect.x0 >= by_rect.x1 + 60
                and date_rect.x0 - by_rect.x1 <= page_rect.width * 0.72
                and abs(date_rect.y0 - by_rect.y0) <= 20
            ]
            if horizontal_dates:
                date_rect = min(
                    horizontal_dates,
                    key=lambda rect: (abs(rect.y0 - by_rect.y0), rect.x0),
                )
                candidates.append((by_rect, date_rect, "horizontal"))
                continue

            vertical_dates = [
                date_rect for date_rect in date_labels
                if date_rect.y0 > by_rect.y0
                and date_rect.y0 - by_rect.y0 <= 105
                and abs(date_rect.x0 - by_rect.x0) <= 24
            ]
            if vertical_dates:
                candidates.append((by_rect, min(vertical_dates, key=lambda rect: rect.y0), "vertical"))
        if not candidates:
            continue

        # The leftmost, then uppermost, paired execution fields belong to the
        # client signer in a two-party settlement agreement. PDF text extractors
        # can vary coordinates by fractions of a point between visually aligned
        # lines, so normalize the column before selecting the upper client line.
        by_rect, date_rect, layout = min(
            candidates,
            key=lambda pair: (round(pair[0].x0, 1), pair[0].y0, pair[2]),
        )
        field_left = by_rect.x1 + 10
        if layout == "horizontal":
            # Keep the signature inside the actual plaintiff line, ending before
            # the date label rather than treating the later defense block as a
            # second column. The signature sits above the printed client name.
            field_right = min(date_rect.x0 - 14, field_left + 160)
            signature_top, signature_bottom = _horizontal_signature_band(
                page,
                by_rect,
                field_left,
                field_right,
            )
        else:
            next_column = min(
                (
                    candidate_by.x0
                    for candidate_by, _, _ in candidates
                    if candidate_by.x0 > by_rect.x0 + 80
                ),
                default=page_rect.width - 54,
            )
            # Execution lines are commonly shorter than the space between columns;
            # keep the artwork within the client line instead of spanning the gap.
            field_right = min(next_column - 24, field_left + 155)
            signature_top = max(by_rect.y0 - 30, 36)
            signature_bottom = max(date_rect.y0 - 6, by_rect.y1 + 18)

        if field_right - field_left < 80:
            continue
        date_x = max(field_left, date_rect.x1 + 10)
        signature_rect = fitz.Rect(
            field_left,
            signature_top,
            field_right,
            signature_bottom,
        )
        return {
            "strategy": "detected_execution_block",
            "layout": layout,
            "page": page.number,
            "signature_rect": [
                round(signature_rect.x0, 2), round(signature_rect.y0, 2),
                round(signature_rect.x1, 2), round(signature_rect.y1, 2),
            ],
            "date_origin": [round(date_x, 2), round(date_rect.y1 - 2, 2)],
            "date_label_rect": [
                round(date_rect.x0, 2), round(date_rect.y0, 2),
                round(date_rect.x1, 2), round(date_rect.y1, 2),
            ],
        }
    # Closing statements use the supplied reference style: an “APPROVED AND
    # ACCEPTED” heading, an unlabeled signature line, the printed client name,
    # and then a separate Date line. Preserve that visual format while locating
    # a precise signature/date target for the in-app signing flow.
    for page in reversed(doc):
        page_rect = page.rect
        headings = [
            rect for rect in page.search_for("APPROVED AND ACCEPTED:")
            if rect.y0 >= page_rect.height * 0.45
        ]
        date_labels = [
            rect for rect in page.search_for("Date:")
            if rect.y0 >= page_rect.height * 0.50
        ]
        for heading_rect in headings:
            matching_dates = [
                date_rect for date_rect in date_labels
                if date_rect.y0 > heading_rect.y1 + 28
                and date_rect.y0 - heading_rect.y0 <= 145
                and abs(date_rect.x0 - heading_rect.x0) <= 24
            ]
            if not matching_dates:
                continue
            date_rect = min(matching_dates, key=lambda rect: rect.y0)
            field_left = heading_rect.x0
            field_right = min(field_left + 216, page_rect.width - 54)
            signature_top = heading_rect.y1 + 7
            # Leave the printed “Client” caption clear immediately above Date.
            signature_bottom = max(signature_top + 18, date_rect.y0 - 23)
            return {
                "strategy": "closing_statement_execution_block",
                "page": page.number,
                "signature_rect": [
                    round(field_left, 2), round(signature_top, 2),
                    round(field_right, 2), round(signature_bottom, 2),
                ],
                "date_origin": [round(date_rect.x1 + 10, 2), round(date_rect.y1 - 2, 2)],
                "date_label_rect": [
                    round(date_rect.x0, 2), round(date_rect.y0, 2),
                    round(date_rect.x1, 2), round(date_rect.y1, 2),
                ],
            }
    return None


def _fallback_placement(page) -> dict:
    """Return the legacy last-page placement only when no execution block is found."""
    page_rect = page.rect
    sig_x = 72
    sig_y = page_rect.height - 120
    return {
        "strategy": "fallback_last_page",
        "page": page.number,
        "signature_rect": [sig_x, sig_y, sig_x + 200, sig_y + 50],
        "date_origin": [sig_x + 280, sig_y + 70],
    }


def _embed_signature(
    pdf_bytes: bytes,
    sig_image_bytes: bytes,
    typed_name: str,
    signer_name: str,
    return_placement: bool = False,
):
    """Embed a signature in detected execution fields, with a safe visual fallback."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    date_str = datetime.now(timezone.utc).strftime("%m/%d/%Y")
    display_name = typed_name or signer_name
    placement = _execution_block_placement(doc)
    if placement is None:
        placement = _fallback_placement(doc[-1])
        logger.info("No execution block detected; using last-page fallback placement")
    else:
        logger.info(
            "Detected client execution block on page %s at %s",
            placement["page"] + 1,
            placement["signature_rect"],
        )

    page = doc[placement["page"]]
    sig_rect = fitz.Rect(placement["signature_rect"])
    date_x, date_y = placement["date_origin"]
    date_label_rect = fitz.Rect(placement.get("date_label_rect", [date_x, date_y - 10, date_x + 1, date_y]))
    date_style = _nearby_text_style(page, date_label_rect)
    fitted_signature_bytes, rendered_sig_rect = _fit_signature_image(sig_image_bytes, sig_rect)
    placement["rendered_signature_rect"] = [
        round(rendered_sig_rect.x0, 2), round(rendered_sig_rect.y0, 2),
        round(rendered_sig_rect.x1, 2), round(rendered_sig_rect.y1, 2),
    ]
    placement["date_style"] = date_style

    try:
        page.insert_image(rendered_sig_rect, stream=fitted_signature_bytes)
    except Exception as exc:
        logger.warning("Could not embed signature image: %s", exc)
        page.insert_text(
            fitz.Point(sig_rect.x0, sig_rect.y1 - 2),
            display_name,
            fontsize=date_style["font_size"],
            fontname=date_style["insert_font"],
            color=(0, 0, 0),
        )

    if placement["strategy"] != "fallback_last_page":
        page.insert_text(
            fitz.Point(date_x, date_y),
            date_str,
            fontsize=date_style["font_size"],
            fontname=date_style["insert_font"],
            color=(0, 0, 0),
        )
    else:
        page.draw_line(
            fitz.Point(sig_rect.x0, sig_rect.y1 + 5),
            fitz.Point(sig_rect.x1 + 50, sig_rect.y1 + 5),
            color=(0, 0, 0),
            width=0.5,
        )
        page.insert_text(
            fitz.Point(sig_rect.x0, sig_rect.y1 + 20),
            display_name,
            fontsize=10,
            fontname="helv",
            color=(0, 0, 0),
        )
        page.insert_text(
            fitz.Point(date_x, date_y),
            f"Date: {date_str}",
            fontsize=10,
            fontname="helv",
            color=(0, 0, 0),
        )
        page.insert_text(
            fitz.Point(sig_rect.x0, sig_rect.y1 + 35),
            f"Electronically signed via LegalFlow on {date_str}",
            fontsize=7,
            fontname="helv",
            color=(0.4, 0.4, 0.4),
        )

    output = doc.tobytes(deflate=True)
    doc.close()
    if return_placement:
        return output, placement
    return output
