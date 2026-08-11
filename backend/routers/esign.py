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
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from utils.esign_notifications import notify_attorney_of_esign_event, signed_document_filename
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
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _api_headers():
    return {
        "Authorization": f"Basic {_get_api_key()}",
        "Content-Type": "application/json",
    }


IN_APP_SESSION_FIELDS = (
    "id, token, title, document_type, signer_name, signer_email, status, "
    "original_path, signed_path, signed_at, audit_trail, case_id, client_id, "
    "sent_by, created_at, updated_at"
)


def _get_in_app_session(supabase, request_id: str) -> Optional[dict]:
    """Return the LegalFlow-managed signing session for a shared request ID."""
    response = (
        supabase.table("signing_sessions")
        .select(IN_APP_SESSION_FIELDS)
        .eq("id", request_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _in_app_request_detail(session: dict) -> dict:
    """Normalize a LegalFlow session to the shared attorney-dashboard shape."""
    session_status = session.get("status", "awaiting_signature")
    is_view_only = session.get("document_type") == "credit_disclosure"
    is_complete = session_status in ("signed", "complete") or (
        is_view_only and session_status in ("viewed", "reviewed")
    )
    recipient_status = (
        "reviewed" if is_view_only and is_complete
        else ("signed" if is_complete else session_status)
    )
    return {
        "id": session["id"],
        "provider": "legalflow",
        "title": session.get("title", "Document for Signature"),
        "is_complete": is_complete,
        "review_only": is_view_only,
        "has_error": False,
        # The legacy field name is retained for frontend compatibility; for a
        # credit disclosure it is a secure review URL, not a signing URL.
        "signing_url": (
            f"{os.environ.get('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/sign/{session['token']}"
            if not is_complete and session_status != "cancelled"
            else None
        ),
        "details_url": None,
        "signatures": [
            {
                "signer_name": session.get("signer_name", ""),
                "signer_email": session.get("signer_email", ""),
                "status": recipient_status,
                "signed_at": session.get("signed_at"),
                "last_viewed_at": session.get("updated_at") if is_view_only and is_complete else None,
            }
        ],
        "created_at": session.get("created_at"),
        "signed_at": session.get("signed_at"),
        "has_signed_document": bool(session.get("signed_path")) and not is_view_only,
        "has_source_attachment": bool(session.get("original_path")),
        # This route is attorney-authenticated. Keep the IP/audit data inside
        # LegalFlow's authorized dashboard rather than embedding it in the PDF.
        "signing_audit": session.get("audit_trail") if is_complete and not is_view_only else None,
        "source_file_name": Path(session.get("original_path", "document")).name
            .removeprefix("source_")
            .removeprefix("original_"),
    }


DOCUMENT_TYPE_LABELS = {
    "settlement": "Settlement Agreement",
    "settlement_agreement": "Settlement Agreement",
    "closing_statement": "Closing Statement",
    "w9": "Form W-9",
    "credit_disclosure": "Credit Disclosure",
    "oise_engagement_agreement": "Oise Law Representation Agreement",
    "general": "Document for Signature",
}


def _document_type_label(document_type: str | None) -> str:
    """Return a clear human label while preserving unfamiliar provider types."""
    normalized = (document_type or "general").strip().lower()
    return DOCUMENT_TYPE_LABELS.get(normalized, normalized.replace("_", " ").title())


def _in_app_dashboard_document(session: dict) -> dict:
    """Normalize a LegalFlow signing session for the grouped attorney dashboard.

    ``signing_sessions`` is the authoritative record for files signed through
    LegalFlow.  The older ``signature_requests`` mirror remains useful for
    external-provider requests, but must not be the only dashboard source.
    """
    session_status = session.get("status") or "awaiting_signature"
    review_only = session.get("document_type") == "credit_disclosure"
    return {
        "id": session["id"],
        "provider": "legalflow",
        "title": session.get("title", "Document for Signature"),
        "document_type": session.get("document_type") or "general",
        "document_label": _document_type_label(session.get("document_type")),
        "status": session_status,
        "signer_name": session.get("signer_name", ""),
        "signer_email": session.get("signer_email", ""),
        "case_id": session.get("case_id"),
        "client_id": session.get("client_id"),
        "created_at": session.get("created_at"),
        "sent_at": session.get("created_at"),
        "signed_at": session.get("signed_at"),
        "has_signed_document": bool(session.get("signed_path")) and not review_only,
        "has_source_attachment": bool(session.get("original_path")),
        "review_only": review_only,
        "secure_only": False,
        "source_file_name": Path(session.get("original_path", "document")).name
            .removeprefix("source_")
            .removeprefix("original_"),
    }


def _external_dashboard_document(request: dict) -> dict:
    """Normalize a non-LegalFlow provider record for the common dashboard."""
    document_type = request.get("document_type") or "general"
    return {
        "id": request["id"],
        "provider": "external",
        "title": request.get("title", "Document for Signature"),
        "document_type": document_type,
        "document_label": _document_type_label(document_type),
        "status": request.get("status") or "awaiting_signature",
        "signer_name": request.get("signer_name", ""),
        "signer_email": request.get("signer_email", ""),
        "case_id": request.get("case_id"),
        "client_id": request.get("client_id"),
        "created_at": request.get("created_at"),
        "sent_at": request.get("sent_at") or request.get("created_at"),
        "signed_at": request.get("signed_at") or request.get("completed_at"),
        # The authenticated detail/download routes determine external-provider
        # availability at use time; do not infer a file path here.
        "has_signed_document": request.get("status") in ("signed", "complete"),
        "has_source_attachment": False,
        "review_only": False,
        "secure_only": False,
        "source_file_name": None,
    }


def _w9_dashboard_document(request: dict) -> dict:
    """Expose W-9 workflow status without leaking protected tax-document data."""
    return {
        "id": str(request["id"]),
        "provider": "legalflow_w9",
        "title": request.get("title") or "Form W-9 — Taxpayer Information and Certification",
        "document_type": "w9",
        "document_label": "Form W-9",
        "status": request.get("status") or "awaiting_submission",
        "signer_name": request.get("signer_name", ""),
        "signer_email": request.get("signer_email", ""),
        "case_id": request.get("case_id"),
        "client_id": request.get("client_id"),
        "created_at": request.get("created_at"),
        "sent_at": request.get("created_at"),
        "signed_at": request.get("submitted_at"),
        # A completed W-9 exists, but is intentionally opened only from the
        # protected W-9 records area because it can contain a taxpayer ID.
        "has_signed_document": request.get("status") == "complete",
        "has_source_attachment": False,
        "review_only": False,
        "secure_only": True,
        "source_file_name": None,
    }


def _load_dashboard_rows(query, case_id: Optional[str], client_id: Optional[str]) -> list[dict]:
    """Apply common filters and return a bounded, newest-first query result."""
    if case_id:
        query = query.eq("case_id", case_id)
    if client_id:
        query = query.eq("client_id", client_id)
    response = query.order("created_at", desc=True).limit(250).execute()
    return response.data or []


def _load_user_dashboard_rows(
    supabase,
    table_name: str,
    fields: str,
    profile_id: str,
    case_id: Optional[str],
    client_id: Optional[str],
) -> list[dict]:
    """Load records sent by a user or explicitly owned by their activity inbox.

    Oise Law agreements are associated with Esther Oise for contract purposes,
    but their activity belongs in the E-Signatures workspace of the LegalFlow
    user who confirmed the send.  Older rows without the recipient column still
    remain visible through their original ``sent_by`` relationship.
    """
    query = supabase.table(table_name).select(fields)
    ownership_filter = f"sent_by.eq.{profile_id},notification_recipient_id.eq.{profile_id}"
    if hasattr(query, "or_"):
        query = query.or_(ownership_filter)
    else:
        # Compatibility for minimal test doubles; production uses the combined
        # PostgREST filter above.
        query = query.eq("sent_by", profile_id)
    return _load_dashboard_rows(query, case_id, client_id)


def _dashboard_group_context(supabase, documents: list[dict]) -> tuple[dict, dict]:
    """Load only the client and case labels needed to render document groups."""
    case_ids = sorted({str(doc["case_id"]) for doc in documents if doc.get("case_id")})
    client_ids = sorted({str(doc["client_id"]) for doc in documents if doc.get("client_id")})

    case_map: dict[str, dict] = {}
    if case_ids:
        cases = (
            supabase.table("cases")
            .select("id,client_id,case_number")
            .in_("id", case_ids)
            .limit(len(case_ids))
            .execute()
        )
        case_map = {str(row["id"]): row for row in (cases.data or [])}
        client_ids = sorted({
            *client_ids,
            *(str(case["client_id"]) for case in case_map.values() if case.get("client_id")),
        })

    client_map: dict[str, dict] = {}
    if client_ids:
        clients = (
            supabase.table("profiles")
            .select("id,full_name,email")
            .in_("id", client_ids)
            .limit(len(client_ids))
            .execute()
        )
        client_map = {str(row["id"]): row for row in (clients.data or [])}
    return case_map, client_map


def _group_dashboard_documents(supabase, documents: list[dict]) -> list[dict]:
    """Group related documents under one client and case with safe fallbacks."""
    case_map, client_map = _dashboard_group_context(supabase, documents)
    groups: dict[str, dict] = {}

    for document in documents:
        case = case_map.get(str(document.get("case_id"))) if document.get("case_id") else None
        client_id = str(document.get("client_id") or (case or {}).get("client_id") or "")
        client = client_map.get(client_id) if client_id else None
        case_id = str(document.get("case_id") or "")

        if client_id and case_id:
            group_key = f"client:{client_id}:case:{case_id}"
        elif client_id:
            group_key = f"client:{client_id}:case:unassigned"
        else:
            group_key = "unassigned"

        client_name = (client or {}).get("full_name") or document.get("signer_name") or "Unassigned client"
        case_number = (case or {}).get("case_number")
        case_label = (
            f"{case_number} — {client_name}" if case_number and case
            else case_number or client_name if case else "Unassigned case"
        )

        if group_key not in groups:
            groups[group_key] = {
                "id": group_key,
                "client": {"id": client_id or None, "name": client_name, "email": (client or {}).get("email") or document.get("signer_email") or None},
                "case": {"id": case_id or None, "label": case_label, "case_number": case_number},
                "documents": [],
                "latest_activity_at": document.get("signed_at") or document.get("created_at"),
            }
        groups[group_key]["documents"].append(document)
        activity = document.get("signed_at") or document.get("created_at")
        if activity and (not groups[group_key].get("latest_activity_at") or activity > groups[group_key]["latest_activity_at"]):
            groups[group_key]["latest_activity_at"] = activity

    for group in groups.values():
        group["documents"].sort(
            key=lambda doc: doc.get("signed_at") or doc.get("created_at") or "",
            reverse=True,
        )
        group["document_counts"] = {
            "total": len(group["documents"]),
            "complete": sum(doc.get("status") in ("signed", "complete") for doc in group["documents"]),
            "pending": sum(doc.get("status") in ("awaiting_signature", "viewed", "awaiting_submission", "awaiting_review") for doc in group["documents"]),
        }

    return sorted(
        groups.values(),
        key=lambda group: group.get("latest_activity_at") or "",
        reverse=True,
    )


async def _send_in_app_reminder(session: dict) -> bool:
    """Email a fresh review or signing link for an active LegalFlow session."""
    from html import escape
    from utils.email_service import send_email

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    signing_url = f"{frontend_url}/sign/{session['token']}"
    is_view_only = session.get("document_type") == "credit_disclosure"
    if is_view_only:
        subject = "Reminder: Please Review Your Credit Disclosure"
        heading = "Credit Disclosure Review Reminder"
        body_copy = (
            "This is your credit disclosure. Please review it carefully and make sure "
            "everything is reporting properly. If you notice anything that appears "
            "incorrect or have questions, please contact your attorney."
        )
        button_label = "Review Credit Disclosure"
    else:
        subject = f"Reminder: Signature Required — {session.get('title', 'Document')}"
        heading = "Signature Reminder"
        body_copy = f"Please review and sign {session.get('title', 'your document')}."
        button_label = "Review &amp; Sign Document"

    return await send_email(
        to=session["signer_email"],
        subject=subject,
        body=f"""
        <div style="font-family:sans-serif;font-size:14px;line-height:1.6;max-width:500px;">
            <h2 style="color:#1e40af;">{heading}</h2>
            <p>Hello {escape(session.get('signer_name', ''))},</p>
            <p>{escape(body_copy)}</p>
            <p><a href="{signing_url}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">{button_label}</a></p>
            <p style="color:#64748b;font-size:12px;">Or copy this link: {signing_url}</p>
        </div>
        """,
    )


PENDING_REMINDER_STATUSES = ("awaiting_signature", "viewed", "awaiting_review")
SESSION_REMINDER_FIELDS = (
    "id, token, title, document_type, signer_name, signer_email, case_id, client_id, "
    "sent_by, notification_recipient_id, status, created_at, viewed_at, reminder_count, last_reminder_at"
)
REQUEST_REMINDER_FIELDS = (
    "id, title, document_type, signer_name, signer_email, case_id, client_id, sent_by, notification_recipient_id, "
    "status, sent_at, created_at, viewed_at, reminder_count, last_reminder_at"
)


def _parse_utc_timestamp(value: object) -> datetime | None:
    """Normalize an ISO timestamp to an aware UTC datetime."""
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _auto_reminder_is_due(record: dict[str, Any], preferences: dict[str, Any], now: datetime) -> bool:
    """Return whether a pending document is due for its next six-hour reminder.

    The pending-status check is the completion stop condition: signed, declined,
    canceled, expired, and reviewed disclosures never receive another reminder.
    """
    if record.get("status") not in PENDING_REMINDER_STATUSES:
        return False
    # Credit disclosures are delivered for consumer review only. They never
    # require a signature and must not trigger either manual or scheduled
    # reminder emails.
    if record.get("document_type") == "credit_disclosure":
        return False

    last_reminder_at = _parse_utc_timestamp(record.get("last_reminder_at"))
    sent_at = _parse_utc_timestamp(record.get("sent_at") or record.get("created_at"))
    anchor = last_reminder_at or sent_at
    if not anchor:
        return False

    return now >= anchor + timedelta(
        hours=int(preferences["esign_reminder_interval_hours"])
    )


async def _send_external_reminder(request_record: dict[str, Any]) -> bool:
    """Ask Dropbox Sign to send a provider-managed reminder for one request."""
    if not _is_configured():
        logger.warning("Cannot send automatic Dropbox Sign reminder: provider is not configured")
        return False

    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{DROPBOX_SIGN_BASE}/signature_request/remind/{request_record['id']}",
            json={"email_address": request_record["signer_email"]},
            auth=(_get_api_key(), ""),
        )
    if response.status_code == 200:
        return True
    logger.warning(
        "Dropbox Sign reminder failed for %s: HTTP %s",
        request_record.get("id"),
        response.status_code,
    )
    return False


async def process_automatic_signature_reminders(
    *,
    supabase=None,
    now: datetime | None = None,
) -> dict[str, int]:
    """Send due reminders for pending documents while honoring attorney settings.

    LegalFlow sessions remain authoritative for in-app signing.  Their legacy
    request-table mirrors are excluded so a client never receives two reminders
    for the same document in one scan.
    """
    from utils.esign_notifications import get_esign_preferences

    supabase = supabase or get_supabase()
    now = now or datetime.now(timezone.utc)
    now = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)
    results = {"checked": 0, "sent": 0, "failed": 0, "skipped": 0}

    try:
        session_rows = (
            supabase.table("signing_sessions")
            .select(SESSION_REMINDER_FIELDS)
            .in_("status", list(PENDING_REMINDER_STATUSES))
            .limit(200)
            .execute()
            .data
            or []
        )
        request_rows = (
            supabase.table("signature_requests")
            .select(REQUEST_REMINDER_FIELDS)
            .in_("status", list(PENDING_REMINDER_STATUSES))
            .limit(200)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception("Could not load pending E-Signature reminders")
        results["failed"] += 1
        return results

    in_app_ids = {str(row.get("id")) for row in session_rows}
    candidates: list[tuple[str, dict[str, Any], bool]] = [
        ("signing_sessions", row, True) for row in session_rows
    ]
    candidates.extend(
        ("signature_requests", row, False)
        for row in request_rows
        if str(row.get("id")) not in in_app_ids
    )

    for source_table, record, is_in_app in candidates:
        results["checked"] += 1
        preferences, _attorney = await get_esign_preferences(
            supabase, record.get("notification_recipient_id") or record.get("sent_by")
        )
        if not preferences["esign_auto_reminders"] or not _auto_reminder_is_due(record, preferences, now):
            results["skipped"] += 1
            continue

        try:
            delivered = (
                await _send_in_app_reminder(record)
                if is_in_app
                else await _send_external_reminder(record)
            )
        except Exception:
            logger.exception("Could not deliver automatic E-Signature reminder for %s", record.get("id"))
            delivered = False

        if not delivered:
            results["failed"] += 1
            continue

        try:
            supabase.table(source_table).update({
                "reminder_count": int(record.get("reminder_count") or 0) + 1,
                "last_reminder_at": now.isoformat(),
            }).eq("id", record["id"]).execute()
            results["sent"] += 1
        except Exception:
            # The provider accepted the email but tracking failed; log this as a
            # delivery issue so an administrator can repair the history before a
            # later scan retries.
            logger.exception("Reminder delivered but not tracked for %s", record.get("id"))
            results["failed"] += 1

    return results


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

class SettlementPackageDeliveryPayload(BaseModel):
    """Explicit confirmation to deliver completed settlement records to one attorney."""

    case_id: str
    attorney_profile_id: str
    confirmed: bool = False


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
            "test_mode": 0,
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
        "notification_recipient_id": profile["id"],
        "notification_recipient_email": profile.get("email", ""),
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signature_requests").insert(record).execute()
    except Exception as e:
        logger.warning(f"Could not save signature request to DB: {e}")

    try:
        await notify_attorney_of_esign_event(
            supabase=supabase,
            record=record,
            event="sent",
            source_table="signature_requests",
        )
    except Exception:
        # Dropbox Sign already accepted the client invitation; do not turn an
        # attorney-alert issue into a client delivery failure.
        logger.exception("Could not send attorney sent-notification for %s", signature_request_id)

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
        "test_mode": "0",
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
        "notification_recipient_id": profile["id"],
        "notification_recipient_email": profile.get("email", ""),
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("signature_requests").insert(record).execute()
    except Exception as e:
        logger.warning("Could not save signature request to DB: %s", e)

    try:
        await notify_attorney_of_esign_event(
            supabase=supabase,
            record=record,
            event="sent",
            source_table="signature_requests",
        )
    except Exception:
        # The external provider has accepted the invitation already, so an
        # attorney-alert failure must not invalidate that send.
        logger.exception("Could not send attorney sent-notification for %s", signature_request_id)

    return {
        "signature_request_id": signature_request_id,
        "title": title,
        "status": "awaiting_signature",
        "details_url": sig_data.get("details_url"),
    }


# ---------------------------------------------------------------------------
# POST /settlement-package/deliver — selected-attorney completed document email
# ---------------------------------------------------------------------------

@router.post("/settlement-package/deliver")
async def deliver_completed_settlement_package(
    payload: SettlementPackageDeliveryPayload,
    authorization: str = Header(default=None),
):
    """Email a selected attorney the signed settlement agreement and completed W-9.

    Both completed PDF records are attached only after the sender explicitly confirms
    delivery and LegalFlow has verified the selected attorney and case readiness.
    The signed originals and delivery audit remain stored in LegalFlow.
    """
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Confirm delivery before sending completed settlement records.")

    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()

    case_result = (
        supabase.table("cases")
        .select("id,client_id,case_number")
        .eq("id", payload.case_id)
        .limit(1)
        .execute()
    )
    if not case_result.data:
        raise HTTPException(status_code=404, detail="Case not found.")
    case_row = case_result.data[0]

    attorney_result = (
        supabase.table("profiles")
        .select("id,role,full_name,email")
        .eq("id", payload.attorney_profile_id)
        .limit(1)
        .execute()
    )
    if not attorney_result.data:
        raise HTTPException(status_code=404, detail="Selected attorney was not found in LegalFlow.")
    recipient = attorney_result.data[0]
    if recipient.get("role") not in ("attorney", "staff_attorney") or not recipient.get("email"):
        raise HTTPException(status_code=400, detail="Choose an active LegalFlow attorney with an email address.")

    settlement_result = (
        supabase.table("signing_sessions")
        .select("id,title,document_type,status,signed_path,signed_at,signer_name,case_id,client_id")
        .eq("case_id", payload.case_id)
        .order("signed_at", desc=True)
        .limit(25)
        .execute()
    )
    settlement = next(
        (
            row for row in (settlement_result.data or [])
            if row.get("document_type") in ("settlement", "settlement_agreement")
            and row.get("status") in ("signed", "complete")
            and row.get("signed_path")
        ),
        None,
    )
    if not settlement:
        raise HTTPException(status_code=409, detail="A completed signed settlement agreement is required before delivery.")

    w9_result = (
        supabase.table("w9_requests")
        .select("id,title,status,case_id,client_id,submitted_at")
        .eq("case_id", payload.case_id)
        .eq("status", "complete")
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )
    if not w9_result.data:
        raise HTTPException(status_code=409, detail="A completed Form W-9 is required before delivery.")
    w9_request = w9_result.data[0]

    submission_result = (
        supabase.table("w9_submissions")
        .select("id,completed_pdf_path")
        .eq("request_id", w9_request["id"])
        .limit(1)
        .execute()
    )
    if not submission_result.data or not submission_result.data[0].get("completed_pdf_path"):
        raise HTTPException(status_code=409, detail="The completed W-9 PDF is not available yet.")

    delivery_id = str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"legalflow:settlement-package:{payload.case_id}:{recipient['id']}:{settlement['id']}:{w9_request['id']}",
    ))
    prior_delivery = (
        supabase.table("settlement_document_deliveries")
        .select("id,status,sent_at")
        .eq("id", delivery_id)
        .limit(1)
        .execute()
    )
    if prior_delivery.data and prior_delivery.data[0].get("status") == "sent":
        return {
            "status": "already_sent",
            "delivery_id": delivery_id,
            "sent_at": prior_delivery.data[0].get("sent_at"),
            "message": "The selected attorney already received this completed settlement package.",
        }

    now = datetime.now(timezone.utc).isoformat()
    delivery_record = {
        "id": delivery_id,
        "case_id": payload.case_id,
        "client_id": case_row.get("client_id") or settlement.get("client_id") or w9_request.get("client_id"),
        "settlement_session_id": settlement["id"],
        "w9_request_id": w9_request["id"],
        "recipient_profile_id": recipient["id"],
        "recipient_email": recipient["email"],
        "sent_by": profile["id"],
        "status": "sending",
        "created_at": now,
        "updated_at": now,
    }
    try:
        supabase.table("settlement_document_deliveries").upsert(
            delivery_record, on_conflict="id"
        ).execute()
    except Exception as exc:
        logger.exception("Could not prepare settlement package delivery for case %s", payload.case_id)
        raise HTTPException(status_code=500, detail="Could not prepare the completed document delivery.") from exc

    try:
        settlement_pdf = supabase.storage.from_("documents").download(settlement["signed_path"])
        w9_pdf = supabase.storage.from_("documents").download(submission_result.data[0]["completed_pdf_path"])
    except Exception as exc:
        logger.exception("Could not download completed settlement package PDFs for delivery")
        raise HTTPException(status_code=500, detail="Could not retrieve the completed settlement documents.") from exc

    from html import escape
    from utils.email_service import send_email

    raw_client_name = str(settlement.get("signer_name") or "Client").strip() or "Client"
    client_name = escape(raw_client_name)
    case_label = escape(str(case_row.get("case_number") or f"Case {payload.case_id[:8]}"))
    settlement_filename = signed_document_filename(settlement)
    safe_client_name = "".join(char if char.isalnum() or char in (" ", "-", "_") else "" for char in raw_client_name)
    w9_filename = f"{safe_client_name.strip().replace(' ', '_') or 'Client'}_Completed_W-9.pdf"
    delivered = await send_email(
        to=recipient["email"],
        subject=f"Completed Settlement Documents: {client_name}",
        body=f"""
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:600px;">
          <h2 style="color:#059669;">Completed Settlement Documents</h2>
          <p>Hello {escape(str(recipient.get('full_name') or 'Attorney'))},</p>
          <p>The completed settlement package for <strong>{client_name}</strong> is ready for <strong>{case_label}</strong>.</p>
          <ul>
            <li><strong>Signed settlement agreement:</strong> attached to this email.</li>
            <li><strong>Completed Form W-9:</strong> attached to this email.</li>
          </ul>
          <p style="font-size:12px;color:#64748b;">The completed W-9 contains sensitive taxpayer information. Please store both attachments securely and do not forward this email outside the authorized matter team.</p>
        </div>
        """,
        attachments=[
            {"filename": settlement_filename, "content": settlement_pdf},
            {"filename": w9_filename, "content": w9_pdf},
        ],
        idempotency_key=f"settlement-package-{delivery_id}",
    )
    if not delivered:
        supabase.table("settlement_document_deliveries").update({
            "status": "failed", "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", delivery_id).execute()
        raise HTTPException(status_code=502, detail="The completed documents could not be delivered by email. Please try again.")

    sent_at = datetime.now(timezone.utc).isoformat()
    supabase.table("settlement_document_deliveries").update({
        "status": "sent", "sent_at": sent_at, "updated_at": sent_at,
    }).eq("id", delivery_id).execute()
    return {
        "status": "sent",
        "delivery_id": delivery_id,
        "sent_at": sent_at,
        "recipient_name": recipient.get("full_name") or recipient["email"],
        "recipient_email": recipient["email"],
        "message": "The selected attorney received the signed settlement agreement and completed W-9 attachments.",
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
    """List the attorney's signature documents from the authoritative sources.

    LegalFlow-managed agreements are written to ``signing_sessions`` first. The
    legacy ``signature_requests`` row is only a dashboard mirror and can be
    delayed independently, so reading the mirror alone can make a successful
    first send look as though it did not happen. Merge the two sources here and
    exclude mirrored IDs to keep the settlement checklist immediately accurate.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    in_app_sessions = _load_user_dashboard_rows(
        supabase, "signing_sessions", IN_APP_SESSION_FIELDS, profile["id"], case_id, client_id
    )
    in_app_documents = [_in_app_dashboard_document(session) for session in in_app_sessions]
    in_app_ids = {str(session["id"]) for session in in_app_sessions}

    provider_rows = _load_user_dashboard_rows(
        supabase,
        "signature_requests",
        "id,title,document_type,signer_name,signer_email,case_id,client_id,status,sent_at,signed_at,completed_at,created_at",
        profile["id"],
        case_id,
        client_id,
    )
    external_documents = [
        _external_dashboard_document(request)
        for request in provider_rows
        if str(request["id"]) not in in_app_ids
    ]

    return sorted(
        in_app_documents + external_documents,
        key=lambda document: document.get("signed_at") or document.get("sent_at") or document.get("created_at") or "",
        reverse=True,
    )[:100]


# ---------------------------------------------------------------------------
# GET /dashboard — grouped attorney document history
# ---------------------------------------------------------------------------

# Keep this endpoint outside `/requests/{request_id}`. Some deployed route
# registrations preserve an older dynamic request route ahead of new static
# request children, which would otherwise treat `dashboard` as a request ID.
@router.get("/dashboard")
async def grouped_signature_dashboard(
    case_id: Optional[str] = None,
    client_id: Optional[str] = None,
    authorization: str = Header(default=None),
):
    """Return all settlement workflow documents grouped by client and case.

    LegalFlow-managed signing sessions are read directly so a completed document
    remains visible even when the legacy ``signature_requests`` mirror was not
    written or was delayed. Completed W-9 records appear as protected status
    rows; their tax PDFs continue to be accessible only through the dedicated
    W-9 records workflow.
    """
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()

    in_app_sessions = _load_user_dashboard_rows(
        supabase, "signing_sessions", IN_APP_SESSION_FIELDS, profile["id"], case_id, client_id
    )
    in_app_documents = [_in_app_dashboard_document(session) for session in in_app_sessions]
    in_app_ids = {str(session["id"]) for session in in_app_sessions}

    provider_rows = _load_user_dashboard_rows(
        supabase,
        "signature_requests",
        "id,title,document_type,signer_name,signer_email,case_id,client_id,status,sent_at,signed_at,completed_at,created_at",
        profile["id"],
        case_id,
        client_id,
    )
    external_documents = [
        _external_dashboard_document(request)
        for request in provider_rows
        if str(request["id"]) not in in_app_ids
    ]

    w9_query = (
        supabase.table("w9_requests")
        .select("id,title,signer_name,signer_email,case_id,client_id,status,submitted_at,created_at")
        .eq("sent_by", profile["id"])
    )
    w9_rows = _load_dashboard_rows(w9_query, case_id, client_id)
    w9_documents = [_w9_dashboard_document(request) for request in w9_rows]

    documents = in_app_documents + external_documents + w9_documents
    groups = _group_dashboard_documents(supabase, documents)
    return {
        "groups": groups,
        "summary": {
            "documents": len(documents),
            "groups": len(groups),
            "pending": sum(
                document.get("status") in ("awaiting_signature", "viewed", "awaiting_submission", "awaiting_review")
                for document in documents
            ),
            "complete": sum(document.get("status") in ("signed", "complete") for document in documents),
        },
    }


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

    supabase = get_supabase()
    in_app_session = _get_in_app_session(supabase, request_id)
    if in_app_session:
        return _in_app_request_detail(in_app_session)

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

    supabase = get_supabase()
    in_app_session = _get_in_app_session(supabase, request_id)
    if in_app_session:
        is_view_only = in_app_session.get("document_type") == "credit_disclosure"
        if is_view_only:
            raise HTTPException(
                status_code=400,
                detail="Credit disclosures are view-only and do not receive reminder emails.",
            )
        allowed_statuses = ("awaiting_signature", "viewed")
        if in_app_session.get("status") not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Only pending in-app requests can be reminded.")
        try:
            delivered = await _send_in_app_reminder(in_app_session)
        except Exception as exc:
            logger.exception("Could not send in-app document reminder for %s", request_id)
            raise HTTPException(status_code=500, detail="Could not send document reminder.") from exc
        if not delivered:
            raise HTTPException(status_code=502, detail="Email delivery failed. Please check the email configuration and try again.")
        return {
            "status": "review_reminder_sent" if is_view_only else "reminder_sent",
            "email": in_app_session["signer_email"],
        }

    if not _is_configured():
        raise HTTPException(status_code=400, detail="Dropbox Sign not configured")

    # Get the signer email from our DB
    db_resp = supabase.table("signature_requests").select("signer_email").eq("id", request_id).execute()
    if not db_resp.data:
        raise HTTPException(status_code=404, detail="Request not found")

    email = db_resp.data[0]["signer_email"]

    delivered = await _send_external_reminder({
        "id": request_id,
        "signer_email": email,
    })
    if not delivered:
        raise HTTPException(status_code=502, detail="Failed to send reminder")

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

    supabase = get_supabase()
    in_app_session = _get_in_app_session(supabase, request_id)
    if in_app_session:
        if in_app_session.get("status") in ("signed", "complete"):
            raise HTTPException(status_code=400, detail="A completed in-app request cannot be cancelled.")
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("signing_sessions").update({
            "status": "cancelled",
            "updated_at": now,
        }).eq("id", request_id).execute()
        try:
            supabase.table("signature_requests").update({
                "status": "cancelled",
                "updated_at": now,
            }).eq("id", request_id).execute()
        except Exception:
            logger.warning("Could not mirror cancellation for in-app signing session %s", request_id)
        return {"status": "cancelled"}

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

    try:
        supabase.table("signature_requests").update({
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", request_id).execute()
    except Exception:
        pass

    return {"status": "cancelled"}


# ---------------------------------------------------------------------------
# GET /requests/{id}/source — download immutable original attachment
# ---------------------------------------------------------------------------

@router.get("/requests/{request_id}/source")
async def download_original_attachment(
    request_id: str,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    in_app_session = _get_in_app_session(supabase, request_id)
    if not in_app_session:
        raise HTTPException(
            status_code=404,
            detail="Original attachment is available only for LegalFlow signing sessions.",
        )

    source_path = in_app_session.get("original_path")
    if not source_path:
        raise HTTPException(status_code=404, detail="Original attachment is not available.")

    try:
        source_bytes = supabase.storage.from_("documents").download(source_path)
    except Exception as exc:
        logger.exception("Could not download original signing attachment %s", request_id)
        raise HTTPException(status_code=500, detail="Could not download original attachment.") from exc

    if not source_bytes:
        raise HTTPException(status_code=404, detail="Original attachment is empty or unavailable.")

    file_name = Path(source_path).name.removeprefix("source_").removeprefix("original_")
    safe_file_name = file_name.replace('"', "")
    media_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if Path(file_name).suffix.lower() == ".docx"
        else "application/pdf"
        if Path(file_name).suffix.lower() == ".pdf"
        else "application/octet-stream"
    )
    return Response(
        content=source_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_file_name}"'},
    )


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

    supabase = get_supabase()
    in_app_session = _get_in_app_session(supabase, request_id)
    if in_app_session:
        signed_path = in_app_session.get("signed_path")
        if not signed_path:
            raise HTTPException(status_code=400, detail="Document has not been signed yet.")
        try:
            pdf_bytes = supabase.storage.from_("documents").download(signed_path)
        except Exception as exc:
            logger.exception("Could not download in-app signed document %s", request_id)
            raise HTTPException(status_code=500, detail="Could not download signed document.") from exc
        if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
            raise HTTPException(status_code=500, detail="Stored signed document is not a valid PDF.")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{signed_document_filename(in_app_session)}"'},
        )

    try:
        metadata_response = (
            supabase.table("signature_requests")
            .select("id, title, document_type, signer_name")
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        external_request = metadata_response.data[0] if metadata_response.data else {"title": f"Document {request_id[:8]}"}
    except Exception:
        logger.exception("Could not load signed-document metadata for %s", request_id)
        external_request = {"title": f"Document {request_id[:8]}"}

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
            headers={"Content-Disposition": f'attachment; filename="{signed_document_filename(external_request)}"'},
        )


async def _notify_external_esign_event(supabase, request_id: str, event: str) -> None:
    """Deliver an attorney alert for one persisted external-provider event."""
    response = (
        supabase.table("signature_requests")
        .select(
            "id, title, document_type, signer_name, signer_email, case_id, client_id, "
            "sent_by, status, viewed_at, view_notification_sent_at, signed_notification_sent_at"
        )
        .eq("id", request_id)
        .limit(1)
        .execute()
    )
    if response.data:
        await notify_attorney_of_esign_event(
            supabase=supabase,
            record=response.data[0],
            event=event,
            source_table="signature_requests",
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

        # Preserve the in-app notice and also deliver the preference-aware email.
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
            await _notify_external_esign_event(supabase, signature_request_id, "signed")
        except Exception as e:
            logger.warning(f"Webhook notification failed: {e}")

    elif event_type == "signature_request_all_signed":
        try:
            supabase.table("signature_requests").update({
                "status": "complete",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", signature_request_id).execute()
            # Some providers emit only the completion callback. The shared
            # timestamp guard prevents a duplicate alert if an individual
            # signer callback was already delivered.
            await _notify_external_esign_event(supabase, signature_request_id, "signed")
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
            now = datetime.now(timezone.utc).isoformat()
            existing = (
                supabase.table("signature_requests")
                .select("id, viewed_at")
                .eq("id", signature_request_id)
                .limit(1)
                .execute()
            )
            update_payload = {"status": "viewed", "updated_at": now}
            if existing.data and not existing.data[0].get("viewed_at"):
                update_payload["viewed_at"] = now
            supabase.table("signature_requests").update(update_payload).eq("id", signature_request_id).execute()
            await _notify_external_esign_event(supabase, signature_request_id, "viewed")
        except Exception as e:
            logger.warning(f"Webhook DB update failed: {e}")

    return {"status": "ok"}
