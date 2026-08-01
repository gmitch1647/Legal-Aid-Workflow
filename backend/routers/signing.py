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

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


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


def _ensure_session_pdf(supabase, session: dict) -> str:
    """Return a preview PDF while keeping the original session attachment unchanged."""
    source_path = session["original_path"]
    pdf_path = _signing_pdf_path(source_path)
    if pdf_path == source_path:
        return source_path

    try:
        # Reuse an existing derivative where possible, without replacing its source.
        try:
            existing_pdf = supabase.storage.from_(STORAGE_BUCKET).download(pdf_path)
            if existing_pdf and existing_pdf.startswith(b"%PDF"):
                return pdf_path
        except Exception:
            pass

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
        return pdf_path
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

        original_name = Path(session.get("original_path", "document.pdf")).stem
        file_name = f"signed_{original_name.removeprefix('original_')}.pdf"
        supabase.table("case_documents").insert({
            "case_id": case_id,
            "file_name": file_name,
            "file_type": "pdf",
            "file_size": len(signed_pdf),
            "storage_path": signed_path,
            "document_category": "other",
            "uploaded_by": session.get("sent_by"),
        }).execute()
    except Exception:
        logger.exception(
            "Signed PDF %s was stored but could not be added to case %s documents",
            signed_path,
            case_id,
        )


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
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

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
    session_id = str(uuid.uuid4())
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
        "attorney_name": profile.get("full_name", ""),
        "message": message,
        "status": "awaiting_signature",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signing_sessions").insert(record).execute()
    except Exception as e:
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
            "status": "awaiting_signature",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("Could not insert into signature_requests: %s", e)

    # Email the signing link to the client
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    signing_url = f"{frontend_url}/sign/{token}"

    try:
        from utils.email_service import send_email
        await send_email(
            to=signer_email,
            subject=f"Signature Required: {title}",
            body=f"""
            <div style="font-family:sans-serif;font-size:14px;line-height:1.6;max-width:500px;">
                <h2 style="color:#1e40af;">Signature Required</h2>
                <p>Hello {signer_name},</p>
                <p>{message}</p>
                <p><strong>Document:</strong> {title}</p>
                <p><strong>From:</strong> {profile.get('full_name', 'Your Attorney')}</p>
                <div style="margin:24px 0;">
                    <a href="{signing_url}"
                       style="background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                        Review &amp; Sign Document
                    </a>
                </div>
                <p style="color:#64748b;font-size:12px;">
                    Or copy this link: {signing_url}
                </p>
            </div>
            """,
        )
        logger.info("Signing link emailed to %s", signer_email)
    except Exception as e:
        logger.error("Failed to email signing link to %s: %s", signer_email, e)

    return {
        "session_id": session_id,
        "token": token,
        "signing_url": signing_url,
        "status": "awaiting_signature",
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

    return {
        "session_id": session["id"],
        "title": session["title"],
        "document_type": session["document_type"],
        "signer_name": session["signer_name"],
        "signer_email": session["signer_email"],
        "attorney_name": session.get("attorney_name", ""),
        "message": session.get("message", ""),
        "status": session["status"],
    }


# ---------------------------------------------------------------------------
# GET /{token}/pdf — public endpoint, serves the PDF directly (no CORS issues)
# ---------------------------------------------------------------------------

@router.get("/{token}/pdf")
async def get_signing_pdf(token: str):
    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("id, original_path, status").eq("token", token).limit(1).execute()
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
    body = await request.json()
    signature_data = body.get("signature")
    typed_name = body.get("typed_name", "")

    if not signature_data:
        raise HTTPException(status_code=400, detail="Signature is required.")

    supabase = get_supabase()

    resp = supabase.table("signing_sessions").select("*").eq("token", token).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Signing session not found.")

    session = resp.data[0]
    if session["status"] in ("signed", "complete"):
        raise HTTPException(status_code=400, detail="Already signed.")

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

    _link_signed_pdf_to_case(supabase, session, signed_path, signed_pdf)

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

    # Notify the attorney
    try:
        from utils.email_service import send_email
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        attorney_resp = supabase.table("profiles").select("email, full_name").eq("id", session["sent_by"]).limit(1).execute()
        if attorney_resp.data:
            atty = attorney_resp.data[0]
            await send_email(
                to=atty["email"],
                subject=f"Document Signed: {session['title']}",
                body=f"""
                <div style="font-family:sans-serif;font-size:14px;line-height:1.6;">
                    <h2 style="color:#059669;">Document Signed</h2>
                    <p>{session['signer_name']} has signed <strong>{session['title']}</strong>.</p>
                    <p>
                        <a href="{frontend_url}/attorney/esign"
                           style="background:#2563eb;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                            View in LegalFlow
                        </a>
                    </p>
                </div>
                """,
            )
    except Exception as e:
        logger.warning("Failed to notify attorney of signature: %s", e)

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
        headers={"Content-Disposition": f'attachment; filename="signed_{session["title"]}.pdf"'},
    )


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


def _execution_block_placement(doc) -> Optional[dict]:
    """Locate the client-side `By:` / `Date:` pair in a two-party execution block.

    The detector intentionally chooses the leftmost paired fields in the lower
    portion of a page. This matches common settlement-agreement layouts while
    avoiding a company-side execution block that is typically positioned right.
    """
    import fitz  # PyMuPDF

    for page in reversed(doc):
        page_rect = page.rect
        by_labels = [
            rect for rect in page.search_for("By:")
            if rect.y0 >= page_rect.height * 0.55
        ]
        date_labels = [
            rect for rect in page.search_for("Date:")
            if rect.y0 >= page_rect.height * 0.55
        ]
        if not by_labels or not date_labels:
            continue

        candidates = []
        for by_rect in by_labels:
            matching_dates = [
                date_rect for date_rect in date_labels
                if date_rect.y0 > by_rect.y0
                and date_rect.y0 - by_rect.y0 <= 105
                and abs(date_rect.x0 - by_rect.x0) <= 24
            ]
            if matching_dates:
                candidates.append((by_rect, min(matching_dates, key=lambda rect: rect.y0)))
        if not candidates:
            continue

        # The leftmost paired execution fields are the client-facing block.
        by_rect, date_rect = min(candidates, key=lambda pair: (pair[0].x0, pair[0].y0))
        next_column = min(
            (candidate_by.x0 for candidate_by, _ in candidates if candidate_by.x0 > by_rect.x0 + 80),
            default=page_rect.width - 54,
        )
        field_left = by_rect.x1 + 10
        # Execution lines are commonly shorter than the space between columns;
        # keep the artwork within the client line instead of spanning the gap.
        field_right = min(next_column - 24, field_left + 155)
        date_x = max(field_left, date_rect.x1 + 10)
        if field_right - field_left < 80:
            continue

        # Reserve the full vertical space between the party heading and date
        # field so descenders in a handwritten signature cannot be clipped.
        signature_rect = fitz.Rect(
            field_left,
            max(by_rect.y0 - 30, 36),
            field_right,
            max(date_rect.y0 - 6, by_rect.y1 + 18),
        )
        return {
            "strategy": "detected_execution_block",
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

    if placement["strategy"] == "detected_execution_block":
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
