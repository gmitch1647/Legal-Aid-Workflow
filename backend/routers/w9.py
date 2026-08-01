"""Secure Form W-9 collection and signing workflow.

The public W-9 link collects the information needed to complete the official IRS
Form W-9. Taxpayer identification numbers are encrypted before persistence,
never returned by list/detail APIs, and never written to application logs.
Completed PDFs are stored in a private W-9 storage bucket and can be downloaded
only by authenticated LegalFlow attorneys.
"""

import base64
import io
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

W9_STORAGE_BUCKET = "w9-documents"
W9_TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "assets" / "irs-w9-2024.pdf"
W9_FORM_REVISION = "March 2024"
DEFAULT_EXPIRY_DAYS = 14
MAX_EXPIRY_DAYS = 30
MAX_SIGNATURE_BYTES = 750_000
MAX_PREFILL_DOCUMENTS = 20
MAX_PREFILL_DOCUMENT_CHARS = 100_000
PREFILL_TEXT_FILE_TYPES = {
    "pdf",
    "application/pdf",
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt",
    "text",
    "text/plain",
    "csv",
    "text/csv",
}

# A TIN is accepted from a case file only when it appears next to an explicit
# taxpayer-ID label. Bare nine-digit strings (case numbers, accounts, etc.) are
# deliberately ignored. This scanner is deterministic and never sends case-file
# content to an external model.
TAXPAYER_ID_PATTERN = re.compile(
    r"(?im)\b(?P<label>social\s+security(?:\s+number)?|ssn|employer\s+identification(?:\s+number)?|ein|taxpayer\s+identification(?:\s+number)?|tin)\b\s*(?:no\.?|number|#)?\s*[:#-]?\s*(?P<tin>\d{3}[- ]?\d{2}[- ]?\d{4}|\d{2}[- ]?\d{7}|\d{9})\b"
)
TAXPAYER_NAME_PATTERN = re.compile(
    r"(?im)^\s*(?:taxpayer\s+)?(?:full\s+|legal\s+)?name\s*[:\-]\s*(?P<name>[^\n]{2,160})$"
)

TAX_CLASSIFICATIONS = {
    "individual",
    "c_corporation",
    "s_corporation",
    "partnership",
    "trust_estate",
    "llc",
    "other",
}
LLC_CLASSIFICATIONS = {"C", "S", "P"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared

    return await _shared(authorization)


def _require_attorney(profile: dict) -> None:
    if profile.get("role") not in ("attorney", "staff_attorney"):
        raise HTTPException(status_code=403, detail="Attorney access required")


def _token() -> str:
    return secrets.token_urlsafe(32)


def _safe_filename(value: str) -> str:
    return Path(value or "form-w9.pdf").name.replace("\x00", "") or "form-w9.pdf"


def _cipher() -> Fernet:
    """Return the configured W-9 encryption cipher or fail closed.

    The key is intentionally separate from Supabase credentials. It must be set
    only in the Railway backend environment as a Fernet-compatible key.
    """
    raw_key = os.getenv("W9_ENCRYPTION_KEY", "").strip()
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Secure W-9 storage is not configured. Ask your attorney to configure W9_ENCRYPTION_KEY.",
        )
    try:
        return Fernet(raw_key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        logger.error("W-9 encryption key is invalid")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Secure W-9 storage is unavailable. Ask your attorney to review the encryption configuration.",
        ) from exc


def _encrypt_tin(tin: str) -> str:
    return _cipher().encrypt(tin.encode("utf-8")).decode("utf-8")


def _mask_tin(tin: str, tin_type: str) -> str:
    suffix = tin[-4:]
    return f"***-**-{suffix}" if tin_type == "ssn" else f"**-***{suffix}"


def _normalize_tin(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) != 9:
        raise ValueError("Enter a valid 9-digit Social Security Number or Employer Identification Number.")
    return digits


def _detect_tin_from_text(text: str) -> Optional[dict]:
    """Find one labeled SSN/EIN without retaining unrelated file content."""
    for match in TAXPAYER_ID_PATTERN.finditer(text[:MAX_PREFILL_DOCUMENT_CHARS]):
        label = match.group("label").lower()
        raw_tin = match.group("tin")
        digits = _normalize_tin(raw_tin)
        if not digits:
            continue
        if "social" in label or label == "ssn":
            tin_type = "ssn"
        elif "employer" in label or label == "ein":
            tin_type = "ein"
        elif re.fullmatch(r"\d{3}[- ]\d{2}[- ]\d{4}", raw_tin):
            tin_type = "ssn"
        elif re.fullmatch(r"\d{2}[- ]\d{7}", raw_tin):
            tin_type = "ein"
        else:
            # A generic TIN label plus unformatted digits is too ambiguous to
            # safely guess whether it is an SSN or an EIN.
            continue
        return {"tin": digits, "tin_type": tin_type}
    return None


def _detect_legal_name_from_text(text: str) -> Optional[str]:
    """Return a conservatively labeled taxpayer name, if present."""
    for match in TAXPAYER_NAME_PATTERN.finditer(text[:MAX_PREFILL_DOCUMENT_CHARS]):
        candidate = " ".join(match.group("name").strip().split())
        if 2 <= len(candidate) <= 160 and not any(marker in candidate.lower() for marker in ("http://", "https://", "@")):
            return candidate
    return None


def _case_file_prefill(supabase, case_id: Optional[str], client_id: Optional[str]) -> dict:
    """Collect minimal, non-logged prefill candidates from safe text files.

    Image documents are skipped deliberately: the existing image reader can use
    third-party vision extraction, while W-9 prefill must not transmit taxpayer
    identifiers outside LegalFlow merely to discover a candidate.
    """
    result = {"legal_name": None, "tin": None, "tin_type": None, "sources": {}}
    if client_id:
        profile_result = (
            supabase.table("profiles")
            .select("full_name,email")
            .eq("id", client_id)
            .limit(1)
            .execute()
        )
        if profile_result.data:
            profile = profile_result.data[0]
            legal_name = (profile.get("full_name") or "").strip()
            if legal_name:
                result["legal_name"] = legal_name
                result["sources"]["legal_name"] = {"kind": "client_profile"}
            result["signer_name"] = legal_name
            result["signer_email"] = (profile.get("email") or "").strip()

    if not case_id:
        return result

    documents = (
        supabase.table("case_documents")
        .select("file_name,file_type,storage_path")
        .eq("case_id", case_id)
        .order("created_at", desc=True)
        .limit(MAX_PREFILL_DOCUMENTS)
        .execute()
    )
    if not documents.data:
        return result

    from utils.document_reader import read_document

    for document in documents.data:
        file_type = (document.get("file_type") or "").lower().strip()
        if file_type not in PREFILL_TEXT_FILE_TYPES:
            continue
        try:
            text = read_document(document["storage_path"], file_type)
        except Exception:
            logger.warning("Unable to inspect a case file for W-9 prefill")
            continue
        if not text:
            continue
        file_name = _safe_filename(document.get("file_name") or "case file")
        if not result["legal_name"]:
            detected_name = _detect_legal_name_from_text(text)
            if detected_name:
                result["legal_name"] = detected_name
                result["sources"]["legal_name"] = {"kind": "case_file", "file_name": file_name}
        if not result["tin"]:
            detected_tin = _detect_tin_from_text(text)
            if detected_tin:
                result.update(detected_tin)
                result["sources"]["tin"] = {"kind": "case_file", "file_name": file_name}
        if result["legal_name"] and result["tin"]:
            break
    return result


def _get_w9_case(supabase, case_id: str) -> dict:
    result = supabase.table("cases").select("id,client_id").eq("id", case_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Related case not found.")
    return result.data[0]


def _audit_client_ip(request: Request) -> tuple[str, str]:
    """Capture IP for the LegalFlow audit record only, never the W-9 PDF."""
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


def _owned_w9_request(supabase, request_id: str, profile: dict) -> dict:
    """Return a W-9 request only when the authenticated attorney created it.

    The shared Supabase client uses the service role, which bypasses database
    row-level security. Ownership must therefore be enforced explicitly in every
    attorney-facing read or mutation.
    """
    response = (
        supabase.table("w9_requests")
        .select("*")
        .eq("id", request_id)
        .eq("sent_by", profile["id"])
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="W-9 request not found.")
    return response.data[0]


def _validate_token_session(supabase, token: str, allow_completed: bool = False) -> dict:
    response = supabase.table("w9_requests").select("*").eq("token", token).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="W-9 request not found.")
    record = response.data[0]
    if record.get("status") == "cancelled":
        raise HTTPException(status_code=410, detail="This W-9 request has been cancelled.")
    expires_at = record.get("expires_at")
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expiry <= _now() and record.get("status") != "complete":
                supabase.table("w9_requests").update({"status": "expired", "updated_at": _iso_now()}).eq("id", record["id"]).execute()
                raise HTTPException(status_code=410, detail="This W-9 request has expired.")
        except ValueError:
            logger.warning("Invalid W-9 expiry timestamp for request %s", record.get("id"))
    if not allow_completed and record.get("status") == "complete":
        raise HTTPException(status_code=400, detail="This W-9 has already been submitted.")
    return record


def _decode_signature(signature_data: str) -> bytes:
    try:
        encoded = signature_data.split(",", 1)[1] if "," in signature_data else signature_data
        payload = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Please provide a valid signature.") from exc
    if not payload or len(payload) > MAX_SIGNATURE_BYTES:
        raise HTTPException(status_code=400, detail="The signature image is invalid or too large.")
    return payload


def _fit_signature_image(signature_bytes: bytes, target_rect):
    """Trim blank canvas and fit an e-signature inside the official W-9 line."""
    import fitz
    from PIL import Image

    field_rect = fitz.Rect(target_rect)
    try:
        image = Image.open(io.BytesIO(signature_bytes)).convert("RGBA")
        alpha_aware = Image.new("L", image.size, 0)
        alpha_aware.putdata([
            255 if alpha > 16 and (red < 245 or green < 245 or blue < 245) else 0
            for red, green, blue, alpha in image.getdata()
        ])
        bounds = alpha_aware.getbbox()
        if bounds:
            left, top, right, bottom = bounds
            pad = max(3, round(min(image.size) * 0.04))
            image = image.crop((
                max(0, left - pad),
                max(0, top - pad),
                min(image.width, right + pad),
                min(image.height, bottom + pad),
            ))
        width, height = image.size
        available_width = max(20, field_rect.width - 12)
        available_height = max(12, field_rect.height - 5)
        scale = min(available_width / width, available_height / height)
        rendered_width, rendered_height = width * scale, height * scale
        rendered = fitz.Rect(
            field_rect.x0 + (field_rect.width - rendered_width) / 2,
            field_rect.y0 + (field_rect.height - rendered_height) / 2,
            field_rect.x0 + (field_rect.width + rendered_width) / 2,
            field_rect.y0 + (field_rect.height + rendered_height) / 2,
        )
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue(), rendered
    except Exception as exc:
        logger.warning("W-9 signature fitting failed; using full field: %s", exc)
        return signature_bytes, field_rect


def _draw_check(page, x: float, y: float) -> None:
    """Draw an X in a standard W-9 classification checkbox."""
    page.draw_line((x, y), (x + 7, y + 7), color=(0, 0, 0), width=0.9)
    page.draw_line((x + 7, y), (x, y + 7), color=(0, 0, 0), width=0.9)


def _insert_tin_digits(page, tin: str, tin_type: str) -> None:
    """Write each TIN digit into the official form's individual boxes."""
    if tin_type == "ssn":
        positions = [426, 437, 448, 464, 475, 493, 504, 515, 526]
        baseline = 395
    else:
        positions = [447, 458, 475, 486, 497, 508, 519, 530, 541]
        baseline = 429
    for digit, x in zip(tin, positions):
        page.insert_text((x, baseline), digit, fontname="cour", fontsize=9, color=(0, 0, 0))


def _render_official_w9(data: "W9Submission", signature_bytes: bytes) -> bytes:
    """Fill a private PDF copy of the official Form W-9 without audit metadata."""
    import fitz

    if not W9_TEMPLATE_PATH.exists():
        raise RuntimeError("The official Form W-9 template is not installed.")

    doc = fitz.open(W9_TEMPLATE_PATH)
    page = doc[0]
    font = "tiro"  # Times-Roman, visually aligned with the standard PDF's serif text.

    # Lines 1 and 2.
    page.insert_text((82, 121), data.legal_name, fontname=font, fontsize=9, color=(0, 0, 0))
    if data.business_name:
        page.insert_text((82, 145), data.business_name, fontname=font, fontsize=9, color=(0, 0, 0))

    checkbox_positions = {
        "individual": (78, 181),
        "c_corporation": (185, 181),
        "s_corporation": (257, 181),
        "partnership": (329, 181),
        "trust_estate": (394, 181),
        "llc": (78, 195),
        "other": (78, 232),
    }
    _draw_check(page, *checkbox_positions[data.tax_classification])
    if data.tax_classification == "llc":
        page.insert_text((246, 202), data.llc_tax_classification or "", fontname="helv", fontsize=9, color=(0, 0, 0))

    page.insert_text((82, 289), data.address_line1, fontname=font, fontsize=9, color=(0, 0, 0))
    if data.address_line2:
        page.insert_text((82, 301), data.address_line2, fontname=font, fontsize=8, color=(0, 0, 0))
    city_state_zip = ", ".join(part for part in [data.city, data.state] if part)
    city_state_zip = f"{city_state_zip} {data.zip_code}".strip()
    page.insert_text((82, 313), city_state_zip, fontname=font, fontsize=9, color=(0, 0, 0))

    _insert_tin_digits(page, data.tin_digits, data.tin_type)

    signature_image, signature_rect = _fit_signature_image(
        signature_bytes,
        fitz.Rect(150, 570, 360, 603),
    )
    page.insert_image(signature_rect, stream=signature_image, keep_proportion=True, overlay=True)
    page.insert_text((418, 603), _now().strftime("%m/%d/%Y"), fontname=font, fontsize=9, color=(0, 0, 0))

    return doc.tobytes(garbage=4, deflate=True)


def _link_w9_to_case(supabase, request_row: dict, storage_path: str, content: bytes) -> None:
    """Make the completed W-9 visible in the related case document list."""
    case_id = request_row.get("case_id")
    if not case_id:
        return
    try:
        existing = (
            supabase.table("case_documents")
            .select("id")
            .eq("case_id", case_id)
            .eq("storage_path", storage_path)
            .limit(1)
            .execute()
        )
        if existing.data:
            return
        supabase.table("case_documents").insert({
            "case_id": case_id,
            "file_name": "completed_form_w9.pdf",
            "file_type": "pdf",
            "file_size": len(content),
            "storage_path": storage_path,
            "document_category": "other",
            "uploaded_by": request_row.get("sent_by"),
        }).execute()
    except Exception:
        logger.exception("Completed W-9 was stored but could not be linked to case %s", case_id)


class W9CreateRequest(BaseModel):
    signer_name: str = Field(min_length=1, max_length=160)
    signer_email: EmailStr
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    prefilled_legal_name: Optional[str] = Field(default=None, max_length=160)
    prefilled_tin: Optional[str] = Field(default=None, max_length=32)
    prefilled_tin_type: Optional[Literal["ssn", "ein"]] = None
    use_detected_legal_name: bool = False
    use_detected_tin: bool = False
    title: str = Field(default="Form W-9 — Taxpayer Information and Certification", min_length=1, max_length=200)
    message: str = Field(
        default="Please complete and sign the requested Form W-9. Your taxpayer identification number is encrypted and retained only in LegalFlow's private records.",
        max_length=2000,
    )
    expires_in_days: int = Field(default=DEFAULT_EXPIRY_DAYS, ge=1, le=MAX_EXPIRY_DAYS)


class W9PublicSubmission(BaseModel):
    """Fields supplied by the token holder; name and TIN may be server-locked."""

    legal_name: Optional[str] = Field(default=None, max_length=160)
    business_name: Optional[str] = Field(default=None, max_length=160)
    tax_classification: Literal[
        "individual", "c_corporation", "s_corporation", "partnership", "trust_estate", "llc", "other"
    ]
    llc_tax_classification: Optional[Literal["C", "S", "P"]] = None
    address_line1: str = Field(min_length=1, max_length=160)
    address_line2: Optional[str] = Field(default=None, max_length=160)
    city: str = Field(min_length=1, max_length=80)
    state: str = Field(min_length=2, max_length=32)
    zip_code: str = Field(min_length=3, max_length=16)
    tin_type: Optional[Literal["ssn", "ein"]] = None
    tin: Optional[str] = Field(default=None, max_length=32)
    typed_name: str = Field(min_length=1, max_length=160)
    signature: str = Field(min_length=32)
    certification_accepted: bool

    @field_validator("tin")
    @classmethod
    def normalize_optional_tin(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_tin(value)

    @field_validator("business_name", "address_line2")
    @classmethod
    def empty_optional_text_is_none(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value and value.strip() else None


class W9Submission(BaseModel):
    legal_name: str = Field(min_length=1, max_length=160)
    business_name: Optional[str] = Field(default=None, max_length=160)
    tax_classification: Literal[
        "individual", "c_corporation", "s_corporation", "partnership", "trust_estate", "llc", "other"
    ]
    llc_tax_classification: Optional[Literal["C", "S", "P"]] = None
    address_line1: str = Field(min_length=1, max_length=160)
    address_line2: Optional[str] = Field(default=None, max_length=160)
    city: str = Field(min_length=1, max_length=80)
    state: str = Field(min_length=2, max_length=32)
    zip_code: str = Field(min_length=3, max_length=16)
    tin_type: Literal["ssn", "ein"]
    tin: str = Field(min_length=9, max_length=32)
    typed_name: str = Field(min_length=1, max_length=160)
    signature: str = Field(min_length=32)
    certification_accepted: bool

    @field_validator("tin")
    @classmethod
    def normalize_tin(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) != 9:
            raise ValueError("Enter a valid 9-digit Social Security Number or Employer Identification Number.")
        return digits

    @field_validator("business_name", "address_line2")
    @classmethod
    def empty_optional_text_is_none(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value and value.strip() else None

    def model_post_init(self, __context) -> None:
        if self.tax_classification == "llc" and self.llc_tax_classification not in LLC_CLASSIFICATIONS:
            raise ValueError("Choose C, S, or P for a limited liability company.")
        if self.tax_classification != "llc" and self.llc_tax_classification:
            raise ValueError("An LLC classification can only be selected for an LLC.")
        if not self.certification_accepted:
            raise ValueError("You must certify the Form W-9 before signing.")

    @property
    def tin_digits(self) -> str:
        return self.tin


def _resolve_w9_submission(request_row: dict, payload: W9PublicSubmission, cipher: Fernet) -> W9Submission:
    """Merge public fields with server-locked name/TIN before PDF generation."""
    legal_name = (request_row.get("prefilled_legal_name") or payload.legal_name or "").strip()
    if not legal_name:
        raise HTTPException(status_code=422, detail="Enter the name shown on the taxpayer's income tax return.")

    if request_row.get("prefilled_tin_ciphertext"):
        try:
            tin = cipher.decrypt(request_row["prefilled_tin_ciphertext"].encode("utf-8")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as exc:
            logger.error("Stored W-9 prefill could not be decrypted for request %s", request_row.get("id"))
            raise HTTPException(status_code=500, detail="The securely stored taxpayer ID could not be used.") from exc
        tin_type = request_row.get("prefilled_tin_type")
    else:
        tin = payload.tin
        tin_type = payload.tin_type

    if not tin or not tin_type:
        raise HTTPException(status_code=422, detail="Enter a 9-digit Social Security Number or Employer Identification Number.")

    try:
        return W9Submission(
            legal_name=legal_name,
            business_name=payload.business_name,
            tax_classification=payload.tax_classification,
            llc_tax_classification=payload.llc_tax_classification,
            address_line1=payload.address_line1,
            address_line2=payload.address_line2,
            city=payload.city,
            state=payload.state,
            zip_code=payload.zip_code,
            tin_type=tin_type,
            tin=tin,
            typed_name=payload.typed_name,
            signature=payload.signature,
            certification_accepted=payload.certification_accepted,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/attorney/prefill")
async def inspect_w9_prefill(
    case_id: str,
    authorization: str = Header(default=None),
):
    """Return only masked, attorney-safe prefill candidates for a related case."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    case = _get_w9_case(supabase, case_id)
    prefill = _case_file_prefill(supabase, case_id, case.get("client_id"))
    tin = prefill.pop("tin", None)
    return {
        "legal_name": prefill.get("legal_name"),
        "tin_available": bool(tin),
        "tin_type": prefill.get("tin_type") if tin else None,
        "tin_last4": tin[-4:] if tin else None,
        "sources": prefill.get("sources") or {},
        "signer_name": prefill.get("signer_name") or "",
        "signer_email": prefill.get("signer_email") or "",
    }


@router.post("/create")
async def create_w9_request(
    payload: W9CreateRequest,
    authorization: str = Header(default=None),
):
    """Create an attorney-authorized W-9 signing request and send a tokenized link."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    cipher = _cipher()  # Fail before an email is sent if sensitive storage is not configured.

    supabase = get_supabase()
    case_id = payload.case_id
    client_id = payload.client_id
    if case_id:
        related_case = _get_w9_case(supabase, case_id)
        client_id = related_case.get("client_id")

    detected = _case_file_prefill(supabase, case_id, client_id)
    manual_name = (payload.prefilled_legal_name or "").strip() or None
    manual_tin = _normalize_tin(payload.prefilled_tin)
    if manual_tin and not payload.prefilled_tin_type:
        raise HTTPException(status_code=422, detail="Choose whether the attorney-entered taxpayer ID is an SSN or EIN.")
    if payload.prefilled_tin_type and not manual_tin:
        raise HTTPException(status_code=422, detail="Enter the taxpayer ID before choosing its type.")
    if manual_tin and payload.use_detected_tin:
        raise HTTPException(status_code=422, detail="Choose either the detected taxpayer ID or a manual taxpayer ID, not both.")

    prefilled_legal_name = manual_name or (detected.get("legal_name") if payload.use_detected_legal_name else None)
    if manual_tin:
        prefilled_tin = manual_tin
        prefilled_tin_type = payload.prefilled_tin_type
        tin_source = {"kind": "manual_attorney_entry"}
    elif payload.use_detected_tin:
        prefilled_tin = detected.get("tin")
        prefilled_tin_type = detected.get("tin_type")
        tin_source = (detected.get("sources") or {}).get("tin")
        if not prefilled_tin or not prefilled_tin_type:
            raise HTTPException(status_code=422, detail="No labeled taxpayer ID was found in the selected case files. Enter it manually or leave it for the signer.")
    else:
        prefilled_tin = None
        prefilled_tin_type = None
        tin_source = None

    prefill_sources = {}
    if prefilled_legal_name:
        prefill_sources["legal_name"] = (
            {"kind": "manual_attorney_entry"}
            if manual_name
            else (detected.get("sources") or {}).get("legal_name", {"kind": "case_file"})
        )
    if tin_source:
        prefill_sources["tin"] = tin_source

    request_id = str(uuid.uuid4())
    token = _token()
    now = _now()
    expires_at = now + timedelta(days=payload.expires_in_days)
    record = {
        "id": request_id,
        "token": token,
        "title": payload.title,
        "signer_name": payload.signer_name,
        "signer_email": str(payload.signer_email),
        "case_id": case_id,
        "client_id": client_id,
        "sent_by": profile["id"],
        "attorney_name": profile.get("full_name", ""),
        "message": payload.message,
        "prefilled_legal_name": prefilled_legal_name,
        "prefilled_tin_ciphertext": cipher.encrypt(prefilled_tin.encode("utf-8")).decode("utf-8") if prefilled_tin else None,
        "prefilled_tin_type": prefilled_tin_type,
        "prefilled_tin_last4": prefilled_tin[-4:] if prefilled_tin else None,
        "prefill_sources": prefill_sources,
        "status": "awaiting_submission",
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    try:
        supabase.table("w9_requests").insert(record).execute()
    except Exception as exc:
        logger.exception("Could not create W-9 request")
        raise HTTPException(status_code=500, detail="Could not create the W-9 request.") from exc

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    signing_url = f"{frontend_url}/w9/{token}"
    try:
        from utils.email_service import send_email

        await send_email(
            to=str(payload.signer_email),
            subject=f"Action Required: {payload.title}",
            body=f"""
            <div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:560px;\">
              <h2 style=\"color:#1e40af;\">Form W-9 Requested</h2>
              <p>Hello {payload.signer_name},</p>
              <p>{payload.message}</p>
              <p>Your taxpayer identification number is encrypted in LegalFlow and will not be included in email or application logs.</p>
              <p><a href=\"{signing_url}\" style=\"background:#2563eb;color:#fff;padding:11px 20px;border-radius:7px;text-decoration:none;font-weight:600;display:inline-block;\">Complete Form W-9</a></p>
              <p style=\"font-size:12px;color:#64748b;\">This link expires on {expires_at.strftime('%B %d, %Y')}.</p>
            </div>
            """,
        )
    except Exception:
        logger.exception("W-9 request was created but the notification email could not be sent")

    return {
        "id": request_id,
        "status": "awaiting_submission",
        "expires_at": expires_at.isoformat(),
        "signing_url": signing_url,
    }


@router.get("/{token}")
async def get_public_w9_request(token: str):
    """Return only non-sensitive public request metadata for the token holder."""
    record = _validate_token_session(get_supabase(), token, allow_completed=True)
    return {
        "title": record["title"],
        "signer_name": record["signer_name"],
        "attorney_name": record.get("attorney_name") or "",
        "message": record.get("message") or "",
        "status": record["status"],
        "expires_at": record.get("expires_at"),
        "form_revision": W9_FORM_REVISION,
        "prefill": {
            "legal_name": record.get("prefilled_legal_name") or None,
            "legal_name_locked": bool(record.get("prefilled_legal_name")),
            "tin_locked": bool(record.get("prefilled_tin_ciphertext")),
            "tin_type": record.get("prefilled_tin_type") if record.get("prefilled_tin_ciphertext") else None,
            "tin_last4": record.get("prefilled_tin_last4") if record.get("prefilled_tin_ciphertext") else None,
        },
        "official_form_url": "https://www.irs.gov/pub/irs-pdf/fw9.pdf",
    }


@router.get("/{token}/template")
async def download_public_w9_template(token: str):
    """Serve the official blank form only after a valid W-9 token is presented."""
    _validate_token_session(get_supabase(), token, allow_completed=True)
    if not W9_TEMPLATE_PATH.exists():
        raise HTTPException(status_code=500, detail="The W-9 template is unavailable.")
    return Response(
        content=W9_TEMPLATE_PATH.read_bytes(),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=irs-form-w9.pdf"},
    )


@router.post("/{token}/complete")
async def complete_w9_request(token: str, payload: W9PublicSubmission, request: Request):
    """Render a signed W-9 using locked data when the attorney prefilled it."""
    supabase = get_supabase()
    request_row = _validate_token_session(supabase, token)
    cipher = _cipher()
    submission = _resolve_w9_submission(request_row, payload, cipher)
    signature_bytes = _decode_signature(submission.signature)

    # Generate the document before writing sensitive database values. No TIN is
    # logged, returned, or kept in server-side request state after this handler.
    try:
        completed_pdf = _render_official_w9(submission, signature_bytes)
    except Exception as exc:
        logger.exception("Could not render the completed official W-9")
        raise HTTPException(status_code=500, detail="Could not generate the completed Form W-9.") from exc

    submission_id = str(uuid.uuid4())
    storage_path = f"w9/{request_row['id']}/completed_form_w9.pdf"
    now = _iso_now()
    ip_address, ip_source = _audit_client_ip(request)
    encrypted_tin = cipher.encrypt(submission.tin_digits.encode("utf-8")).decode("utf-8")
    audit = {
        "submitted_at": now,
        "signer_ip": ip_address,
        "ip_source": ip_source,
        "user_agent": request.headers.get("user-agent", ""),
        "certification_accepted": True,
        "form_revision": W9_FORM_REVISION,
    }

    try:
        supabase.storage.from_(W9_STORAGE_BUCKET).upload(
            path=storage_path,
            file=completed_pdf,
            file_options={"content-type": "application/pdf", "upsert": "false"},
        )
    except Exception as exc:
        logger.exception("Could not store completed W-9 PDF")
        raise HTTPException(status_code=500, detail="Could not securely store the completed W-9.") from exc

    try:
        supabase.table("w9_submissions").insert({
            "id": submission_id,
            "request_id": request_row["id"],
            "legal_name": submission.legal_name,
            "business_name": submission.business_name,
            "tax_classification": submission.tax_classification,
            "llc_tax_classification": submission.llc_tax_classification,
            "address_line1": submission.address_line1,
            "address_line2": submission.address_line2,
            "city": submission.city,
            "state": submission.state,
            "zip_code": submission.zip_code,
            "tin_type": submission.tin_type,
            "tin_ciphertext": encrypted_tin,
            "tin_last4": submission.tin_digits[-4:],
            "completed_pdf_path": storage_path,
            "audit_trail": audit,
            "submitted_at": now,
            "created_at": now,
        }).execute()
        supabase.table("w9_requests").update({
            "status": "complete",
            "submitted_at": now,
            "updated_at": now,
        }).eq("id", request_row["id"]).execute()
    except Exception as exc:
        logger.exception("W-9 metadata persistence failed after PDF storage")
        try:
            supabase.storage.from_(W9_STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Could not remove orphaned W-9 file after metadata failure")
        raise HTTPException(status_code=500, detail="Could not save the W-9 submission.") from exc

    _link_w9_to_case(supabase, request_row, storage_path, completed_pdf)

    try:
        from utils.email_service import send_email

        attorney = (
            supabase.table("profiles")
            .select("email, full_name")
            .eq("id", request_row["sent_by"])
            .limit(1)
            .execute()
        )
        if attorney.data:
            frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")
            await send_email(
                to=attorney.data[0]["email"],
                subject=f"Completed W-9: {submission.legal_name}",
                body=f"""
                <div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;\">
                  <h2 style=\"color:#059669;\">Form W-9 Completed</h2>
                  <p>{submission.legal_name} completed the requested Form W-9.</p>
                  <p>The completed document is available only in LegalFlow's protected W-9 records.</p>
                  <p><a href=\"{frontend_url}/attorney/w9\">View W-9 Records</a></p>
                </div>
                """,
            )
    except Exception:
        logger.exception("W-9 was completed but attorney notification could not be sent")

    return {"status": "complete", "message": "Your Form W-9 has been securely submitted."}


@router.get("/attorney/requests")
async def list_w9_requests(authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    response = (
        get_supabase().table("w9_requests")
        .select("id,title,signer_name,signer_email,case_id,client_id,status,expires_at,submitted_at,created_at")
        .eq("sent_by", profile["id"])
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return response.data or []


@router.get("/attorney/requests/{request_id}")
async def get_w9_request_detail(request_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    row = _owned_w9_request(supabase, request_id, profile)
    submission_result = (
        supabase.table("w9_submissions")
        .select("id,legal_name,business_name,tax_classification,llc_tax_classification,address_line1,address_line2,city,state,zip_code,tin_type,tin_last4,completed_pdf_path,audit_trail,submitted_at")
        .eq("request_id", request_id)
        .limit(1)
        .execute()
    )
    row["submission"] = submission_result.data[0] if submission_result.data else None
    row.pop("token", None)
    row.pop("prefilled_tin_ciphertext", None)
    return row


@router.get("/attorney/requests/{request_id}/download")
async def download_completed_w9(request_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    _owned_w9_request(supabase, request_id, profile)
    result = (
        supabase.table("w9_submissions")
        .select("completed_pdf_path,legal_name")
        .eq("request_id", request_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="A completed W-9 is not available for this request.")
    submission = result.data[0]
    try:
        pdf = supabase.storage.from_(W9_STORAGE_BUCKET).download(submission["completed_pdf_path"])
    except Exception as exc:
        logger.exception("Could not retrieve completed W-9")
        raise HTTPException(status_code=500, detail="Could not retrieve the completed W-9.") from exc
    filename = _safe_filename(f"W-9_{submission.get('legal_name') or 'completed'}.pdf")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/attorney/requests/{request_id}/cancel")
async def cancel_w9_request(request_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)
    supabase = get_supabase()
    row = _owned_w9_request(supabase, request_id, profile)
    if row["status"] == "complete":
        raise HTTPException(status_code=400, detail="Completed W-9 requests cannot be cancelled.")
    supabase.table("w9_requests").update({
        "status": "cancelled",
        "updated_at": _iso_now(),
    }).eq("id", request_id).execute()
    return {"status": "cancelled"}
