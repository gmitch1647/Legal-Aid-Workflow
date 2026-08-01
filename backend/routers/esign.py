"""
E-Signature router — Dropbox Sign (HelloSign) integration.

Allows attorneys to:
- List signature templates
- Send signature requests to clients
- Check request status
- Download signed documents
- Receive completion webhooks
"""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

DROPBOX_SIGN_BASE = "https://api.hellosign.com/v3"


def _get_api_key():
    return os.environ.get("DROPBOX_SIGN_API_KEY", "")


def _get_client_id():
    return os.environ.get("DROPBOX_SIGN_CLIENT_ID", "")


def _is_configured() -> bool:
    return bool(_get_api_key())


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Attorney access required")


def _api_headers():
    return {
        "Authorization": f"Basic {_get_api_key()}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# GET /config — check if Dropbox Sign is configured
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_esign_config(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    return {
        "configured": _is_configured(),
        "client_id": _get_client_id() or None,
    }


# ---------------------------------------------------------------------------
# GET /templates — list available templates
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured. Set DROPBOX_SIGN_API_KEY.")

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DROPBOX_SIGN_BASE}/template/list",
            params={"page": 1, "page_size": 50},
            auth=(_get_api_key(), ""),
        )
        if resp.status_code != 200:
            logger.error(f"Dropbox Sign list templates failed: {resp.status_code} {resp.text}")
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch templates")

        data = resp.json()
        templates = data.get("templates", [])

        return [
            {
                "id": t.get("template_id"),
                "title": t.get("title", "Untitled"),
                "message": t.get("message", ""),
                "signer_roles": [r.get("name") for r in t.get("signer_roles", [])],
                "can_edit": t.get("can_edit", False),
            }
            for t in templates
        ]


# ---------------------------------------------------------------------------
# POST /send — send a signature request
# ---------------------------------------------------------------------------

class SignatureRequestPayload(BaseModel):
    template_id: Optional[str] = None
    title: str = "Document for Signature"
    subject: str = "Please sign this document"
    message: str = "Please review and sign the attached document."
    signer_name: str
    signer_email: str
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    document_type: str = "general"
    custom_fields: Optional[dict] = None  # Auto-populate fields on the template


@router.post("/send")
async def send_signature_request(
    payload: SignatureRequestPayload,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured. Set DROPBOX_SIGN_API_KEY.")

    import httpx

    supabase = get_supabase()

    if payload.template_id:
        # Auto-populate custom fields from client profile
        custom_fields = {}
        if payload.client_id:
            try:
                client_resp = supabase.table("profiles").select("*").eq("id", payload.client_id).limit(1).execute()
                if client_resp.data:
                    c = client_resp.data[0]
                    custom_fields = {
                        "client_name": c.get("full_name", payload.signer_name),
                        "client_email": c.get("email", payload.signer_email),
                        "client_phone": c.get("phone", ""),
                        "client_address": c.get("address", ""),
                        "client_city": c.get("county", ""),
                        "client_state": c.get("state", ""),
                    }
            except Exception as e:
                logger.warning(f"Could not load client profile for auto-fill: {e}")

        # Get attorney info for auto-fill
        try:
            custom_fields["attorney_name"] = profile.get("full_name", "")
            custom_fields["attorney_email"] = profile.get("email", "")
            custom_fields["attorney_phone"] = profile.get("phone", "")
            custom_fields["firm_name"] = profile.get("firm_name", "")
            custom_fields["bar_number"] = profile.get("bar_number", "")
            custom_fields["date"] = datetime.now(timezone.utc).strftime("%m/%d/%Y")
        except Exception:
            pass

        # Merge with any explicitly provided custom fields
        if payload.custom_fields:
            custom_fields.update(payload.custom_fields)

        # Build the request
        request_data = {
            "template_ids": [payload.template_id],
            "title": payload.title,
            "subject": payload.subject,
            "message": payload.message,
            "signers": [
                {
                    "role": "Client",
                    "email_address": payload.signer_email,
                    "name": payload.signer_name,
                }
            ],
            "test_mode": 1,
        }

        # Add custom fields to pre-fill the template
        if custom_fields:
            request_data["custom_fields"] = [
                {"name": k, "value": v} for k, v in custom_fields.items() if v
            ]

        if _get_client_id():
            request_data["client_id"] = _get_client_id()

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{DROPBOX_SIGN_BASE}/signature_request/send_with_template",
                json=request_data,
                auth=(_get_api_key(), ""),
            )
    else:
        raise HTTPException(status_code=400, detail="template_id is required")

    if resp.status_code not in (200, 201):
        logger.error(f"Dropbox Sign send failed: {resp.status_code} {resp.text}")
        detail = "Failed to send signature request"
        try:
            err = resp.json()
            detail = err.get("error", {}).get("error_msg", detail)
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail)

    sig_data = resp.json().get("signature_request", {})
    signature_request_id = sig_data.get("signature_request_id")

    # Store in database
    record = {
        "id": signature_request_id,
        "title": payload.title,
        "document_type": payload.document_type,
        "signer_name": payload.signer_name,
        "signer_email": payload.signer_email,
        "case_id": payload.case_id,
        "client_id": payload.client_id,
        "template_id": payload.template_id,
        "status": "awaiting_signature",
        "sent_by": profile["id"],
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signature_requests").insert(record).execute()
    except Exception as e:
        logger.warning(f"Could not save signature request to DB: {e}")

    return {
        "signature_request_id": signature_request_id,
        "title": payload.title,
        "status": "awaiting_signature",
        "details_url": sig_data.get("details_url"),
        "signing_url": sig_data.get("signing_url"),
    }


# ---------------------------------------------------------------------------
# POST /send-document — send a file (PDF/DOCX) for signature
# ---------------------------------------------------------------------------

@router.post("/send-document")
async def send_document_for_signature(
    file: UploadFile = File(...),
    signer_name: str = Form(...),
    signer_email: str = Form(...),
    title: str = Form("Document for Signature"),
    subject: str = Form("Please sign this document"),
    message: str = Form("Please review and sign the attached document."),
    document_type: str = Form("settlement"),
    case_id: str = Form(None),
    client_id: str = Form(None),
    authorization: str = Header(default=None),
):
    """Upload a PDF/DOCX and send it for signature via Dropbox Sign.

    Signature, printed-name, and date fields are auto-placed at the
    bottom of the last page so the attorney doesn't need to position them.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured. Set DROPBOX_SIGN_API_KEY.")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    filename = file.filename or "document.pdf"
    content_type = file.content_type or "application/pdf"

    import httpx

    form_data = {
        "title": title,
        "subject": subject,
        "message": message,
        "signers[0][email_address]": signer_email,
        "signers[0][name]": signer_name,
        "test_mode": "1",
        "form_fields_per_document": json.dumps([[
            {
                "api_id": "sig_1",
                "type": "signature",
                "x": 72,
                "y": 640,
                "width": 200,
                "height": 40,
                "required": True,
                "signer": "0",
                "page": None,
            },
            {
                "api_id": "name_1",
                "type": "text",
                "x": 72,
                "y": 690,
                "width": 200,
                "height": 20,
                "required": True,
                "signer": "0",
                "page": None,
                "name": "Printed Name",
            },
            {
                "api_id": "date_1",
                "type": "date_signed",
                "x": 350,
                "y": 690,
                "width": 120,
                "height": 20,
                "required": True,
                "signer": "0",
                "page": None,
            },
        ]]),
    }

    if _get_client_id():
        form_data["client_id"] = _get_client_id()

    files_payload = {
        "file[0]": (filename, content, content_type),
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{DROPBOX_SIGN_BASE}/signature_request/send",
            data=form_data,
            files=files_payload,
            auth=(_get_api_key(), ""),
        )

    if resp.status_code not in (200, 201):
        logger.error("Dropbox Sign send-document failed: %s %s", resp.status_code, resp.text[:500])
        detail = "Failed to send signature request"
        try:
            err = resp.json()
            detail = err.get("error", {}).get("error_msg", detail)
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=detail)

    sig_data = resp.json().get("signature_request", {})
    signature_request_id = sig_data.get("signature_request_id")

    supabase = get_supabase()
    record = {
        "id": signature_request_id,
        "title": title,
        "document_type": document_type,
        "signer_name": signer_name,
        "signer_email": signer_email,
        "case_id": case_id if case_id else None,
        "client_id": client_id if client_id else None,
        "status": "awaiting_signature",
        "sent_by": profile["id"],
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signature_requests").insert(record).execute()
    except Exception as e:
        logger.warning("Could not save signature request to DB: %s", e)

    return {
        "signature_request_id": signature_request_id,
        "title": title,
        "status": "awaiting_signature",
        "details_url": sig_data.get("details_url"),
    }


# ---------------------------------------------------------------------------
# GET /requests — list all signature requests
# ---------------------------------------------------------------------------

@router.get("/requests")
async def list_signature_requests(
    case_id: Optional[str] = None,
    client_id: Optional[str] = None,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    query = supabase.table("signature_requests").select("*").order("created_at", desc=True)

    if case_id:
        query = query.eq("case_id", case_id)
    if client_id:
        query = query.eq("client_id", client_id)

    resp = query.limit(100).execute()
    return resp.data or []


# ---------------------------------------------------------------------------
# GET /requests/{id} — get a specific request with live status
# ---------------------------------------------------------------------------

@router.get("/requests/{request_id}")
async def get_signature_request(
    request_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured")

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DROPBOX_SIGN_BASE}/signature_request/{request_id}",
            auth=(_get_api_key(), ""),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch signature request")

        sig = resp.json().get("signature_request", {})

        signatures = []
        for s in sig.get("signatures", []):
            signatures.append({
                "signer_name": s.get("signer_name"),
                "signer_email": s.get("signer_email_address"),
                "status": s.get("status_code"),
                "signed_at": s.get("signed_at"),
                "last_viewed_at": s.get("last_viewed_at"),
            })

        return {
            "id": sig.get("signature_request_id"),
            "title": sig.get("title"),
            "is_complete": sig.get("is_complete"),
            "has_error": sig.get("has_error"),
            "signing_url": sig.get("signing_url"),
            "details_url": sig.get("details_url"),
            "signatures": signatures,
            "created_at": sig.get("created_at"),
        }


# ---------------------------------------------------------------------------
# POST /requests/{id}/remind — send a reminder to signer
# ---------------------------------------------------------------------------

@router.post("/requests/{request_id}/remind")
async def remind_signer(
    request_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured")

    # Get the signer email from our DB
    supabase = get_supabase()
    db_resp = supabase.table("signature_requests").select("signer_email").eq("id", request_id).execute()
    if not db_resp.data:
        raise HTTPException(status_code=404, detail="Request not found")

    email = db_resp.data[0]["signer_email"]

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DROPBOX_SIGN_BASE}/signature_request/remind/{request_id}",
            json={"email_address": email},
            auth=(_get_api_key(), ""),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to send reminder")

    return {"status": "reminder_sent", "email": email}


# ---------------------------------------------------------------------------
# POST /requests/{id}/cancel — cancel a pending request
# ---------------------------------------------------------------------------

@router.post("/requests/{request_id}/cancel")
async def cancel_signature_request(
    request_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured")

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{DROPBOX_SIGN_BASE}/signature_request/cancel/{request_id}",
            auth=(_get_api_key(), ""),
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=resp.status_code, detail="Failed to cancel request")

    supabase = get_supabase()
    try:
        supabase.table("signature_requests").update({
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", request_id).execute()
    except Exception:
        pass

    return {"status": "cancelled"}


# ---------------------------------------------------------------------------
# GET /requests/{id}/download — download signed document
# ---------------------------------------------------------------------------

@router.get("/requests/{request_id}/download")
async def download_signed_document(
    request_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured")

    import httpx
    from fastapi.responses import StreamingResponse
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DROPBOX_SIGN_BASE}/signature_request/files/{request_id}",
            params={"file_type": "pdf"},
            auth=(_get_api_key(), ""),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Failed to download signed document")

        return StreamingResponse(
            iter([resp.content]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=signed-{request_id[:8]}.pdf"},
        )


# ---------------------------------------------------------------------------
# POST /webhook — Dropbox Sign callback (no auth — verified by event hash)
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def esign_webhook(request: Request):
    """Handle Dropbox Sign webhook events."""
    try:
        body = await request.json()
    except Exception:
        try:
            form = await request.form()
            body = json.loads(form.get("json", "{}"))
        except Exception:
            return {"status": "ignored"}

    event = body.get("event", {})
    event_type = event.get("event_type")
    event_metadata = event.get("event_metadata", {})

    logger.info(f"Dropbox Sign webhook: {event_type}")

    # HelloSign API callback validation: respond with "Hello API Event Received"
    if event_type == "callback_test":
        return "Hello API Event Received"

    signature_request_id = event_metadata.get("signature_request_id")
    if not signature_request_id:
        return {"status": "no_request_id"}

    supabase = get_supabase()

    if event_type == "signature_request_signed":
        # A signer has signed
        try:
            supabase.table("signature_requests").update({
                "status": "signed",
                "signed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", signature_request_id).execute()
        except Exception as e:
            logger.warning(f"Webhook DB update failed: {e}")

        # Notify the attorney
        try:
            req_resp = supabase.table("signature_requests").select("sent_by, title, case_id, signer_name").eq("id", signature_request_id).execute()
            if req_resp.data:
                req = req_resp.data[0]
                from utils.notifications import create_notification
                create_notification(
                    user_id=req["sent_by"],
                    notification_type="esign_complete",
                    message=f"{req.get('signer_name', 'Client')} signed \"{req.get('title', 'document')}\"",
                    case_id=req.get("case_id"),
                )
        except Exception as e:
            logger.warning(f"Webhook notification failed: {e}")

    elif event_type == "signature_request_all_signed":
        try:
            supabase.table("signature_requests").update({
                "status": "complete",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", signature_request_id).execute()
        except Exception as e:
            logger.warning(f"Webhook DB update failed: {e}")

    elif event_type == "signature_request_declined":
        try:
            supabase.table("signature_requests").update({
                "status": "declined",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", signature_request_id).execute()
        except Exception as e:
            logger.warning(f"Webhook DB update failed: {e}")

    elif event_type == "signature_request_viewed":
        try:
            supabase.table("signature_requests").update({
                "status": "viewed",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", signature_request_id).execute()
        except Exception as e:
            logger.warning(f"Webhook DB update failed: {e}")

    return {"status": "ok"}
