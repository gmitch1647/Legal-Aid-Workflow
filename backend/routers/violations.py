"""
Violation Patterns router — structured database of actionable violations
under FCRA, FDCPA, TCPA, and Georgia FBPA.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from utils.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_current_user(authorization: str) -> dict:
    from routers.cases import get_current_user as _shared
    return await _shared(authorization)


def _require_attorney(profile: dict):
    if profile.get("role") != "attorney":
        raise HTTPException(status_code=403, detail="Attorney access required")


# ---------------------------------------------------------------------------
# GET / — search/list violation patterns
# ---------------------------------------------------------------------------

@router.get("")
async def list_violations(
    statute: Optional[str] = None,
    defendant_type: Optional[str] = None,
    search: Optional[str] = None,
    authorization: str = Header(default=None),
):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    query = supabase.table("violation_patterns").select("*").order("statute").order("section")

    if statute:
        query = query.eq("statute", statute)
    if defendant_type:
        query = query.eq("defendant_type", defendant_type)

    resp = query.limit(200).execute()
    results = resp.data or []

    if search:
        term = search.lower()
        results = [
            r for r in results
            if term in r.get("short_name", "").lower()
            or term in r.get("description", "").lower()
            or term in r.get("section", "").lower()
            or any(term in t.lower() for t in (r.get("tags") or []))
        ]

    return results


# ---------------------------------------------------------------------------
# GET /{id} — get a specific violation pattern
# ---------------------------------------------------------------------------

@router.get("/{violation_id}")
async def get_violation(violation_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    resp = supabase.table("violation_patterns").select("*").eq("id", violation_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Violation pattern not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# POST / — create a new violation pattern
# ---------------------------------------------------------------------------

class ViolationCreate(BaseModel):
    statute: str
    section: str
    short_name: str
    description: str
    defendant_type: str = "any"
    elements: list = []
    common_evidence: list = []
    defenses: list = []
    damages_statutory: Optional[str] = None
    damages_actual: Optional[str] = None
    damages_punitive: Optional[str] = None
    attorney_fees: bool = True
    scienter: Optional[str] = None
    sol_years: Optional[float] = None
    sol_notes: Optional[str] = None
    case_citations: list = []
    practice_tips: list = []
    related_sections: list = []
    tags: list = []


@router.post("")
async def create_violation(payload: ViolationCreate, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    record = payload.model_dump()
    record["created_at"] = datetime.now(timezone.utc).isoformat()
    record["updated_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("violation_patterns").insert(record).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create violation pattern")
    return resp.data[0]


# ---------------------------------------------------------------------------
# PATCH /{id} — update a violation pattern
# ---------------------------------------------------------------------------

@router.patch("/{violation_id}")
async def update_violation(violation_id: str, payload: ViolationCreate, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    updates = payload.model_dump()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("violation_patterns").update(updates).eq("id", violation_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------

@router.delete("/{violation_id}")
async def delete_violation(violation_id: str, authorization: str = Header(default=None)):
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()
    supabase.table("violation_patterns").delete().eq("id", violation_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# POST /seed — populate with comprehensive violation patterns
# ---------------------------------------------------------------------------

@router.post("/seed")
async def seed_violations(authorization: str = Header(default=None)):
    """Populate the violation patterns table with comprehensive FCRA/FDCPA/TCPA violations."""
    profile = await _get_current_user(authorization)
    _require_attorney(profile)

    supabase = get_supabase()

    # Check if already seeded
    existing = supabase.table("violation_patterns").select("id", count="exact").limit(1).execute()
    if existing.count and existing.count > 10:
        return {"status": "already_seeded", "count": existing.count}

    patterns = _get_seed_data()
    inserted = 0
    for p in patterns:
        try:
            supabase.table("violation_patterns").insert(p).execute()
            inserted += 1
        except Exception as e:
            logger.warning(f"Failed to insert violation pattern: {e}")

    return {"status": "seeded", "count": inserted}


def _get_seed_data() -> list:
    """Return comprehensive violation pattern seed data."""
    now = datetime.now(timezone.utc).isoformat()

    return [
        # ═══════════════════════════════════════════════════════════════════
        # FCRA — CRA VIOLATIONS
        # ═══════════════════════════════════════════════════════════════════
        {
            "statute": "FCRA",
            "section": "1681e(b)",
            "short_name": "Failure to Follow Reasonable Procedures for Maximum Accuracy",
            "description": "A CRA must follow reasonable procedures to assure maximum possible accuracy of consumer report information. Liability arises when inaccurate information is reported and the CRA's procedures were not reasonable.",
            "defendant_type": "CRA",
            "elements": [
                "Inaccurate information in consumer report",
                "CRA reported or maintained the inaccuracy",
                "CRA failed to follow reasonable procedures to assure maximum accuracy",
                "Consumer suffered damages"
            ],
            "common_evidence": [
                "Credit report showing inaccuracy",
                "Prior dispute letters/communications",
                "Evidence of what accurate information should be",
                "CRA's failure to cross-reference or verify data",
                "Pattern of similar errors by same CRA"
            ],
            "defenses": [
                "Procedures were reasonable under the circumstances",
                "Information came from a source reasonably believed reliable",
                "No actual inaccuracy exists",
                "Inaccuracy is not material"
            ],
            "damages_statutory": "$100-$1,000 per consumer (willful); actual damages (negligent)",
            "damages_actual": "Lost credit, denial of credit, emotional distress, time spent disputing",
            "damages_punitive": "Available for willful violations — no cap",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery of violation; 5 years max from date violation occurred",
            "case_citations": [
                {"case": "Cahlin v. General Motors Acceptance Corp.", "cite": "936 F.2d 1151 (11th Cir. 1991)", "holding": "CRA must follow reasonable procedures; mere reliance on furnisher data is insufficient", "court": "11th Cir.", "year": 1991},
                {"case": "Losch v. Nationstar Mortgage LLC", "cite": "995 F.3d 937 (11th Cir. 2021)", "holding": "Reasonableness of procedures is normally a jury question", "court": "11th Cir.", "year": 2021}
            ],
            "practice_tips": [
                "Allege specific procedures CRA should have followed but didn't",
                "Show the inaccuracy was detectable with reasonable procedures",
                "Multiple disputes strengthen the willfulness argument",
                "Get the CRA's policies/procedures manual in discovery"
            ],
            "related_sections": ["1681i(a)", "1681g"],
            "tags": ["accuracy", "procedures", "CRA", "inaccurate reporting"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FCRA",
            "section": "1681i(a)(1)(A)",
            "short_name": "Failure to Conduct Reasonable Reinvestigation",
            "description": "Upon receiving a consumer dispute, a CRA must conduct a reasonable reinvestigation to determine whether disputed information is inaccurate and record the current status. Must complete within 30 days (45 with additional info).",
            "defendant_type": "CRA",
            "elements": [
                "Consumer disputed information with CRA",
                "CRA received the dispute",
                "CRA failed to conduct a reasonable reinvestigation",
                "Information was in fact inaccurate or incomplete",
                "Consumer suffered damages"
            ],
            "common_evidence": [
                "Dispute letters (certified mail receipts)",
                "CRA response letters (or lack thereof)",
                "Evidence dispute was forwarded to furnisher without meaningful review",
                "Boilerplate/form responses indicating no real investigation",
                "Information remained unchanged after dispute"
            ],
            "defenses": [
                "Reinvestigation was reasonable under the circumstances",
                "Dispute was frivolous or irrelevant (§1681i(a)(3))",
                "Information was verified as accurate",
                "Consumer did not provide sufficient information to investigate"
            ],
            "damages_statutory": "$100-$1,000 per consumer (willful)",
            "damages_actual": "Continued reporting of inaccurate info, credit denials, emotional distress",
            "damages_punitive": "Available for willful violations",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery; 5 years max",
            "case_citations": [
                {"case": "Stevenson v. TRW Inc.", "cite": "987 F.2d 288 (5th Cir. 1993)", "holding": "Parroting furnisher's response without independent evaluation is not reasonable", "court": "5th Cir.", "year": 1993},
                {"case": "Cushman v. Trans Union Corp.", "cite": "115 F.3d 220 (3d Cir. 1997)", "holding": "CRA cannot rely solely on automated verification system", "court": "3d Cir.", "year": 1997}
            ],
            "practice_tips": [
                "Document every dispute with certified mail",
                "Note if CRA only forwarded e-OSCAR ACDV without meaningful review",
                "Request CRA's reinvestigation file in discovery",
                "Multiple disputes showing same result = willfulness pattern"
            ],
            "related_sections": ["1681e(b)", "1681i(a)(2)(A)", "1681i(a)(4)", "1681i(a)(5)(A)"],
            "tags": ["dispute", "reinvestigation", "CRA", "30 days"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FCRA",
            "section": "1681i(a)(5)(A)",
            "short_name": "Failure to Delete Inaccurate Information After Reinvestigation",
            "description": "If information is found to be inaccurate or unverifiable after reinvestigation, CRA must promptly delete or modify the item.",
            "defendant_type": "CRA",
            "elements": [
                "Consumer disputed information",
                "CRA conducted reinvestigation",
                "Information found inaccurate or could not be verified",
                "CRA failed to promptly delete or modify the item"
            ],
            "common_evidence": [
                "CRA letter acknowledging dispute",
                "Subsequent credit reports still showing inaccurate info",
                "Timeline showing delay between finding and deletion"
            ],
            "defenses": [
                "Information was verified as accurate",
                "Deletion/modification was prompt",
                "Consumer's characterization of 'inaccurate' is disputed"
            ],
            "damages_statutory": "$100-$1,000 (willful)",
            "damages_actual": "Continued inaccurate reporting, credit harm",
            "damages_punitive": "Available for willful violations",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery; 5 years max",
            "case_citations": [],
            "practice_tips": [
                "Pull credit reports at intervals to show continued reporting after dispute",
                "Compare pre-dispute and post-dispute reports"
            ],
            "related_sections": ["1681i(a)(1)(A)", "1681i(a)(5)(B)"],
            "tags": ["deletion", "reinvestigation", "CRA"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FCRA",
            "section": "1681i(a)(5)(B)",
            "short_name": "Reinsertion Without Notice or Certification",
            "description": "If deleted information is reinserted, CRA must: (i) certify person who furnished info has been verified, (ii) notify consumer within 5 business days with furnisher contact info, (iii) not reinsert unless furnisher certifies accuracy.",
            "defendant_type": "CRA",
            "elements": [
                "Information was previously deleted after dispute",
                "CRA reinserted the information",
                "CRA failed to certify, notify consumer, or obtain furnisher certification"
            ],
            "common_evidence": [
                "Prior deletion confirmation letter",
                "Subsequent report showing reinserted item",
                "Absence of 5-day reinsertion notice"
            ],
            "defenses": [
                "Proper certification was obtained",
                "Consumer was notified within 5 business days",
                "Information was not actually 'reinserted' (was a different item)"
            ],
            "damages_statutory": "$100-$1,000 (willful)",
            "damages_actual": "Surprise reappearance on report, credit harm, emotional distress",
            "damages_punitive": "Available — reinsertion without notice is often found willful",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery",
            "case_citations": [],
            "practice_tips": [
                "Strong claim — reinsertion without notice is almost per se willful",
                "Check for 5-day notice — most CRAs fail this",
                "Get deletion confirmation letter as Exhibit A"
            ],
            "related_sections": ["1681i(a)(5)(A)", "1681i(a)(5)(C)"],
            "tags": ["reinsertion", "deletion", "notice", "CRA"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FCRA",
            "section": "1681g",
            "short_name": "Failure to Provide File Disclosure",
            "description": "Upon request, CRA must clearly and accurately disclose all information in consumer's file, sources of information, and recipients of reports within prior 2 years.",
            "defendant_type": "CRA",
            "elements": [
                "Consumer requested file disclosure",
                "CRA failed to provide complete/accurate disclosure",
                "Or failed to disclose sources/recipients"
            ],
            "common_evidence": [
                "Request letter with proof of identity",
                "Incomplete disclosure received",
                "Evidence of accounts/inquiries not disclosed"
            ],
            "defenses": [
                "Full disclosure was provided",
                "Consumer did not properly identify themselves",
                "Requested information is exempt from disclosure"
            ],
            "damages_statutory": "$100-$1,000 (willful)",
            "damages_actual": "Inability to identify and dispute inaccuracies",
            "damages_punitive": "Available",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery",
            "case_citations": [],
            "practice_tips": [
                "Compare disclosure with actual credit report pulled by lender",
                "Look for missing soft inquiries or accounts"
            ],
            "related_sections": ["1681h"],
            "tags": ["disclosure", "file", "CRA"],
            "created_at": now, "updated_at": now,
        },
        # ═══════════════════════════════════════════════════════════════════
        # FCRA — FURNISHER VIOLATIONS
        # ═══════════════════════════════════════════════════════════════════
        {
            "statute": "FCRA",
            "section": "1681s-2(b)",
            "short_name": "Failure to Investigate After CRA Notice",
            "description": "After receiving notice from a CRA that a consumer disputes information, the furnisher must: conduct an investigation, review all relevant information from CRA, report results to CRA, and if incomplete/inaccurate, report those results to all CRAs.",
            "defendant_type": "furnisher",
            "elements": [
                "Consumer disputed with CRA (not directly with furnisher)",
                "CRA notified the furnisher of the dispute",
                "Furnisher failed to conduct reasonable investigation",
                "Or failed to review relevant information provided",
                "Or failed to report results/corrections to CRAs",
                "Information was in fact inaccurate"
            ],
            "common_evidence": [
                "CRA dispute confirmation showing forwarding to furnisher",
                "Furnisher's continued reporting of same inaccurate data",
                "ACDV/e-OSCAR records (obtain in discovery)",
                "Furnisher's investigation file (or lack thereof)",
                "Evidence furnisher simply verified without reviewing docs"
            ],
            "defenses": [
                "Investigation was reasonable",
                "Information was verified as accurate",
                "Never received notice from CRA",
                "Consumer did not dispute through CRA (§1681s-2(a) only)"
            ],
            "damages_statutory": "$100-$1,000 (willful)",
            "damages_actual": "Continued inaccurate reporting, credit denials",
            "damages_punitive": "Available for willful violations",
            "attorney_fees": True,
            "scienter": "willful or negligent",
            "sol_years": 2,
            "sol_notes": "2 years from discovery; 5 years max. IMPORTANT: No private right of action under §1681s-2(a) — must go through CRA dispute first to trigger (b) duties.",
            "case_citations": [
                {"case": "Saunders v. Branch Banking & Trust Co.", "cite": "526 F.3d 142 (4th Cir. 2008)", "holding": "Furnisher must go beyond mere verification and conduct meaningful investigation", "court": "4th Cir.", "year": 2008}
            ],
            "practice_tips": [
                "NEVER plead §1681s-2(a) — no private right of action",
                "Must show consumer disputed with CRA first (trigger for (b) duties)",
                "Discovery: request furnisher's investigation procedures and ACDV responses",
                "Ask interrogatories about what 'investigation' entailed",
                "Pattern of rubber-stamping verifications = willfulness"
            ],
            "related_sections": ["1681i(a)(2)(A)"],
            "tags": ["furnisher", "investigation", "dispute", "ACDV"],
            "created_at": now, "updated_at": now,
        },
        # ═══════════════════════════════════════════════════════════════════
        # FDCPA VIOLATIONS
        # ═══════════════════════════════════════════════════════════════════
        {
            "statute": "FDCPA",
            "section": "1692e",
            "short_name": "False or Misleading Representations",
            "description": "A debt collector may not use any false, deceptive, or misleading representation in connection with the collection of any debt. Includes 16 specific prohibited representations plus a catch-all.",
            "defendant_type": "debt_collector",
            "elements": [
                "Defendant is a 'debt collector' under §1692a(6)",
                "Communication was in connection with collection of a 'debt'",
                "Communication contained false, deceptive, or misleading representation",
                "The least sophisticated consumer would be deceived"
            ],
            "common_evidence": [
                "Collection letters/communications",
                "False amount owed (wrong balance, unauthorized fees)",
                "Misrepresentation of legal status of debt",
                "False threats of legal action",
                "False claims of attorney involvement",
                "Misleading implication of credit reporting consequences"
            ],
            "defenses": [
                "Not a 'debt collector' (creditor collecting own debt)",
                "Communication was not misleading to least sophisticated consumer",
                "Bona fide error defense (§1692k(c))",
                "Statement was not 'in connection with' debt collection"
            ],
            "damages_statutory": "Up to $1,000 per action (not per violation)",
            "damages_actual": "Emotional distress, payments made on invalid debt",
            "damages_punitive": "Not available under FDCPA (statutory damages serve this function)",
            "attorney_fees": True,
            "scienter": "strict (no intent required)",
            "sol_years": 1,
            "sol_notes": "1 year from date of violation. Short SOL — file quickly!",
            "case_citations": [
                {"case": "Jeter v. Credit Bureau, Inc.", "cite": "760 F.2d 1168 (11th Cir. 1985)", "holding": "Least sophisticated consumer standard applies in 11th Circuit", "court": "11th Cir.", "year": 1985},
                {"case": "LeBlanc v. Unifin Inc.", "cite": "601 F.3d 1185 (11th Cir. 2010)", "holding": "Whether communication is misleading is determined from perspective of least sophisticated consumer", "court": "11th Cir.", "year": 2010}
            ],
            "practice_tips": [
                "Save ALL communications — letters, voicemails, texts",
                "1-year SOL is short — identify violations early",
                "§1692e violations are strict liability — no intent needed",
                "Common sub-sections: (2)(A) false amount, (5) threats, (10) deceptive forms",
                "Can combine with §1692f (unfair practices) claims from same conduct"
            ],
            "related_sections": ["1692f", "1692g"],
            "tags": ["false", "misleading", "deceptive", "debt collector", "collection letter"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FDCPA",
            "section": "1692g",
            "short_name": "Failure to Validate Debt / Validation Notice",
            "description": "Within 5 days of initial communication, debt collector must send written notice containing: amount of debt, name of creditor, statement that debt will be assumed valid unless disputed within 30 days, offer to provide verification, and statement that original creditor name will be provided if requested.",
            "defendant_type": "debt_collector",
            "elements": [
                "Defendant is a 'debt collector'",
                "Initial communication with consumer occurred",
                "Debt collector failed to send required validation notice within 5 days",
                "Or notice was deficient (missing required elements)",
                "Or debt collector failed to cease collection and verify after timely dispute"
            ],
            "common_evidence": [
                "Initial collection letter (check for all 5 required elements)",
                "Timeline showing no notice within 5 days of first contact",
                "Consumer's timely written dispute (within 30 days)",
                "Continued collection activity after dispute without verification",
                "Overshadowing language that contradicts validation rights"
            ],
            "defenses": [
                "Notice was sent within 5 days",
                "All required elements were included",
                "Consumer's dispute was not timely (after 30 days)",
                "Bona fide error"
            ],
            "damages_statutory": "Up to $1,000",
            "damages_actual": "Payments made without validation, emotional distress",
            "damages_punitive": "Not available under FDCPA",
            "attorney_fees": True,
            "scienter": "strict",
            "sol_years": 1,
            "sol_notes": "1 year from violation",
            "case_citations": [
                {"case": "Sims v. GC Services, L.P.", "cite": "445 F.3d 959 (7th Cir. 2006)", "holding": "Initial letter must contain all §1692g disclosures or be followed by separate notice within 5 days", "court": "7th Cir.", "year": 2006}
            ],
            "practice_tips": [
                "Check EVERY initial letter for all 5 required elements",
                "Overshadowing: does any language contradict the 30-day dispute right?",
                "If client disputed in writing within 30 days and collector kept collecting = violation",
                "Missing 'original creditor' offer is a common deficiency"
            ],
            "related_sections": ["1692e", "1692c(c)"],
            "tags": ["validation", "notice", "30 days", "initial communication", "debt collector"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FDCPA",
            "section": "1692c(c)",
            "short_name": "Failure to Cease Communication After Written Request",
            "description": "If consumer notifies debt collector in writing to cease communication, collector must cease except to: advise of termination of efforts, notify of specific remedies it intends to invoke, or notify that it is invoking a specific remedy.",
            "defendant_type": "debt_collector",
            "elements": [
                "Consumer sent written cease communication notice",
                "Debt collector received the notice",
                "Debt collector continued communicating outside the 3 permitted exceptions"
            ],
            "common_evidence": [
                "Consumer's cease and desist letter (certified mail receipt)",
                "Subsequent communications from collector (calls, letters, texts)",
                "Call logs showing continued calls after receipt",
                "None of the 3 exceptions apply to the continued communication"
            ],
            "defenses": [
                "Never received the written notice",
                "Communication falls under one of the 3 exceptions",
                "Communication was not 'in connection with' debt collection"
            ],
            "damages_statutory": "Up to $1,000",
            "damages_actual": "Harassment, emotional distress, invasion of privacy",
            "damages_punitive": "Not available under FDCPA",
            "attorney_fees": True,
            "scienter": "strict",
            "sol_years": 1,
            "sol_notes": "1 year from each violating communication",
            "case_citations": [],
            "practice_tips": [
                "Always send cease letters via certified mail with return receipt",
                "Each communication after receipt is a separate violation",
                "Save voicemails and texts as evidence",
                "Can combine with §1692d (harassment) if calls are excessive"
            ],
            "related_sections": ["1692d", "1692e"],
            "tags": ["cease", "communication", "harassment", "debt collector"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "FDCPA",
            "section": "1692f",
            "short_name": "Unfair or Unconscionable Practices",
            "description": "Prohibits use of unfair or unconscionable means to collect debt. Includes collecting unauthorized amounts, depositing post-dated checks early, threatening repossession without right, and using deceptive means to collect.",
            "defendant_type": "debt_collector",
            "elements": [
                "Defendant is a debt collector",
                "Engaged in unfair or unconscionable conduct",
                "In connection with debt collection"
            ],
            "common_evidence": [
                "Collection of unauthorized fees, interest, or charges not in original agreement",
                "Threats to take property without legal right",
                "Depositing post-dated check before date",
                "Communication designed to appear as court process"
            ],
            "defenses": [
                "Amount collected was authorized by agreement or law",
                "Conduct was not 'unfair' under applicable standard",
                "Bona fide error"
            ],
            "damages_statutory": "Up to $1,000",
            "damages_actual": "Overpayments, emotional distress",
            "damages_punitive": "Not available",
            "attorney_fees": True,
            "scienter": "strict",
            "sol_years": 1,
            "sol_notes": "1 year from violation",
            "case_citations": [],
            "practice_tips": [
                "Compare amount demanded to original contract — any unauthorized additions?",
                "Check if interest/fees are permitted by underlying agreement and state law",
                "§1692f(1) — collecting amounts not authorized by agreement is most common"
            ],
            "related_sections": ["1692e"],
            "tags": ["unfair", "unconscionable", "unauthorized fees", "debt collector"],
            "created_at": now, "updated_at": now,
        },
        # ═══════════════════════════════════════════════════════════════════
        # TCPA VIOLATIONS
        # ═══════════════════════════════════════════════════════════════════
        {
            "statute": "TCPA",
            "section": "227(b)(1)(A)(iii)",
            "short_name": "Autodialer Calls to Cell Phone Without Consent",
            "description": "Prohibits making calls using an automatic telephone dialing system (ATDS) or prerecorded/artificial voice to a cell phone without prior express consent of the called party.",
            "defendant_type": "caller",
            "elements": [
                "Defendant made or initiated a telephone call",
                "Call was to a cellular telephone number",
                "Call was made using an ATDS or prerecorded/artificial voice",
                "Defendant did not have prior express consent of the called party"
            ],
            "common_evidence": [
                "Phone records/call logs showing calls received",
                "Evidence of automated system (simultaneous calls, click/pause before agent, prerecorded messages)",
                "Lack of signed consent form or recorded verbal consent",
                "Evidence consent was revoked prior to calls",
                "Reassigned number (consent from prior subscriber doesn't carry over)"
            ],
            "defenses": [
                "Had prior express consent (written for marketing, oral for informational)",
                "System used does not qualify as ATDS under current law",
                "Called party provided the number",
                "Emergency purpose exception",
                "Not an ATDS — required human intervention"
            ],
            "damages_statutory": "$500 per violation (per call/text); $1,500 if willful/knowing",
            "damages_actual": "Generally statutory damages are primary recovery",
            "damages_punitive": "Treble damages ($1,500) for willful/knowing violations",
            "attorney_fees": True,
            "scienter": "strict (but treble damages require willful/knowing)",
            "sol_years": 4,
            "sol_notes": "4 years (federal catch-all SOL). Some circuits apply state SOL instead.",
            "case_citations": [
                {"case": "Facebook v. Duguid", "cite": "141 S. Ct. 1163 (2021)", "holding": "ATDS requires device that can generate random/sequential numbers and dial them — not just stored number dialing", "court": "S.Ct.", "year": 2021}
            ],
            "practice_tips": [
                "Post-Duguid: must show device generates OR stores numbers AND dials them (narrower ATDS definition)",
                "Prerecorded voice claims still viable regardless of Duguid",
                "Each call/text = separate violation = $500-$1,500",
                "Look for patterns: calls at same time daily, click-pause, multiple calls in sequence",
                "Consent revocation can be made by any reasonable means"
            ],
            "related_sections": ["227(b)(1)(B)", "227(c)"],
            "tags": ["autodialer", "ATDS", "cell phone", "consent", "robocall"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "TCPA",
            "section": "227(b)(1)(B)",
            "short_name": "Prerecorded Voice to Residential Line Without Consent",
            "description": "Prohibits initiating a call to a residential telephone line using a prerecorded or artificial voice to deliver a message without prior express consent.",
            "defendant_type": "caller",
            "elements": [
                "Defendant initiated a call",
                "To a residential telephone line",
                "Using a prerecorded or artificial voice",
                "Without prior express consent"
            ],
            "common_evidence": [
                "Voicemail recordings showing prerecorded message",
                "Phone records showing calls to landline",
                "Lack of consent documentation"
            ],
            "defenses": [
                "Had prior express consent",
                "Call was for emergency purpose",
                "Message was purely informational from party with existing relationship",
                "Not actually a prerecorded voice"
            ],
            "damages_statutory": "$500 per call; $1,500 if willful",
            "damages_actual": "Invasion of privacy, annoyance",
            "damages_punitive": "Treble damages for willful",
            "attorney_fees": True,
            "scienter": "strict",
            "sol_years": 4,
            "sol_notes": "4 years federal catch-all",
            "case_citations": [],
            "practice_tips": [
                "Save ALL voicemails — they are the evidence",
                "This section covers landlines; §227(b)(1)(A)(iii) covers cell phones",
                "Does not require ATDS — just prerecorded voice"
            ],
            "related_sections": ["227(b)(1)(A)(iii)"],
            "tags": ["prerecorded", "residential", "robocall", "landline"],
            "created_at": now, "updated_at": now,
        },
        {
            "statute": "TCPA",
            "section": "227(c)",
            "short_name": "Do-Not-Call Violations",
            "description": "Prohibits calls to numbers on the National Do Not Call Registry or the caller's internal do-not-call list. Implemented through 47 C.F.R. § 64.1200.",
            "defendant_type": "caller",
            "elements": [
                "Consumer's number on National DNC Registry or consumer requested to be on internal list",
                "Defendant made telemarketing call to that number",
                "No established business relationship exception applies",
                "Call was made more than 30 days after number added to registry (or after EBR expired)"
            ],
            "common_evidence": [
                "DNC Registry search showing registration date",
                "Call logs showing telemarketing calls after registration",
                "Internal DNC request documentation",
                "Pattern of multiple calls over time"
            ],
            "defenses": [
                "Established business relationship (inquiry within 3 months or transaction within 18 months)",
                "Written express consent",
                "Call was not for telemarketing purposes",
                "Number not on registry at time of call"
            ],
            "damages_statutory": "$500 per call; $1,500 if willful",
            "damages_actual": "Invasion of privacy, harassment",
            "damages_punitive": "Treble for willful",
            "attorney_fees": True,
            "scienter": "strict",
            "sol_years": 4,
            "sol_notes": "4 years from violation",
            "case_citations": [],
            "practice_tips": [
                "Check DNC registration date at donotcall.gov",
                "EBR expires 18 months after last transaction or 3 months after last inquiry",
                "Each call after DNC registration = separate $500-$1,500 violation",
                "Need pattern of calls for private right of action under some circuits"
            ],
            "related_sections": ["227(b)(1)(A)(iii)", "227(b)(1)(B)"],
            "tags": ["DNC", "do not call", "telemarketing", "registry"],
            "created_at": now, "updated_at": now,
        },
        # ═══════════════════════════════════════════════════════════════════
        # GEORGIA FBPA
        # ═══════════════════════════════════════════════════════════════════
        {
            "statute": "GA_FBPA",
            "section": "10-1-393(a)",
            "short_name": "Unfair or Deceptive Acts in Consumer Transactions",
            "description": "Prohibits unfair or deceptive acts or practices in the conduct of consumer transactions. Provides for treble damages, attorney fees, and injunctive relief.",
            "defendant_type": "any",
            "elements": [
                "Consumer transaction occurred",
                "Defendant engaged in unfair or deceptive act or practice",
                "Act was in the conduct of consumer commerce",
                "Consumer suffered injury"
            ],
            "common_evidence": [
                "Evidence of deceptive conduct",
                "Consumer transaction documentation",
                "Evidence of reliance and injury"
            ],
            "defenses": [
                "Conduct was not unfair or deceptive",
                "No consumer transaction",
                "Regulatory compliance defense",
                "Statute exempts the specific industry/conduct"
            ],
            "damages_statutory": "Treble damages (3x actual) under O.C.G.A. §10-1-399",
            "damages_actual": "Actual damages suffered from the deceptive practice",
            "damages_punitive": "Treble damages serve as punitive equivalent",
            "attorney_fees": True,
            "scienter": "knowing (higher standard than FCRA)",
            "sol_years": 2,
            "sol_notes": "2 years. Only use when there is clear willful/deceptive conduct — higher burden than federal claims.",
            "case_citations": [],
            "practice_tips": [
                "Only plead Georgia FBPA when conduct is clearly willful/deceptive",
                "Higher burden than FCRA — needs knowing/intentional conduct",
                "NEVER cite O.C.G.A. §34-6-2 (that's labor law, not FBPA)",
                "Treble damages make this valuable when provable",
                "Pair with FCRA claims — FBPA covers gaps federal law doesn't"
            ],
            "related_sections": ["10-1-399"],
            "tags": ["Georgia", "FBPA", "deceptive", "unfair", "state law", "treble"],
            "created_at": now, "updated_at": now,
        },
    ]
