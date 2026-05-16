# FCRA Knowledge Base — Master Index  
  
**Purpose.** This corpus is a RAG-ready reference on the Fair Credit Reporting Act (FCRA), 15 U.S.C. §§ 1681–1681x, and its implementing regulation (CFPB Regulation V, 12 C.F.R. Part 1022). It is designed to ground a consumer-law chatbot in primary-source authority — statute citations, agency guidance, and federal case law — rather than copyrighted treatise text.  
  
**Corpus version:** 1.0  
**Last updated:** May 16, 2026  
**File count:** 15 markdown files (this index + 14 substantive files)  
**Total length:** ~40,000 words  
  
---  
  
## How to use this corpus  
  
Each file is a stand-alone topical reference with:  
- A **statutory citation header** identifying primary § references  
- **Cross-references** to other files in the corpus  
- **Practical litigation/compliance notes** flagging common issues  
- **Inline `[VERIFY]` markers** wherever a subagent could not pin down exact subsection lettering against the live U.S. Code (these are non-load-bearing for analysis but should be confirmed against the statute before being cited in pleadings)  
  
For a chatbot, ingest all files together — they cross-reference each other deliberately so the model can chain concepts (e.g., a question about furnisher liability pulls in §§ 1681s-2, 1681i, Reg V Subpart E, *Hinkle v. Midland*, and *Gorman v. Wolpoff*).  
  
---  
  
## File catalog  
  
| # | File | Topic | Primary statute |  
|---|------|-------|-----------------|  
| 00 | `00_FCRA_Master_Index.md` | This file | — |  
| 02 | `02_FCRA_Key_Definitions.md` | Defined terms — consumer report, CRA, file, etc. | § 1681a |  
| 03 | `03_FCRA_Permissible_Purposes.md` | When a CRA may furnish a consumer report | § 1681b |  
| 04 | `04_FCRA_Consumer_Disclosure_Rights.md` | Free annual disclosure, file rights, credit score | §§ 1681g, 1681h, 1681j |  
| 05 | `05_FCRA_Accuracy_and_CRA_Duties.md` | "Maximum possible accuracy" and CRA procedures | § 1681e |  
| 06 | `06_FCRA_Disputes_and_Reinvestigation.md` | Consumer dispute process — CRA side | § 1681i; § 1681s-2(a)(8) |  
| 07 | `07_FCRA_Furnisher_Duties.md` | Furnisher duties — accuracy and dispute response | § 1681s-2; Reg V Subpart E |  
| 08 | `08_FCRA_Adverse_Action_and_Risk_Based_Pricing.md` | User notice duties to consumers | § 1681m; Reg V Subpart H |  
| 09 | `09_FCRA_Identity_Theft_Protections.md` | Fraud alerts, security freezes, ID theft blocks | §§ 1681c-1, 1681c-2, 1681w |  
| 10 | `10_FCRA_Case_Law_SCOTUS.md` | Supreme Court FCRA decisions | — |  
| 11 | `11_FCRA_Case_Law_Circuits.md` | Leading circuit decisions, by doctrinal topic | — |  
| 12 | `12_Regulation_V_Summary.md` | CFPB Reg V, 12 C.F.R. Part 1022, subpart-by-subpart | — |  
| 13 | `13_FCRA_Agency_Guidance.md` | FTC 40 Years report; CFPB advisory opinions, supervisory highlights, enforcement | — |  
| 14 | `14_FCRA_Remedies_Damages_SOL.md` | Civil liability, damages, statute of limitations | §§ 1681n, 1681o, 1681p |  
| 15 | `15_FCRA_Employment_and_Tenant_Screening.md` | Background-check rules, stand-alone disclosure | § 1681b(b); § 1681k; § 1681d |  
  
---  
  
## Statute-section → file map  
  
For a chatbot answering "what does § X say?" — fastest lookup:  
  
| Statute section | Primary file(s) |  
|-----------------|-----------------|  
| § 1681 (Congressional findings) | (general — see introductions in files 02, 03) |  
| § 1681a (Definitions) | 02 |  
| § 1681b (Permissible purposes) | 03; also 15 for § 1681b(b) employment |  
| § 1681c (Reporting time limits / "7-year rule") | 05; 13 (FTC commentary) |  
| § 1681c-1 (Fraud alerts, security freezes) | 09 |  
| § 1681c-2 (Block of ID-theft information) | 09 |  
| § 1681d (Investigative consumer reports) | 15 (employment context); 04 |  
| § 1681e (CRA procedures; maximum possible accuracy) | 05 |  
| § 1681g (Disclosures to consumers) | 04 |  
| § 1681h (Conditions and form of disclosure) | 04 |  
| § 1681i (Reinvestigation of disputes) | 06 |  
| § 1681j (Free annual disclosure) | 04 |  
| § 1681k (Public-record info for employment) | 15; 05 |  
| § 1681m (Adverse action / risk-based pricing notices) | 08 |  
| § 1681n (Civil liability — willful) | 14; 10 (Safeco) |  
| § 1681o (Civil liability — negligent) | 14 |  
| § 1681p (Jurisdiction / SOL) | 14 |  
| § 1681q–r (Criminal penalties) | 14 |  
| § 1681s (Administrative enforcement) | 13; 14 |  
| § 1681s-2(a) (Furnisher accuracy — gov't enforcement only) | 07 |  
| § 1681s-2(b) (Furnisher duties on CRA dispute notice — PRIVATE RIGHT) | 07; 06 |  
| § 1681s-3 (Affiliate marketing) | 12 (Reg V Subpart C) |  
| § 1681t (Preemption) | 14 |  
| § 1681w (Disposal of records) | 09 |  
  
---  
  
**No content was extracted from copyrighted NCLC treatises or any other paywalled practitioner manuals. The corpus is built from public-domain statutory and regulatory text, public-domain federal court decisions, and U.S. government agency materials.**  