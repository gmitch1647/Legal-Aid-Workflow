# TCPA Knowledge Base — Master Index  
  
**Purpose.** A RAG-ready corpus on the Telephone Consumer Protection Act (TCPA), 47 U.S.C. § 227, and its implementing FCC rules (47 C.F.R. § 64.1200) — designed to ground a consumer-law chatbot in primary-source authority (statute, FCC rules and orders, federal case law) rather than copyrighted treatise text.  
  
**Corpus version:** 1.0  
**Last updated:** May 16, 2026  
**File count:** 15 markdown files (this index + 14 substantive files)  
**Total length:** ~46,000 words  
  
**Companion corpora (already complete):**  
- FCRA Knowledge Base / Discovery Toolkit / Pleadings & Motion Practice  
- FDCPA Knowledge Base / Discovery Toolkit / Pleadings & Motion Practice  
  
---  
  
## How to use this corpus  
  
Each file is a stand-alone topical reference with:  
- A **statutory or regulatory citation header** identifying primary § or C.F.R. references  
- **Cross-references** to other files in the corpus, FCC orders, and case law  
- **Practical litigation/compliance notes** flagging common issues  
- **Inline `[VERIFY]` or `[VERIFY CITATION]` markers** where a subagent could not pin down exact reporter cites or paragraph numbering of FCC orders  
  
For a chatbot, ingest all files together — they cross-reference each other deliberately.  
  
**No content was extracted from copyrighted NCLC treatises or any other paywalled practitioner manuals.** The corpus is built from public-domain statutory and regulatory text, public-domain federal court decisions, FCC declaratory rulings and reports & orders, and other U.S. government agency materials.  
  
---  
  
## File catalog  
  
| # | File | Topic | Primary authority |  
|---|------|-------|-------------------|  
| 00 | `tcpa_00_TCPA_Master_Index.md` | This file | — |  
| 02 | `tcpa_02_TCPA_Key_Definitions.md` | Defined terms — ATDS, prerecorded/artificial voice, called party, residential, telephone solicitation | § 227(a); 47 C.F.R. § 64.1200(f) |  
| 03 | `tcpa_03_ATDS_Post_Duguid.md` | ATDS doctrine after *Facebook v. Duguid* (2021) | § 227(a)(1); *Duguid* and progeny |  
| 04 | `tcpa_04_Prior_Express_Consent.md` | Prior express consent for informational/non-marketing calls | § 227(b)(1); FCC 2008 declaratory ruling |  
| 05 | `tcpa_05_Prior_Express_Written_Consent.md` | Heightened written consent for marketing autodialed/prerecorded calls | 47 C.F.R. § 64.1200(a)(2), (f)(9) |  
| 06 | `tcpa_06_Revocation_of_Consent.md` | Right to revoke; reasonable means; 2024 FCC rule | *Reyes*, *Gager*, *Epps*; 2024 R&O |  
| 07 | `tcpa_07_Restrictions_on_Calls.md` | § 227(b) — autodialed/prerecorded calls, cell phones, emergency-line restrictions | § 227(b); 47 C.F.R. § 64.1200(a) |  
| 08 | `tcpa_08_Junk_Faxes.md` | § 227(b)(1)(C); JFPA; opt-out notice; *Carlton & Harris*; *Amerifactors* | § 227(b)(1)(C); JFPA |  
| 09 | `tcpa_09_DNC_Registry_and_Solicitation.md` | National DNC; internal DNC list; established business relationship | § 227(c); 47 C.F.R. § 64.1200(c), (d) |  
| 10 | `tcpa_10_Caller_ID_Spoofing.md` | Truth in Caller ID Act; STIR/SHAKEN; call-blocking rules | § 227(e); FCC orders |  
| 11 | `tcpa_11_TCPA_Case_Law_SCOTUS.md` | SCOTUS TCPA decisions | *Mims*, *Campbell-Ewald*, *Barr*, *Duguid*, *PDR*, *McLaughlin* |  
| 12 | `tcpa_12_TCPA_Case_Law_Circuits.md` | Leading circuit decisions by doctrinal topic | All circuits |  
| 13 | `tcpa_13_FCC_Rules_47_CFR_64_1200.md` | 47 C.F.R. § 64.1200, subsection by subsection | FCC rules |  
| 14 | `tcpa_14_FCC_Guidance_and_Orders.md` | Key FCC declaratory rulings, R&Os, and 2024–2025 rulemakings (AI-generated voices, revocation, lead-gen rule) | FCC orders |  
| 15 | `tcpa_15_TCPA_Remedies_Damages_SOL.md` | Civil liability, $500/$1,500 damages, treble, SOL, class actions, standing | § 227(b)(3), (c)(5); *TransUnion* |  
  
---  
  
## Statute-section → file map  
  
| Statute / rule section | Primary file(s) |  
|------------------------|-----------------|  
| § 227(a) (Definitions) | 02 |  
| § 227(a)(1) (ATDS definition) | 02; 03 |  
| § 227(b)(1)(A) (autodialed/prerecorded to cell, emergency lines, etc.) | 07 |  
| § 227(b)(1)(B) (prerecorded to residential) | 07 |  
| § 227(b)(1)(C) (junk faxes) | 08 |  
| § 227(b)(1)(D) (multiple lines tying up) | 07 |  
| § 227(b)(2) (FCC rulemaking authority) | 13; 14 |  
| § 227(b)(3) (private right of action — $500/$1,500) | 15 |  
| § 227(c) (DNC, residential telephone subscribers) | 09 |  
| § 227(c)(5) (private right of action — DNC) | 09; 15 |  
| § 227(d) (technical requirements) | 10 |  
| § 227(e) (caller ID spoofing — Truth in Caller ID Act) | 10 |  
| § 227(g) (state AG actions) | 15 |  
| 47 C.F.R. § 64.1200(a) (call restrictions) | 04; 05; 07 |  
| 47 C.F.R. § 64.1200(b) (prerecorded message identification) | 07 |  
| 47 C.F.R. § 64.1200(c) (national DNC) | 09 |  
| 47 C.F.R. § 64.1200(d) (internal DNC, training, time of day) | 09 |  
| 47 C.F.R. § 64.1200(f) (definitions) | 02; 05 |  
  
---  
  
## Key SCOTUS cases (quick reference)  
  
| Case | Citation | Holding |  
|------|----------|---------|  
| *Mims v. Arrow Financial Services* | 565 U.S. 368 (2012) | Federal courts have concurrent jurisdiction over TCPA private actions |  
| *Campbell-Ewald v. Gomez* | 577 U.S. 153 (2016) | Unaccepted Rule 68 offer does not moot TCPA class claim |  
| *Barr v. American Association of Political Consultants (AAPC)* | 591 U.S. 610 (2020) | Government-debt exception to § 227(b) is unconstitutional content-based restriction; severed |  
| *Facebook v. Duguid* | 592 U.S. 395 (2021) | ATDS requires capacity to use a random or sequential number generator to store or produce numbers |  
| *PDR Network v. Carlton & Harris* | 588 U.S. 1 (2019) | Hobbs Act preclusion of FCC order review depends on whether order is "legislative" or "interpretive" |  
| *McLaughlin Chiropractic v. McKesson* | 606 U.S. ___ (2025) | District courts not bound by FCC's *Amerifactors* online-fax ruling under Hobbs Act |  
  
Full treatment in file 11.  
  
---  
  
## Doctrinal-issue → file map  
  
| Issue | Primary files |  
|-------|---------------|  
| What is an ATDS post-*Duguid* | 02; 03; 11 (*Duguid*); 12 (circuit split aftermath) |  
| Prerecorded / artificial voice (incl. AI-generated voices, 2024 ruling) | 02; 07; 14 |  
| Prior express consent (informational) | 04; 12 |  
| Prior express written consent (marketing) | 05; 14 (lead-gen rule) |  
| Revocation of consent | 06; 12; 14 (2024 R&O) |  
| Calls to cell phones | 04; 05; 07 |  
| Reassigned number / "called party" | 02; 07; 12; 14 (Reassigned Numbers Database) |  
| Junk faxes (*Amerifactors* online-fax issue) | 08; 11 (*PDR*); 14 |  
| National DNC registry | 09 |  
| Internal DNC list / "do not call" policy requirements | 09 |  
| Established business relationship (EBR) | 09 |  
| Caller-ID spoofing / STIR/SHAKEN | 10 |  
| Standing under *TransUnion v. Ramirez* | 12; 15 |  
| Class actions (Rule 23 in TCPA cases) | 12; 15 |  
| Treble damages — "willfully or knowingly" | 12; 15 |  
| Statute of limitations (4 years; *Rotkiske*-style discovery issues) | 15 |  
| Vicarious liability for marketers, lead generators, sellers | 12; 14 |  
| AI-generated voice calls (2024 FCC declaratory ruling) | 07; 14 |  
| Lead-generation rule (2023 R&O) | 05; 14 |  
| Government-debt exception severance (post-*AAPC*) | 11; 12 |  
| State AG enforcement | 15 |  
| State TCPA analogues (Florida, Oklahoma, Washington, etc.) | (overview in 15) |  
  
---  
  
## What's NOT in this corpus (yet)  
  
- **Verbatim statutory text** for § 227. The analytical files cover every subsection with verified quotations but not the full verbatim text. The FCC publishes a clean version at fcc.gov; drop it into the workspace and Claude can integrate.  
- **Items flagged `[VERIFY]` or `[VERIFY CITATION]` inline:** A handful of FCC order paragraph numbers and a few district-court citations are flagged for confirmation before being cited in pleadings.  
  
---  
  
## Three-folder TCPA corpus (in progress)  
  
1. **TCPA Knowledge Base** (this folder, complete) — statute, FCC rules, FCC orders, case law.  
2. **TCPA Discovery Toolkit** (next) — discovery practice, sample interrogatories/RFPs, 30(b)(6), motions, ATDS-specific discovery, calling-platform discovery.  
3. **TCPA Pleadings & Motion Practice** (after discovery) — complaints, MTD, MSJ, class cert, *Duguid* motions, standing motions.  
  
---  
  
## Project status — three statutes  
  
| Statute | Knowledge Base | Discovery Toolkit | Pleadings & Motions | Total |  
|---------|---------------|-------------------|---------------------|-------|  
| **FCRA** | 15 files | 25 files | 16 files | 56 files / ~174,000 words |  
| **FDCPA** | 15 files | 25 files | 16 files | 56 files / ~154,000 words |  
| **TCPA** | 15 files (this folder) | pending | pending | 15 files so far / ~46,000 words |  
  
**Grand total when TCPA is complete: ~168 files across three federal consumer-protection statutes**, all built from public-domain primary sources with zero copyrighted treatise content.