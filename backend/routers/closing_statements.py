"""Settlement closing-statement generation and signing workflow.

An attorney uploads a settlement document, reviews deterministic extraction
suggestions, enters the client payout, and generates a client-signable closing
statement. The source settlement, draft statement, and later signed statement
are linked to the selected case so they appear in existing case and client
Documents views.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from utils.closing_statement_renderer import ClosingStatementData, render_closing_statement
from utils.document_reader import _read_docx, _read_pdf, _read_txt
from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

STORAGE_BUCKET = "documents"
MAX_SETTLEMENT_BYTES = 20 * 1024 * 1024
SUPPORTED_SETTLEMENT_TYPES = {
    "pdf", "application/pdf",
    "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt", "text", "text/plain",
}

MONEY_PATTERNS = (
    re.compile(r"(?is)(?:total\s+)?settlement\s+(?:amount|sum|proceeds?)\s*(?:of|is|:)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)"),
    re.compile(r"(?is)gross\s+settlement\s*(?:amount|sum|proceeds?)?\s*(?:of|is|:)?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)"),
    re.compile(r"(?is)pay(?:ment|able)?\s+(?:of|in\s+the\s+amount\s+of)\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)"),
    re.compile(r"(?is)(?:total\s+)?(?:cash\s+)?consideration\b[^$]{0,100}\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)"),
    re.compile(r"(?is)(?:total\s+)?settlement\s+payment\b[^$]{0,100}\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)"),
)
LABELED_LINE_PATTERNS = {
    "case_number": re.compile(r"(?im)^\s*(?:case\s*(?:no\.?|number)|matter\s*(?:no\.?|number))\s*[:#\-]?\s*(?P<value>[^\n]{1,120})$"),
    "adverse_party": re.compile(
        r"(?im)^\s*(?:adverse\s+part(?:y|ies)|defendant(?:s)?|released\s+part(?:y|ies)|respondent(?:s)?)"
        r"\s*(?:(?:is|are)\s*)?[:\-]?\s*(?P<value>[^\n]{2,180})$"
    ),
    "account_reference": re.compile(r"(?im)^\s*(?:re|account(?:\s*(?:no\.?|number))?|reference)\s*[:#\-]?\s*(?P<value>[^\n]{2,220})$"),
}

# Many settlement agreements do not label the defendant directly but include a
# conventional case caption such as "Jane Client v. Acme Collections LLC." The
# right side is useful only as a suggestion and remains editable by the attorney.
CASE_CAPTION_ADVERSE_PARTY_PATTERN = re.compile(
    r"(?im)^\s*[^\n]{2,150}?\s+(?:v\.?|vs\.?|versus)\s+(?P<value>[A-Z0-9][^\n]{1,180})$"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required.")


def _safe_filename(value: str, fallback: str) -> str:
    name = Path(value or fallback).name.replace("\x00", "").strip()
    return name or fallback


def _normalized_file_type(file_type: str | None, filename: str) -> str:
    raw = (file_type or "").lower().strip()
    if raw:
        return raw
    return Path(filename).suffix.lower().lstrip(".")


def _money_to_cents(value: object, label: str) -> int:
    raw = str(value or "").strip().replace("$", "").replace(",", "")
    if not raw:
        raise ValueError(f"{label} is required.")
    try:
        amount = Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} must be a valid dollar amount.") from exc
    if amount < 0:
        raise ValueError(f"{label} cannot be negative.")
    return int(amount * 100)


def _format_dollars(cents: int | None) -> Optional[str]:
    if cents is None:
        return None
    return f"{cents // 100:,}.{cents % 100:02d}"


def _extract_labeled_value(text: str, key: str) -> Optional[str]:
    match = LABELED_LINE_PATTERNS[key].search(text or "")
    if not match:
        return None
    value = re.sub(r"\s+", " ", match.group("value")).strip(" .;:")
    return value[:220] or None


def _normalize_adverse_party(value: str | None) -> Optional[str]:
    """Normalize a suggested opposing-party name without interpreting document content."""
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" \t\r\n.,;:-")
    # Captions frequently retain a trailing party designation after the entity name.
    cleaned = re.sub(
        r"\s*(?:,|\()\s*(?:defendant|defendants|respondent|respondents|released\s+party|released\s+parties)\s*\)?\s*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip(" \t\r\n.,;:-")
    return cleaned[:180] or None


def _extract_adverse_party(text: str) -> tuple[Optional[str], Optional[str]]:
    """Return a conservative settlement-derived adverse-party suggestion and source."""
    labeled = _normalize_adverse_party(_extract_labeled_value(text, "adverse_party"))
    if labeled:
        return labeled, "settlement"

    caption_match = CASE_CAPTION_ADVERSE_PARTY_PATTERN.search(text or "")
    if caption_match:
        caption_value = _normalize_adverse_party(caption_match.group("value"))
        if caption_value:
            return caption_value, "settlement_caption"
    return None, None


def _case_adverse_party(case_id: str) -> Optional[str]:
    """Build an authoritative fallback from defendants already linked to the selected case."""
    supabase = get_supabase()
    linked = (
        supabase.table("case_defendants")
        .select("defendant_id")
        .eq("case_id", case_id)
        .execute()
    )
    names: list[str] = []
    for row in linked.data or []:
        defendant_id = row.get("defendant_id")
        if not defendant_id:
            continue
        response = (
            supabase.table("defendants")
            .select("name")
            .eq("id", defendant_id)
            .limit(1)
            .execute()
        )
        if response.data:
            name = _normalize_adverse_party(response.data[0].get("name"))
            if name and name not in names:
                names.append(name)
    return ", ".join(names)[:180] or None


def _extract_settlement_suggestions(text: str) -> dict:
    """Return deterministic metadata suggestions without retaining source text."""
    gross_cents: Optional[int] = None
    for pattern in MONEY_PATTERNS:
        match = pattern.search(text or "")
        if not match:
            continue
        try:
            gross_cents = _money_to_cents(match.group(1), "Gross settlement amount")
            break
        except ValueError:
            continue

    lowered = (text or "").lower()
    non_monetary_terms: Optional[str] = None
    if "delete" in lowered and "credit" in lowered:
        non_monetary_terms = (
            "In addition to the monetary consideration above, the settlement provides for the "
            "elimination and waiver of any and all obligations related to the Debt, including a "
            "request for deletion of the adverse party's tradeline (if any) from the Client's credit reports."
        )
    elif "waive" in lowered or "release" in lowered:
        non_monetary_terms = (
            "In addition to the monetary consideration above, the settlement provides for the "
            "elimination and waiver of obligations as described in the settlement agreement."
        )

    adverse_party, adverse_party_source = _extract_adverse_party(text)
    return {
        "gross_settlement_cents": gross_cents,
        "gross_settlement_amount": _format_dollars(gross_cents),
        "case_number": _extract_labeled_value(text, "case_number"),
        "adverse_party": adverse_party,
        "adverse_party_source": adverse_party_source,
        "account_reference": _extract_labeled_value(text, "account_reference"),
        "non_monetary_terms": non_monetary_terms,
    }


def _read_settlement_upload(content: bytes, file_type: str, filename: str) -> str:
    normalized = _normalized_file_type(file_type, filename)
    if normalized in ("pdf", "application/pdf"):
        return _read_pdf(content)
    if normalized in ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"):
        return _read_docx(content)
    if normalized in ("txt", "text", "text/plain"):
        return _read_txt(content)
    raise HTTPException(
        status_code=400,
        detail="Upload the settlement as a PDF, DOCX, or TXT file so LegalFlow can read it.",
    )


def _settlement_suggestions_for_case(case: dict, text: str) -> tuple[dict, str]:
    """Return reviewable settlement suggestions with case-record fallbacks."""
    suggestions = _extract_settlement_suggestions(text)
    suggestions["case_number"] = suggestions.get("case_number") or _case_number(case)
    if not suggestions.get("adverse_party"):
        try:
            linked_adverse_party = _case_adverse_party(case["id"])
        except Exception:
            logger.warning("Could not load linked defendants for closing statement case %s", case.get("id"))
            linked_adverse_party = None
        if linked_adverse_party:
            suggestions["adverse_party"] = linked_adverse_party
            suggestions["adverse_party_source"] = "case"

    source = suggestions.get("adverse_party_source")
    if source == "case":
        extraction_note = (
            "The adverse party was filled from the defendants already linked to this case. "
            "Review every suggested value before generating the statement."
        )
    elif source in {"settlement", "settlement_caption"}:
        extraction_note = (
            "The adverse party was found in the settlement and has been prefilled. "
            "Review every suggested value before generating the statement."
        )
    else:
        extraction_note = (
            "LegalFlow could not identify an adverse party automatically. "
            "Enter it manually after reviewing the settlement."
        )
    return suggestions, extraction_note


def _fetch_case_for_attorney(case_id: str, profile: dict) -> tuple[dict, dict]:
    supabase = get_supabase()
    response = supabase.table("cases").select("*").eq("id", case_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Case not found.")
    case = response.data[0]

    client_response = (
        supabase.table("profiles")
        .select("*")
        .eq("id", case["client_id"])
        .limit(1)
        .execute()
    )
    if not client_response.data:
        raise HTTPException(status_code=404, detail="The selected case has no accessible client profile.")
    client = client_response.data[0]

    if profile.get("role") == "staff_attorney" and client.get("assigned_attorney_id") != profile.get("id"):
        raise HTTPException(status_code=403, detail="You do not have access to this client's case.")
    return case, client


def _case_number(case: dict, suggested: Optional[str] = None) -> str:
    chosen = str(suggested or case.get("case_number") or "").strip()
    if chosen:
        return chosen[:120]
    created = str(case.get("created_at") or "")[:4]
    year = created if created.isdigit() else str(datetime.now(timezone.utc).year)
    return f"LF-{year}-{str(case['id']).replace('-', '')[:8].upper()}"


def _owned_statement(statement_id: str, profile: dict) -> dict:
    response = (
        get_supabase().table("closing_statements")
        .select("*")
        .eq("id", statement_id)
        .eq("created_by", profile["id"])
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Closing statement not found.")
    return response.data[0]


def _selected_attorney(attorney_id: str) -> dict:
    """Return a stored attorney record suitable for a stable document letterhead."""
    response = (
        get_supabase().table("attorneys")
        .select("id,full_name,firm_name,address,phone,email")
        .eq("id", attorney_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=400, detail="Choose a valid attorney for the closing-statement letterhead.")
    attorney = response.data[0]
    required_fields = {
        "firm name": attorney.get("firm_name"),
        "office address": attorney.get("address"),
        "office phone": attorney.get("phone"),
        "office email": attorney.get("email"),
    }
    missing = [label for label, value in required_fields.items() if not str(value or "").strip()]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The selected attorney needs a {' and '.join(missing)} before LegalFlow can create the reference-style letterhead."
            ),
        )
    return attorney


def _settlement_document_result(case: dict, document: dict) -> dict:
    """Read a stored case settlement and return the standard editable suggestions."""
    storage_path = str(document.get("storage_path") or "")
    if not storage_path:
        raise HTTPException(status_code=400, detail="The saved settlement document has no storage location.")

    filename = _safe_filename(str(document.get("file_name") or Path(storage_path).name), "settlement")
    file_type = _normalized_file_type(str(document.get("file_type") or ""), filename)
    try:
        content = get_supabase().storage.from_(STORAGE_BUCKET).download(storage_path)
        text = _read_settlement_upload(content, file_type, filename)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not read saved settlement %s: %s", storage_path, exc)
        text = ""

    suggestions, extraction_note = _settlement_suggestions_for_case(case, text)
    return {
        "settlement_document": document,
        "suggestions": suggestions,
        "extraction_note": extraction_note,
    }


def _latest_settlement_signing_session(case_id: str, signing_session_id: str | None = None) -> Optional[dict]:
    """Return the requested or most recent case-linked settlement signing source."""
    query = (
        get_supabase().table("signing_sessions")
        .select("id,title,document_type,original_path,case_id,sent_by,created_at")
        .eq("case_id", case_id)
    )
    if signing_session_id:
        query = query.eq("id", signing_session_id).limit(1)
        response = query.execute()
        session = (response.data or [None])[0]
        if not session:
            raise HTTPException(status_code=404, detail="The selected settlement agreement is not available for this case.")
        if session.get("document_type") not in {"settlement", "settlement_agreement"}:
            raise HTTPException(status_code=400, detail="Only a settlement agreement can be attached to a closing statement.")
        return session

    response = query.order("created_at", desc=True).limit(50).execute()
    for session in response.data or []:
        if session.get("document_type") in {"settlement", "settlement_agreement"}:
            return session
    return None


def _attach_settlement_signing_source(case: dict, profile: dict, signing_session_id: str | None = None) -> Optional[dict]:
    """Create one case-document reference to the immutable Step 1 settlement source."""
    session = _latest_settlement_signing_session(case["id"], signing_session_id)
    if not session:
        return None

    storage_path = str(session.get("original_path") or "")
    if not storage_path:
        raise HTTPException(status_code=400, detail="The settlement agreement source file is unavailable.")

    supabase = get_supabase()
    existing = (
        supabase.table("case_documents")
        .select("*")
        .eq("case_id", case["id"])
        .eq("storage_path", storage_path)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    source_name = _safe_filename(Path(storage_path).name.removeprefix("source_"), "settlement")
    file_type = _normalized_file_type(None, source_name)
    if file_type not in SUPPORTED_SETTLEMENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="The settlement agreement must be a PDF or DOCX before it can be used for a closing statement.",
        )

    try:
        content = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
        if not content:
            raise RuntimeError("No source bytes were returned.")
        created = supabase.table("case_documents").insert({
            "case_id": case["id"],
            "file_name": source_name,
            "file_type": file_type,
            "file_size": len(content),
            "storage_path": storage_path,
            "document_category": "settlement",
            "uploaded_by": session.get("sent_by") or profile["id"],
        }).execute()
        if not created.data:
            raise RuntimeError("Settlement document metadata could not be saved.")
        return created.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not link Step 1 settlement source to case %s", case["id"])
        raise HTTPException(status_code=500, detail="Could not attach the settlement agreement to this case.") from exc


class SigningSettlementAttachment(BaseModel):
    case_id: str
    signing_session_id: str = Field(min_length=1, max_length=120)

    @field_validator("case_id")
    @classmethod
    def nonempty_case_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A related case is required.")
        return value.strip()


class ClosingStatementCreate(BaseModel):
    case_id: str
    settlement_document_id: Optional[str] = None
    settlement_storage_path: Optional[str] = Field(default=None, max_length=600)
    case_number: Optional[str] = Field(default=None, max_length=120)
    adverse_party: Optional[str] = Field(default=None, max_length=180)
    account_reference: Optional[str] = Field(default=None, max_length=220)
    gross_settlement_amount: str = Field(min_length=1, max_length=32)
    client_payout_amount: str = Field(min_length=1, max_length=32)
    paralegal_fee_amount: str = Field(default="0", max_length=32)
    court_cost_amount: str = Field(default="0", max_length=32)
    service_of_process_cost_amount: str = Field(default="0", max_length=32)
    attorney_id: str = Field(min_length=1, max_length=120)
    non_monetary_terms: Optional[str] = Field(default=None, max_length=2000)
    signer_name: Optional[str] = Field(default=None, max_length=160)
    signer_email: Optional[EmailStr] = None

    @field_validator("case_id")
    @classmethod
    def nonempty_case_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A related case is required.")
        return value.strip()


@router.post("/extract-settlement", status_code=status.HTTP_201_CREATED)
async def upload_and_extract_settlement(
    case_id: str = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    """Store a settlement in the selected case and return safe extraction suggestions."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    case, _client = _fetch_case_for_attorney(case_id, profile)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Choose a settlement file to upload.")
    if len(content) > MAX_SETTLEMENT_BYTES:
        raise HTTPException(status_code=400, detail="Settlement file is too large. The maximum size is 20 MB.")

    file_name = _safe_filename(file.filename or "settlement", "settlement")
    file_type = _normalized_file_type(file.content_type, file_name)
    if file_type not in SUPPORTED_SETTLEMENT_TYPES:
        raise HTTPException(status_code=400, detail="Upload the settlement as a PDF, DOCX, or TXT file.")

    try:
        text = _read_settlement_upload(content, file_type, file_name)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not extract settlement text for case %s: %s", case_id, exc)
        text = ""

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file_name)
    storage_path = f"cases/{case_id}/settlement_{uuid.uuid4().hex}_{safe_name}"
    supabase = get_supabase()
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
        document_response = supabase.table("case_documents").insert({
            "case_id": case_id,
            "file_name": file_name,
            "file_type": file_type,
            "file_size": len(content),
            "storage_path": storage_path,
            "document_category": "settlement",
            "uploaded_by": profile["id"],
        }).execute()
        if not document_response.data:
            raise RuntimeError("Settlement document metadata could not be saved.")
    except Exception as exc:
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not clean up failed settlement upload %s", storage_path)
        logger.exception("Could not store settlement for case %s", case_id)
        raise HTTPException(status_code=500, detail="Could not store the settlement document.") from exc

    suggestions, extraction_note = _settlement_suggestions_for_case(case, text)
    return {
        "settlement_document": document_response.data[0],
        "suggestions": suggestions,
        "extraction_note": extraction_note,
    }


@router.post("/attach-signing-settlement", status_code=status.HTTP_201_CREATED)
async def attach_signing_settlement(
    payload: SigningSettlementAttachment,
    authorization: str = Header(...),
):
    """Attach the Step 1 settlement source to the case for closing-statement reuse."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    case, _client = _fetch_case_for_attorney(payload.case_id, profile)
    document = _attach_settlement_signing_source(case, profile, payload.signing_session_id)
    if not document:
        raise HTTPException(status_code=404, detail="No settlement agreement is available for this case.")
    return _settlement_document_result(case, document)


@router.get("/settlement-source")
async def get_settlement_source(
    case_id: str,
    authorization: str = Header(...),
):
    """Return a saved settlement source, attaching a Step 1 agreement on demand."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    case, _client = _fetch_case_for_attorney(case_id, profile)
    supabase = get_supabase()
    existing = (
        supabase.table("case_documents")
        .select("*")
        .eq("case_id", case["id"])
        .eq("document_category", "settlement")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    document = (existing.data or [None])[0]
    if not document:
        document = _attach_settlement_signing_source(case, profile)
    if not document:
        return {"settlement_document": None, "suggestions": {}, "extraction_note": None}
    return _settlement_document_result(case, document)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_closing_statement(
    payload: ClosingStatementCreate,
    authorization: str = Header(...),
):
    """Create a reviewable closing-statement PDF; sending is a separate action."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    case, client = _fetch_case_for_attorney(payload.case_id, profile)

    try:
        gross_cents = _money_to_cents(payload.gross_settlement_amount, "Gross settlement amount")
        client_cents = _money_to_cents(payload.client_payout_amount, "Client payout")
        paralegal_cents = _money_to_cents(payload.paralegal_fee_amount, "Paralegal fee")
        court_cost_cents = _money_to_cents(payload.court_cost_amount, "Court costs")
        service_of_process_cost_cents = _money_to_cents(
            payload.service_of_process_cost_amount,
            "Service-of-process costs",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    attorney_cents = gross_cents - client_cents - paralegal_cents - court_cost_cents - service_of_process_cost_cents
    if attorney_cents < 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Client payout, paralegal fee, court costs, and service-of-process costs cannot exceed "
                "the gross settlement amount."
            ),
        )

    if not payload.settlement_document_id:
        raise HTTPException(status_code=400, detail="Upload and select a settlement document before generating the statement.")
    settlement_response = (
        get_supabase().table("case_documents")
        .select("id,storage_path")
        .eq("id", payload.settlement_document_id)
        .eq("case_id", case["id"])
        .limit(1)
        .execute()
    )
    if not settlement_response.data:
        raise HTTPException(status_code=400, detail="The selected settlement document is not available for this case.")
    verified_settlement_path = settlement_response.data[0]["storage_path"]

    attorney = _selected_attorney(payload.attorney_id)

    signer_name = (payload.signer_name or client.get("full_name") or "Client").strip()
    signer_email = str(payload.signer_email or client.get("email") or "").strip()
    if not signer_email:
        raise HTTPException(status_code=400, detail="The selected client needs an email address before the statement can be sent.")

    statement_case_number = _case_number(case, payload.case_number)
    if case.get("case_number") != statement_case_number:
        try:
            get_supabase().table("cases").update({"case_number": statement_case_number}).eq("id", case["id"]).execute()
        except Exception:
            logger.warning("Could not persist case number for %s", case["id"])

    statement_id = str(uuid.uuid4())
    statement_file_name = f"Closing_Statement_{re.sub(r'[^A-Za-z0-9]+', '_', signer_name).strip('_') or 'Client'}.pdf"
    renderer_data = ClosingStatementData(
        firm_name=str(attorney.get("firm_name") or "LEGALFLOW"),
        firm_address=str(attorney.get("address") or ""),
        firm_phone=str(attorney.get("phone") or ""),
        firm_email=str(attorney.get("email") or ""),
        statement_date=datetime.now(timezone.utc).strftime("%B %d, %Y"),
        client_name=signer_name,
        case_number=statement_case_number,
        adverse_party=str(payload.adverse_party or ""),
        account_reference=str(payload.account_reference or ""),
        gross_settlement_cents=gross_cents,
        client_payout_cents=client_cents,
        paralegal_fee_cents=paralegal_cents,
        court_cost_cents=court_cost_cents,
        service_of_process_cost_cents=service_of_process_cost_cents,
        attorney_fee_cents=attorney_cents,
        non_monetary_terms=str(payload.non_monetary_terms or ""),
    )
    try:
        pdf_bytes = render_closing_statement(renderer_data)
    except Exception as exc:
        logger.exception("Closing statement rendering failed")
        raise HTTPException(status_code=500, detail="Could not render the closing statement PDF.") from exc

    storage_path = f"cases/{case['id']}/closing-statements/{statement_id}/{statement_file_name}"
    supabase = get_supabase()
    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        doc_response = supabase.table("case_documents").insert({
            "case_id": case["id"],
            "file_name": statement_file_name,
            "file_type": "pdf",
            "file_size": len(pdf_bytes),
            "storage_path": storage_path,
            "document_category": "closing_statement",
            "uploaded_by": profile["id"],
        }).execute()
        if not doc_response.data:
            raise RuntimeError("Closing statement case document could not be saved.")
        record_response = supabase.table("closing_statements").insert({
            "id": statement_id,
            "case_id": case["id"],
            "client_id": case["client_id"],
            "settlement_document_id": payload.settlement_document_id,
            "settlement_storage_path": verified_settlement_path,
            "draft_storage_path": storage_path,
            "statement_file_name": statement_file_name,
            "case_number": statement_case_number,
            "adverse_party": payload.adverse_party,
            "account_reference": payload.account_reference,
            "gross_settlement_cents": gross_cents,
            "client_payout_cents": client_cents,
            "paralegal_fee_cents": paralegal_cents,
            "court_cost_cents": court_cost_cents,
            "service_of_process_cost_cents": service_of_process_cost_cents,
            "attorney_fee_cents": attorney_cents,
            "attorney_id": attorney["id"],
            "letterhead_firm_name": attorney.get("firm_name"),
            "letterhead_address": attorney.get("address"),
            "letterhead_phone": attorney.get("phone"),
            "letterhead_email": attorney.get("email"),
            "non_monetary_terms": payload.non_monetary_terms,
            "signer_name": signer_name,
            "signer_email": signer_email,
            "status": "draft",
            "created_by": profile["id"],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }).execute()
        if not record_response.data:
            raise RuntimeError("Closing statement record could not be saved.")
    except Exception as exc:
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not clean up failed closing statement PDF %s", storage_path)
        logger.exception("Could not create closing statement for case %s", case["id"])
        raise HTTPException(status_code=500, detail="Could not save the closing statement.") from exc

    return {"statement": record_response.data[0], "case_document": doc_response.data[0]}


@router.get("")
async def list_closing_statements(authorization: str = Header(...)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    response = (
        get_supabase().table("closing_statements")
        .select("id,case_id,client_id,statement_file_name,case_number,adverse_party,gross_settlement_cents,client_payout_cents,paralegal_fee_cents,court_cost_cents,service_of_process_cost_cents,attorney_fee_cents,attorney_id,letterhead_firm_name,signer_name,signer_email,status,signature_session_id,created_at,updated_at,signed_storage_path")
        .eq("created_by", profile["id"])
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return response.data or []


@router.get("/{statement_id}/download")
async def download_closing_statement(
    statement_id: str,
    signed: bool = False,
    authorization: str = Header(...),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    statement = _owned_statement(statement_id, profile)
    path = statement.get("signed_storage_path") if signed else statement.get("draft_storage_path")
    if signed and not path:
        raise HTTPException(status_code=400, detail="This closing statement has not been signed yet.")
    try:
        pdf_bytes = get_supabase().storage.from_(STORAGE_BUCKET).download(path)
    except Exception as exc:
        logger.exception("Could not download closing statement %s", statement_id)
        raise HTTPException(status_code=500, detail="Could not retrieve the closing statement PDF.") from exc
    filename = statement["statement_file_name"]
    if signed:
        filename = f"signed_{filename}"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/{statement_id}/send")
async def send_closing_statement_for_signature(
    statement_id: str,
    authorization: str = Header(...),
):
    """Create an in-app signing request from a reviewed closing-statement draft."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    statement = _owned_statement(statement_id, profile)
    if statement.get("status") == "signed":
        raise HTTPException(status_code=400, detail="This closing statement has already been signed.")
    if statement.get("status") == "awaiting_signature":
        raise HTTPException(status_code=400, detail="This closing statement has already been sent for signature.")

    try:
        pdf_bytes = get_supabase().storage.from_(STORAGE_BUCKET).download(statement["draft_storage_path"])
    except Exception as exc:
        logger.exception("Could not load closing statement draft %s for sending", statement_id)
        raise HTTPException(status_code=500, detail="Could not load the closing statement draft.") from exc

    from routers.signing import create_generated_pdf_signing_session

    result = await create_generated_pdf_signing_session(
        pdf_bytes=pdf_bytes,
        filename=statement["statement_file_name"],
        signer_name=statement["signer_name"],
        signer_email=statement["signer_email"],
        title=f"Settlement Closing Statement — {statement['case_number']}",
        document_type="closing_statement",
        case_id=statement["case_id"],
        client_id=statement["client_id"],
        message=(
            "Please review the settlement closing statement and sign to acknowledge and approve "
            "the listed disbursement of settlement funds."
        ),
        profile=profile,
    )
    try:
        get_supabase().table("closing_statements").update({
            "signature_session_id": result["session_id"],
            "status": "awaiting_signature",
            "updated_at": _now_iso(),
        }).eq("id", statement_id).eq("created_by", profile["id"]).execute()
    except Exception as exc:
        logger.exception("Could not link closing statement %s to signing session", statement_id)
        raise HTTPException(status_code=500, detail="The closing statement was prepared but could not be linked to its signature request.") from exc

    return {
        "message": "Closing statement sent for client signature.",
        "statement_id": statement_id,
        **result,
    }
