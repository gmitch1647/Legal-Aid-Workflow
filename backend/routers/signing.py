"""
In-app e-signature router.

Flow:
1. Attorney uploads a PDF and picks a client → POST /signing/create
   - Stores the PDF in Supabase Storage
   - Creates a signing_sessions row with a unique token
   - Emails the client a signing link
2. Client opens /sign/{token} (public page) → GET /signing/{token}
   - Returns session metadata + a signed URL to view the PDF
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
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_BUCKET = "documents"


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# POST /create — attorney uploads a document and creates a signing session
# ---------------------------------------------------------------------------

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

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    supabase = get_supabase()
    session_id = str(uuid.uuid4())
    token = _generate_token()
    filename = file.filename or "document.pdf"

    # Store the original PDF in Supabase Storage
    storage_path = f"signing/{session_id}/original_{filename}"
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            storage_path, content,
            {"content-type": file.content_type or "application/pdf"},
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
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

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

    # Generate a temporary signed URL for the PDF
    try:
        url_resp = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(
            session["original_path"], 3600
        )
        pdf_url = url_resp.get("signedURL") or url_resp.get("signedUrl") or ""
    except Exception as e:
        logger.error("Failed to create signed URL: %s", e)
        pdf_url = ""

    return {
        "session_id": session["id"],
        "title": session["title"],
        "document_type": session["document_type"],
        "signer_name": session["signer_name"],
        "signer_email": session["signer_email"],
        "attorney_name": session.get("attorney_name", ""),
        "message": session.get("message", ""),
        "status": session["status"],
        "pdf_url": pdf_url,
    }


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

    # Download the original PDF
    try:
        pdf_bytes = supabase.storage.from_(STORAGE_BUCKET).download(session["original_path"])
    except Exception as e:
        logger.error("Failed to download original PDF: %s", e)
        raise HTTPException(status_code=500, detail="Could not load document.")

    # Decode the signature image from base64
    try:
        if "," in signature_data:
            signature_data = signature_data.split(",", 1)[1]
        sig_bytes = base64.b64decode(signature_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature data.")

    # Embed the signature into the PDF
    try:
        signed_pdf = _embed_signature(pdf_bytes, sig_bytes, typed_name, session["signer_name"])
    except Exception as e:
        logger.error("Failed to embed signature: %s", e)
        raise HTTPException(status_code=500, detail=f"Signature embedding failed: {e}")

    # Store the signed PDF
    signed_path = session["original_path"].replace("original_", "signed_")
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            signed_path, signed_pdf,
            {"content-type": "application/pdf"},
        )
    except Exception as e:
        logger.error("Failed to upload signed PDF: %s", e)
        raise HTTPException(status_code=500, detail="Could not store signed document.")

    # Record audit trail
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc).isoformat()

    audit = {
        "signer_name": session["signer_name"],
        "signer_email": session["signer_email"],
        "typed_name": typed_name,
        "ip_address": client_ip,
        "user_agent": request.headers.get("user-agent", ""),
        "signed_at": now,
    }

    supabase.table("signing_sessions").update({
        "status": "signed",
        "signed_path": signed_path,
        "signed_at": now,
        "audit_trail": audit,
        "updated_at": now,
    }).eq("token", token).execute()

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
# Helper — embed signature image into PDF using ReportLab + PyPDF2
# ---------------------------------------------------------------------------

def _embed_signature(pdf_bytes: bytes, sig_image_bytes: bytes, typed_name: str, signer_name: str) -> bytes:
    """Overlay a signature image + typed name + date onto the last page of a PDF."""
    from io import BytesIO

    from PIL import Image
    from PyPDF2 import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas

    reader = PdfReader(BytesIO(pdf_bytes))
    writer = PdfWriter()

    last_page_idx = len(reader.pages) - 1

    for i, page in enumerate(reader.pages):
        if i == last_page_idx:
            page_width = float(page.mediabox.width)
            page_height = float(page.mediabox.height)

            overlay_buf = BytesIO()
            c = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))

            # Draw signature line
            sig_x = 72
            sig_y = 100
            line_width = 250

            c.setStrokeColorRGB(0, 0, 0)
            c.setLineWidth(0.5)
            c.line(sig_x, sig_y, sig_x + line_width, sig_y)

            # Draw signature image above the line
            try:
                sig_img = Image.open(BytesIO(sig_image_bytes))
                if sig_img.mode != "RGBA":
                    sig_img = sig_img.convert("RGBA")
                img_width, img_height = sig_img.size
                aspect = img_width / img_height
                draw_height = 50
                draw_width = draw_height * aspect
                if draw_width > line_width:
                    draw_width = line_width
                    draw_height = draw_width / aspect

                img_reader = ImageReader(sig_img)
                c.drawImage(img_reader, sig_x, sig_y + 5, draw_width, draw_height, mask="auto")
            except Exception as e:
                logger.warning("Could not embed signature image: %s", e)

            # Typed name below signature line
            c.setFont("Helvetica", 10)
            display_name = typed_name or signer_name
            c.drawString(sig_x, sig_y - 15, display_name)

            # Date on the right
            date_str = datetime.now(timezone.utc).strftime("%m/%d/%Y")
            c.drawString(sig_x + line_width + 30, sig_y - 15, f"Date: {date_str}")

            # "Electronically signed" notice
            c.setFont("Helvetica", 7)
            c.setFillColorRGB(0.4, 0.4, 0.4)
            c.drawString(sig_x, sig_y - 28, f"Electronically signed via LegalFlow on {date_str}")

            c.save()
            overlay_buf.seek(0)

            overlay_reader = PdfReader(overlay_buf)
            page.merge_page(overlay_reader.pages[0])

        writer.add_page(page)

    output = BytesIO()
    writer.write(output)
    return output.getvalue()
