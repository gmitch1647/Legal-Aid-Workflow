# FCRA Discovery Toolkit — Master Index

**Purpose.** A RAG-ready corpus for a consumer-law chatbot covering discovery practice in Fair Credit Reporting Act cases. Built from FRCP, the FCRA statute (15 U.S.C. § 1681 et seq.), Regulation V (12 C.F.R. Part 1022), published federal court opinions, CFPB/FTC public guidance, and concepts widely shared in bar association and CLE materials. Both plaintiff- and defense-side coverage.

**Corpus version:** 1.0
**Last updated:** May 16, 2026
**File count:** 18 markdown files (this index + 17 substantive files)
**Total length:** ~59,000 words

**Companion corpus:** FCRA Knowledge Base (statutory analysis, case law, agency guidance). The discovery toolkit assumes familiarity with that corpus; cross-references point to it where relevant.

---

## How to use this corpus

Each file is keyed to a specific discovery task. Sample interrogatories, RFPs, RFAs, 30(b)(6) topics, and motion language are clearly marked as **templates to adapt** — they are not turnkey legal documents. Every sample is annotated with (a) the FCRA provision or doctrine that motivates it, (b) the published case law that supports the request, and (c) common opposing objections.

For a chatbot, ingest all files together — they cross-reference each other deliberately so the model can chain concepts (e.g., a question about getting CRA matching algorithms pulls in files 04, 11, 13, and 16).

**No content was extracted from copyrighted NCLC treatises or any other paywalled practitioner manuals.** The corpus is built from FRCP, FCRA, Reg V, published federal court opinions (public domain), and U.S. government agency materials.

---

## File catalog

| # | File | Topic | Primary use |
|---|------|-------|-------------|
| 00 | `discovery_00_FCRA_Discovery_Master_Index.md` | This file | Navigation |
| 01 | `discovery_01_FCRA_Discovery_Strategy_Overview.md` | Strategy: when, what, why, sequencing | Pre-discovery planning |
| 02 | `discovery_02_FCRA_Initial_Disclosures.md` | Rule 26(a)(1) initial disclosures | First-week mechanics |
| 03 | `discovery_03_Interrogatories_to_CRAs.md` | Sample interrogatories to consumer reporting agencies | Plaintiff-side written discovery |
| 04 | `discovery_04_RFPs_to_CRAs.md` | Sample Requests for Production to CRAs | Plaintiff-side written discovery |
| 05 | `discovery_05_Interrogatories_to_Furnishers.md` | Sample interrogatories to furnishers | Plaintiff-side written discovery |
| 06 | `discovery_06_RFPs_to_Furnishers.md` | Sample RFPs to furnishers (incl. Metro 2 / e-OSCAR section) | Plaintiff-side written discovery |
| 07 | `discovery_07_Requests_for_Admission_FCRA.md` | RFAs — both sides — by FCRA fact pattern | Issue narrowing, summary judgment prep |
| 08 | `discovery_08_Defense_Discovery_to_Consumer.md` | Defense-side written discovery to consumer plaintiffs | Damages, mitigation, CRO involvement |
| 09 | `discovery_09_Third_Party_Subpoenas.md` | Rule 45 subpoenas to non-party witnesses | Creditors, employers, medical, agencies |
| 10 | `discovery_10_Expert_Discovery_FCRA.md` | Rule 26(a)(2) expert discovery in FCRA cases | Damages, statistical, industry experts |
| 11 | `discovery_11_30b6_Deposition_Topics_CRAs.md` | 30(b)(6) corporate rep depo topics — CRAs | Algorithm, dispute handling, compliance |
| 12 | `discovery_12_30b6_Deposition_Topics_Furnishers.md` | 30(b)(6) topics — furnishers | Dispute handling, account docs |
| 13 | `discovery_13_Protective_Orders_Algorithm_Protection.md` | Tiered POs and source-code review protocols | Algorithm production negotiations |
| 14 | `discovery_14_Discovery_Motions_FCRA.md` | Motions to compel, protect, sanction | Discovery disputes |
| 15 | `discovery_15_Meet_Confer_and_Discovery_Letters.md` | Meet-and-confer letter templates | Pre-motion correspondence |
| 16 | `discovery_16_FCRA_Discovery_Case_Law.md` | Published discovery-dispute rulings in FCRA cases | Brief-writing authority |
| 17 | `discovery_17_Class_Action_Discovery_FCRA.md` | Class-cert and class-discovery specifics | Putative class action mechanics |

---

## Doctrinal-issue → file map

For a chatbot answering "how do I get X in discovery?":

| Issue | Primary files |
|-------|---------------|
| Matching algorithm production | 04 (RFPs); 11 (depo topics); 13 (PO mechanics); 16 (case law) |
| ACDV / e-OSCAR records — CRA | 04; 11; 16 |
| ACDV / e-OSCAR records — furnisher | 06 (incl. Metro 2 section); 12; 16 |
| Furnisher account-level documentation (Hinkle issue) | 05; 06; 12; 16 |
| Other-consumer dispute records (Safeco willfulness pattern evidence) | 04; 06; 11; 16 |
| Furnisher accuracy & integrity policies (Reg V § 1022.42) | 05; 06; 12 |
| Subscriber agreements and user certifications | 04 |
| Internal CRA audits and quality reviews | 04; 11; 16 |
| Plaintiff's prior credit history (defense side) | 08; 16 |
| Plaintiff communications with credit repair organizations | 08; 16 |
| Emotional-distress damages scope | 08; 10; 16 |
| 30(b)(6) preparation challenges | 11; 12; 14; 16 |
| Standing-related discovery post-*TransUnion v. Ramirez* | 08; 16; 17 |
| Class-action discovery (Rule 23 elements, predominance) | 17 |
| Protective orders / AEO / source code | 13; 14 |
| Motions to compel | 14; 15 (meet-confer first) |
| Sanctions / spoliation | 14; 16 |
| Subpoenas to credit-repair organizations | 09 |
| Touhy / federal-agency subpoenas | 09; 16 |
| Expert discovery — damages | 10 |
| Expert discovery — statistical/algorithm | 10; 11 |

---

## Cross-reference: FCRA claim → key discovery files

| Claim type | Strategy file | CRA discovery | Furnisher discovery |
|------------|---------------|---------------|---------------------|
| § 1681e(b) accuracy / mixed file | 01 | 03 (§ A, B); 04 (§ A, B); 11 (§ A, B, D) | n/a |
| § 1681i reinvestigation | 01 | 03 (§ C); 04 (§ C); 11 (§ C) | n/a |
| § 1681s-2(b) furnisher dispute | 01 | n/a | 05 (§ B, D); 06 (§ B, C); 12 (§ B) |
| § 1681b impermissible purpose | 01 | 03 (§ E); 04 (§ E); 11 (§ F) | n/a |
| § 1681b(b) employment screening | 01 | 03 (re: employment certifications); 11 | (where employer is furnisher) |
| § 1681c-1 / c-2 identity theft | 01 | 03 (re: blocks); 04 (re: blocks); 11 (§ G) | 05 (re: § 1681s-2(a)(6)–(7)); 12 (§ G) |
| Willfulness under *Safeco* | 01 (strategy); 04 (other-consumer records); 11 (§ I); 16 (§ C) | (parallel furnisher records) | |

---

## What this corpus is and isn't

**Is:** A starting reference for FCRA discovery practice — sample templates, strategic guidance, and case-law support — ingestible into a RAG pipeline so a chatbot can answer questions like "what should I ask in a 30(b)(6) of Experian's dispute handling team?" with grounded, cited responses.

**Isn't:** A substitute for jurisdiction-specific local rules research, case-specific scoping, or human attorney judgment. Sample discovery requests must be tailored to the specific factual posture of the case. Citations must be Shepardized before relying on them in briefs.

**Items flagged `[VERIFY]` or `[VERIFY CITATION]` inline:** Where a subagent could not pin down a specific reporter cite or where a case was discussed in published opinions but the exact citation was uncertain, the file flags the gap explicitly. These should be confirmed before being relied upon in any pleading.

---

## Suggested next folders

This is folder 2 of a planned 3+:
1. **FCRA Knowledge Base** (complete) — statute, regulation, case law, agency guidance.
2. **FCRA Discovery Toolkit** (this folder) — discovery practice.
3. **Suggested next:** FCRA pleadings (complaint drafting, class-action complaints, motion practice on pleadings, Rule 12 motions), and parallel folders for FDCPA and TCPA.
