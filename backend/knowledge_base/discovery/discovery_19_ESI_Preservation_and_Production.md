# Discovery File 19 — ESI Preservation and Production in FCRA Cases  
  
| Field | Value |  
|---|---|  
| Topic | Electronically stored information (ESI) preservation, collection, search, production, and clawback in FCRA cases |  
| Primary FRCP rules | Rule 16(b), Rule 26(b)(1)–(2), Rule 26(f), Rule 34, Rule 37(e), Rule 45 |  
| Primary FRE rules | FRE 502(b), FRE 502(d), FRE 502(e) |  
| Primary FCRA provisions | 15 U.S.C. §§ 1681e(b), 1681i, 1681s-2(a), 1681s-2(b), 1681c-2 |  
| Regulation V | 12 C.F.R. §§ 1022.42, 1022.43 (furnisher duties / direct disputes) |  
| Common law / case law | *Zubulake v. UBS Warburg LLC*, 217 F.R.D. 309 (S.D.N.Y. 2003) ("Zubulake IV"), 220 F.R.D. 212 (S.D.N.Y. 2003) ("Zubulake V"); *Cushman v. Trans Union Corp.*, 115 F.3d 220 (3d Cir. 1997); *Safeco Ins. Co. of Am. v. Burr*, 551 U.S. 47 (2007) |  
| Last updated | 2026-05-16 |  
| Cross-references | Files 01 (strategy), 02 (CRA discovery), 03 (furnisher discovery), 05 (defense ESI), 06 (subpoenas), 07 (30(b)(6) topics), 08 (protective orders), 11 (case-law), 18 (pre-suit), 22 (privilege logs) |  
  
---  
  
## Overview  
  
FCRA cases are ESI cases. The operative facts — disputes, ACDVs, e-OSCAR transmissions, matching-algorithm results, automated suppression rules, account-history records, voice recordings, training files — live in databases, in structured-data feeds, and in tightly retained internal systems. The case turns on what the CRA or furnisher knew, how it processed the dispute, and what its automated systems did. The discovery rules that govern those questions are FRCP 26, 34, and 37(e), supplemented by FRE 502 on privilege.  
  
This file covers (A) litigation-hold mechanics, (B)–(C) the scope of ESI at CRAs and furnishers, (D) Metro 2 / e-OSCAR native production, (E) custodian and search-term protocols, (F) ESI-protocol drafting, (G) database queries and structured production, (H) privilege screening and clawback, and (I) FCRA-specific spoliation issues.  
  
---  
  
## A. Litigation Hold Letters  
  
### 1. When does the duty to preserve attach?  
  
The duty to preserve relevant information arises when a party "reasonably anticipates litigation." See *Zubulake v. UBS Warburg LLC*, 220 F.R.D. 212 (S.D.N.Y. 2003) (Scheindlin, J.) ("Zubulake V"); see also *Zubulake IV*, 217 F.R.D. 309 (S.D.N.Y. 2003). The duty is common-law in origin and is now overlaid by FRCP 37(e), which provides the federal sanctions framework for failure to preserve ESI.  
  
For a consumer plaintiff, the duty typically attaches no later than the date the consumer sends a written § 1681i dispute that complains of inaccurate reporting and indicates an intent to enforce rights. For a defendant CRA or furnisher, the duty typically attaches upon receipt of a § 1681i dispute or direct dispute under § 1681s-2(a)(8) where the consumer also asserts a claim under FCRA (e.g., references the statute, identifies counsel, or threatens suit), or upon receipt of a pre-suit demand letter. Both sides should issue litigation-hold notices at that point.  
  
### 2. FRCP 37(e) framework (post-2015 amendment)  
  
Rule 37(e) applies "If electronically stored information that should have been preserved in the anticipation or conduct of litigation is lost because a party failed to take reasonable steps to preserve it, and it cannot be restored or replaced through additional discovery." It then divides remedies:  
  
- **(e)(1)** — Upon a finding of prejudice from loss, the court "may order measures no greater than necessary to cure the prejudice."  
- **(e)(2)** — "Only upon finding that the party acted with the intent to deprive another party of the information's use in the litigation" may the court (A) presume the lost information was unfavorable, (B) instruct the jury that it may or must presume so, or (C) dismiss the action or enter default judgment.  
  
The 2015 amendment was specifically intended to displace cases (notably *Residential Funding Corp. v. DeGeorge Fin. Corp.*, 306 F.3d 99 (2d Cir. 2002)) that allowed adverse-inference instructions on a showing of negligence. The post-2015 consensus across circuits is that adverse-inference instructions under Rule 37(e)(2) require specific intent to deprive.  
  
### 3. TEMPLATE — Litigation hold to plaintiff client  
  
```  
[Law firm letterhead]  
[Date]  
  
[Client name and address]  
DELIVERED IN PERSON / BY E-MAIL  
  
Re: Litigation Hold Notice — Preservation of Documents and  
 Electronically Stored Information  
  
Dear [Client]:  
  
You have engaged our firm to represent you in a potential or  
filed action under the Fair Credit Reporting Act. The law  
requires you to preserve documents and electronically stored  
information ("ESI") that may be relevant. This letter tells you  
what to preserve and what to stop doing.  
  
A. WHAT TO PRESERVE — Do not delete, destroy, or alter any of  
 the following, and suspend any automatic-deletion settings:  
  
 1. Every credit report, score, or consumer file you obtain  
 from any source (AnnualCreditReport.com, the three  
 nationwide CRAs, specialty CRAs, banks).  
 2. Every dispute letter, online dispute confirmation,  
 certified-mail receipt, return-receipt card, and tracking  
 record.  
 3. Every response from a CRA or furnisher (letters, emails,  
 portal messages, screenshots of online dashboards).  
 4. Every credit denial, counteroffer, or adverse-action notice.  
 5. Every communication with the furnisher about the account  
 (statements, payment records, account-closure letters,  
 pay-off letters).  
 6. Every communication with police, the FTC IdentityTheft.gov  
 portal, or any government agency about the dispute.  
 7. Text messages, voicemails, and call recordings with any  
 defendant or its agents.  
 8. Social media posts, messages, and account records relating  
 to the disputed accounts or the credit harm (do NOT make  
 new posts about the case).  
 9. Receipts, bank statements, paystubs, lease applications,  
 mortgage applications, insurance applications, employment  
 records, and any record showing damages.  
 10. Counseling, therapy, and medical records relating to  
 emotional distress (you may keep these private until we  
 discuss; do not destroy).  
  
B. WHAT TO STOP DOING:  
  
 • Do not delete texts, emails, or voicemails — even from  
 numbers you don't recognize.  
 • Do not "clean up" your inbox or trash old folders.  
 • Do not change phones or factory-reset a device without  
 telling us first.  
 • Do not erase browser history relating to credit/financial  
 accounts.  
 • Do not close email accounts or social-media accounts.  
  
C. HOW TO PRESERVE:  
  
 • Keep paper records in a single folder.  
 • Save digital records to a single labeled folder and back  
 them up.  
 • If a record exists only on a website or app, take a dated  
 screenshot.  
  
If you are not sure whether something is relevant, save it and  
ask us. Failure to preserve can result in sanctions against you  
and may harm the case.  
  
Sincerely,  
[Counsel]  
```  
  
### 4. TEMPLATE — Litigation hold to defendant (post-suit, or pre-suit demand)  
  
```  
[Law firm letterhead]  
[Date]  
  
VIA CERTIFIED MAIL AND EMAIL  
[Defendant — registered agent / general counsel / litigation  
contact]  
  
Re: [Consumer] v. [Defendant] — Notice of Claim and Demand  
 for Preservation of Documents and Electronically Stored  
 Information  
  
[Defendant] is on notice of a reasonably anticipated action under  
the Fair Credit Reporting Act, 15 U.S.C. § 1681 et seq., relating  
to the consumer credit file of [Consumer], DOB [redacted], last 4  
SSN [redacted], including disputes submitted on or about  
[dates].  
  
Pursuant to Federal Rule of Civil Procedure 37(e), the common-law  
duty to preserve recognized in *Zubulake v. UBS Warburg LLC*,  
220 F.R.D. 212 (S.D.N.Y. 2003), and your own internal records-  
retention obligations under the FCRA and Reg V (12 C.F.R. Part  
1022), you must immediately:  
  
 (i) Suspend all automatic-deletion programs that affect ESI  
 relevant to this matter, including email auto-purge,  
 retention policies in collaboration platforms (Microsoft  
 365, Google Workspace, Slack, Teams), call-recording  
 retention, voicemail retention, and database archival  
 deletion;  
 (ii) Issue an internal litigation-hold notice to all  
 custodians and information-technology personnel with  
 access to or control over the relevant ESI;  
 (iii) Preserve the categories of documents and ESI listed  
 below; and  
 (iv) Notify our firm in writing within fourteen (14) days  
 confirming compliance and identifying the date the hold  
 was implemented.  
  
SCOPE — preserve all documents and ESI from [date 24 months  
before earliest dispute] to the present concerning [Consumer]  
and her credit file, including but not limited to:  
  
 1. CRA-specific:  
 a. Consumer file contents at every relevant date.  
 b. Disclosure logs (when, to whom, what version).  
 c. ACDV records (received and sent), e-OSCAR transmission  
 logs, and all internal dispute investigation records.  
 d. Matching-algorithm code, version history, parameter  
 files, and audit logs of matches involving the consumer  
 or any plausible "near match."  
 e. Suppression rules, suppression decisions, and the rule-  
 engine version active at each relevant date.  
 f. Quality-assurance, audit, and exception reports.  
 g. Subscriber agreements and certifications.  
 h. Training materials, policies, procedures, and  
 compliance audits.  
 i. Email, instant-message, Teams/Slack records of dispute  
 agents, compliance officers, and managers.  
 j. Recordings, transcripts, and notes of any telephone or  
 portal interactions with the consumer.  
  
 2. Furnisher-specific:  
 a. Account-level system records (origination, status  
 history, payment history, hold/dispute flags).  
 b. ACDV records received and responses sent (free-text  
 comments and codes).  
 c. Direct-dispute correspondence and the furnisher's  
 Reg V § 1022.43 investigation files.  
 d. Chain-of-title documents (for debt buyers): bills of  
 sale, purchase agreements, account-level data files,  
 seller affidavits.  
 e. Furnisher's policies and procedures under 12 C.F.R.  
 § 1022.42 and FCRA § 1681s-2(a) generally.  
 f. Training materials and compliance audits.  
 g. Email, IM, and call recordings of dispute-handling  
 personnel.  
  
 3. Cross-cutting:  
 a. CFPB or state-AG complaint records related to the  
 consumer or to substantially similar disputes.  
 b. Records of prior litigation regarding the consumer or  
 the same processes.  
 c. Privilege-screening logs and any document-management  
 system used.  
 d. Mobile-device data of any custodian using a personal or  
 BYOD device for FCRA work.  
  
Sanctions for failure to preserve under Rule 37(e) range from  
curative measures (Rule 37(e)(1)) to adverse-inference  
instructions and case-dispositive sanctions (Rule 37(e)(2)). We  
expect full compliance and reserve all rights.  
  
Sincerely,  
[Counsel]  
```  
  
---  
  
## B. ESI Scope Categories — CRAs  
  
Counsel should drive ESI scope from the FCRA elements: accuracy procedures (§ 1681e(b)), reinvestigation procedures (§ 1681i), notice to furnisher (§ 1681i(a)(2)), willfulness (*Safeco*, 551 U.S. 47), and identity-theft block compliance (§ 1681c-2). The following inventory ties each category to a litigation theory.  
  
| Category | Litigation purpose |  
|---|---|  
| ACDV records (received and sent) and e-OSCAR transmission logs | § 1681i reinvestigation reasonableness; what was sent to furnisher; what the furnisher replied with |  
| Internal dispute investigation files (agent notes, screenshots, system records, decision rationales) | Whether the CRA actually reviewed information or merely "parroted" the furnisher (*Cushman*) |  
| Database extracts of the consumer file at each relevant date | What the file actually contained; what was added/removed and when |  
| Matching-algorithm code repositories, version histories, parameter files | "Mixed file" claims; whether the CRA's procedures were reasonable under § 1681e(b) |  
| Subscriber agreements and certifications (e-signed) | Permissible-purpose claims; § 1681e(a) reasonable procedures |  
| Training materials, internal policies, audits | *Safeco* willfulness; "reasonable procedures" defense |  
| Email, IM (M365, Slack, Teams) | Custodian-level evidence; ad hoc decisions; internal admissions |  
| Voicemail and call recordings | Consumer-service interactions; consumer statements; agent representations |  
| Identity-theft block records (§ 1681c-2 logs) | Block compliance; furnisher notification |  
| Quality assurance / audit reports | Pattern of failures; supervisory awareness |  
| CFPB / regulator correspondence and supervisory letters | Knowledge of defects (willfulness); fact-of-violation evidence |  
  
---  
  
## C. ESI Scope Categories — Furnishers  
  
| Category | Litigation purpose |  
|---|---|  
| Servicing-system records (account history, status changes, dispute flags) | Whether the reported information was substantively accurate |  
| ACDV records received from CRAs and responses sent | § 1681s-2(b) reasonable investigation; recklessness |  
| Direct-dispute correspondence and § 1022.43 investigation files | Reg V investigation reasonableness |  
| Account-level documentation (origination docs, statements, payments, written agreements) | Underlying truth of reported items |  
| Chain-of-title documents (debt buyers) | Standing of furnisher; accuracy of balance and ownership |  
| Compliance policies, training, audits, vendor management | Willfulness; "objectively reasonable" defense |  
| Email, IM, call recordings of dispute personnel | Internal admissions; pattern conduct |  
| Vendor records (collection-agency forwarding, scrubs) | Information flow and accuracy at each handoff |  
  
---  
  
## D. Metro 2 Format and Native Production  
  
### 1. What Metro 2 is  
  
Metro 2 is the standard data-reporting format published by the Consumer Data Industry Association (CDIA). It is the format in which furnishers transmit account data to the nationwide CRAs. The format is record-oriented (Header, Base Segment, J1/J2 associated consumer segments, K segments, L segments, N segments, etc.). Each field has a fixed position, length, and code dictionary (e.g., Account Status, Payment Rating, Compliance Condition Code, Special Comment Code).  
  
The format itself is documented in the CDIA's *Credit Reporting Resource Guide* (which is copyrighted and not reproduced here). For public-domain explanation of specific Metro 2 fields, counsel should cite the many published opinions reproducing field-level analysis and CFPB Supervisory Highlights that describe ACDV mechanics — including, for example, **CFPB Consumer Financial Protection Circular 2022-07** on reasonable investigation of consumer reporting disputes.  
  
### 2. Why demand native Metro 2 production  
  
CRAs and furnishers often produce summary "data extracts" or printable reports that omit code-level fields (CCC, SCC, ECOA codes, terms-frequency, etc.). The summary may show a sanitized "Account Status," but the native Metro 2 record may show conflicting fields — for instance, an "open and current" status paired with a "Compliance Condition Code" of XB (Account in dispute) that the CRA failed to suppress.  
  
Plaintiffs should specifically demand the **native Metro 2 record(s)** for the consumer's tradeline at each reporting cycle, plus the **field dictionary** (or equivalent statement of field definitions). A native production allows independent reconstruction of what the furnisher reported and what the CRA stored.  
  
### 3. e-OSCAR ACDV — key fields  
  
The Automated Consumer Dispute Verification (ACDV) form is the e-OSCAR record used by CRAs to forward disputes and by furnishers to reply. Critical fields include:  
  
- **Dispute code 1 / Dispute code 2** — three-digit numeric codes describing the dispute (e.g., 001 "not his/hers," 102 "claims account closed by consumer," 103 "claims paid," 104 "disputes present/previous account status," 106 "disputes payment history profile," etc.).  
- **Response code** — the furnisher's reply (e.g., "Verified as reported," "Modified," "Deleted").  
- **FCRA Relevant Information** / **Free-text comments** — narrative fields where the dispute basis or response detail appears.  
- **Images / supporting documents** — many ACDV transmissions include scanned images of consumer-submitted documents; plaintiffs should demand all images transmitted.  
- **Date sent / date received / date responded**.  
- **Consumer information transmitted** — name, address, SSN, DOB as sent to the furnisher; mismatches here often establish § 1681e(b) failures.  
  
### 4. How to read an ACDV  
  
A typical ACDV in production will look like a one- or two-page form. Counsel should be able to:  
  
1. Identify the **operative dispute code(s)** sent.  
2. Identify the **free-text comment** sent (often truncated to fit field length — a frequent unreasonableness theory).  
3. Identify the **images attached** (or that no images were attached).  
4. Identify the **response code** and whether the furnisher's response was responsive to the actual dispute.  
5. Compare the ACDV against the furnisher's internal system notes to see whether the furnisher actually reviewed the disputed data.  
  
---  
  
## E. Custodian Lists and Search Terms  
  
### 1. Identifying custodians  
  
For a CRA defendant, typical custodians include:  
  
- Dispute-resolution agents who handled the consumer's file.  
- The agents' team leads and supervisors.  
- Compliance personnel responsible for § 1681i procedures.  
- Data-quality / "data integrity" team.  
- IT staff responsible for the matching algorithm and the dispute-routing engine.  
- Executive(s) with FCRA oversight (often a Chief Compliance Officer or VP Consumer Affairs).  
- Vendor liaisons (for outsourced dispute work in offshore call centers).  
  
For a furnisher defendant:  
  
- Dispute-handling personnel (including any third-party vendor handling ACDVs).  
- Compliance officers responsible for § 1681s-2(a) policies.  
- Internal audit personnel.  
- The IT owner of the servicing system.  
- Customer-service representatives who spoke with the consumer.  
- Executives responsible for credit-reporting accuracy.  
  
### 2. Search terms — FRCP 26(b)(2)(B) and proportionality  
  
Rule 26(b)(1) limits discovery to nonprivileged matter "relevant to any party's claim or defense and proportional to the needs of the case," considering importance of the issues, amount in controversy, parties' relative access to information, parties' resources, importance of the discovery in resolving the issues, and burden vs. benefit. Rule 26(b)(2)(B) addresses ESI "not reasonably accessible because of undue burden or cost."  
  
A practical search-term protocol:  
  
- **Consumer-specific terms.** Name variants, last 4 SSN (with appropriate confidentiality controls), unique account number(s), file-tracking IDs.  
- **Process terms.** "ACDV," "e-OSCAR," "reinvestig*," "dispute," "block," "suppress," "freeze," "fraud alert," "Metro 2," "Compliance Condition Code," "XB," "1681c-2."  
- **Internal-system terms.** Names of the dispute platform, the matching engine, the suppression rule-set, the consumer-relations CRM.  
- **Person-level terms.** Names of identified custodians plus internal handles.  
  
Hit reports should be exchanged, and the parties should iterate. Where the parties cannot agree, courts increasingly use TAR (technology-assisted review) or predictive coding. *Da Silva Moore v. Publicis Groupe*, 287 F.R.D. 182 (S.D.N.Y. 2012) and its progeny support TAR's use; the Sedona Conference Principles on TAR are persuasive authority.  
  
### 3. TEMPLATE — Search-term proposal (plaintiff to defendant)  
  
```  
Proposed Search Terms — [Defendant] ESI Collection  
  
Custodian list (proposed): [list, with role]  
Date range: [date 24 months before earliest dispute] to present  
Repositories: [email systems, IM platforms, file shares, dispute  
 platform exports, ticket systems]  
  
Term sets (Boolean):  
  
 Set A — Consumer-specific:  
 "[Consumer last name]" w/5 "[Consumer first name]"  
 OR "[last 4 SSN]"  
 OR "[account number]"  
 OR "[CRA file identifier]"  
  
 Set B — Process-specific:  
 (ACDV OR e-OSCAR OR "Metro 2" OR "Compliance Condition Code"  
 OR CCC OR SCC OR XB) AND (dispute OR reinvestig*)  
  
 Set C — Block / fraud / suppress:  
 ("1681c-2" OR "identity theft" OR "block" OR "fraud alert"  
 OR "freeze" OR "suppress*") AND ("[Consumer last name]" OR  
 [last 4 SSN])  
  
 Set D — Policy / training:  
 (polic* OR procedure OR training OR "job aid" OR "desk top  
 procedure" OR audit) AND (dispute OR reinvestig* OR FCRA OR  
 "1681")  
  
Hit report due: [date]. Parties will meet and confer to refine  
within 7 days of hit report.  
```  
  
---  
  
## F. ESI Protocol Negotiations  
  
### 1. Rule 26(f) and the early ESI conference  
  
Rule 26(f)(3)(C) requires the parties' discovery plan to address "any issues about disclosure, discovery, or preservation of electronically stored information, including the form or forms in which it should be produced." Rule 16(b)(3)(B)(iii) authorizes the court to include such provisions in the scheduling order. Counsel should arrive at the 26(f) conference with a draft ESI protocol.  
  
### 2. Core provisions of an ESI protocol  
  
- **Scope of preservation.** Categories preserved; pause on auto-deletion; mobile-device treatment; ephemeral-messaging treatment (e.g., disappearing-message platforms — Snapchat, Signal, default-disappearing Slack, certain Teams configurations).  
- **Production format.** TIFF + load file (with native production for spreadsheets, audio, and structured data) versus full native. For FCRA cases, native is strongly preferred for ACDVs, Metro 2 records, system extracts, and call recordings.  
- **Metadata fields.** Custodian, file path, sent/received/created/modified dates, From/To/CC/BCC, subject, attachment relationships, MD5/SHA-1 hash, deduplication ID, BegBates/EndBates, BegAttach/EndAttach, ConfDesignation.  
- **Deduplication standard.** Global (across custodians) vs. custodian-level. Plaintiffs typically prefer custodian-level so that a single email is produced for each recipient.  
- **Family relationships.** Parent-child (email + attachments) preserved together; partial productions disclosed.  
- **Search-term protocol.** Methodology, iteration, hit-report exchange.  
- **Privilege procedures.** Inclusion of an FRE 502(d) order; clawback procedures; logging.  
- **Audio / video.** Native production with transcripts where available; metadata identifying the recording system.  
- **Structured data.** Queries vs. table dumps; format (CSV/JSON/SQL); schema documentation.  
- **Cost-shifting.** Identification of "not reasonably accessible" sources under Rule 26(b)(2)(B) and standards for cost-shifting.  
  
### 3. Common disputes  
  
- **Format disputes.** Defendants often offer TIFF-only with select metadata, stripping the native format. Rule 34(b)(2)(E)(ii) requires production "in a form or forms in which it is ordinarily maintained or in a reasonably usable form." For Metro 2 and ACDVs, only native is "reasonably usable."  
- **Metadata stripping.** Defendants strip metadata claiming privacy or burden. Insist on the Sedona Conference standard metadata set.  
- **Family relationships.** Productions that break parent-child relationships violate Rule 34's "as kept in the usual course" requirement.  
- **Predictive coding without validation.** TAR is appropriate where validated; plaintiffs should request the recall, precision, and richness measures and the seed-set methodology.  
  
### 4. TEMPLATE — Sample ESI protocol provisions  
  
```  
1. PRESERVATION. The parties have implemented written  
 litigation-hold notices to all custodians and IT personnel.  
 Each party shall serve a written description of the hold's  
 date, scope, and recipient categories within 14 days of  
 entry of this Order. Automatic-deletion settings affecting  
 relevant ESI are suspended.  
  
2. PRODUCTION FORMAT.  
 (a) Default: single-page Group IV TIFF (300 dpi, B/W) with  
 searchable text and a Concordance-format load file.  
 (b) Native production: spreadsheets (.xlsx/.xlsm/.xls/.csv);  
 presentations (.pptx); audio (.wav, .mp3, .m4a); video;  
 databases and structured data; source-code repositories;  
 chat exports; and any record where the TIFF rendition  
 would not be "reasonably usable" (Rule 34(b)(2)(E)(ii)).  
 This category EXPRESSLY includes Metro 2 records, ACDV  
 records, e-OSCAR exports, and all data extracts.  
 (c) Metadata: minimum set per Sedona Conference Cooperation  
 Proclamation Appendix, including Custodian, FileName,  
 FilePath, DateCreated, DateModified, DateSent,  
 DateReceived, From, To, CC, BCC, Subject, HashValue,  
 BegBates, EndBates, BegAttach, EndAttach, ConfDesig.  
  
3. DEDUPLICATION. Custodian-level deduplication only. Each  
 produced document shall list all custodians whose collection  
 contained the document.  
  
4. SEARCH METHODOLOGY. Parties will exchange (a) custodian  
 lists, (b) data sources, (c) proposed search terms, and  
 (d) hit reports. Parties will meet and confer on  
 refinements. Either party may propose TAR; the proponent  
 must disclose the methodology, seed-set source, and  
 validation metrics.  
  
5. PRIVILEGE.  
 (a) FRE 502(d). Pursuant to FRE 502(d), the production of  
 any document or ESI in this litigation does not waive  
 attorney-client privilege or work-product protection  
 in this or any other federal or state proceeding,  
 regardless of the producing party's care.  
 (b) Clawback. The receiving party shall, within 7 days of  
 notice, return, sequester, or destroy any document  
 claimed back, and shall not use the document or its  
 contents pending resolution of the claim.  
 (c) Privilege log. Logs shall be served within 30 days of  
 the production they pertain to, in the format described  
 in the parties' separate privilege-log protocol [see  
 File 22].  
  
6. STRUCTURED DATA. For any database query response, the  
 producing party shall provide (a) the query language used,  
 (b) the schema of source tables, (c) the resulting dataset  
 in CSV or other agreed format with field definitions, and  
 (d) a sworn or certified statement of completeness.  
  
7. RULE 502(d) ORDER. The Court enters this protocol as a  
 non-waiver order under FRE 502(d).  
```  
  
---  
  
## G. Database Queries and Structured Data  
  
### 1. Document production vs. structured query  
  
ACDV records, Metro 2 records, audit logs, and account histories are inherently structured. Production as PDF/TIFF is wasteful and obscures the data. Counsel should request **database queries and structured exports**, e.g.:  
  
- All ACDV records received and sent involving the named consumer (specific identifiers), with all fields.  
- All ACDVs received by the furnisher with dispute codes 102 or 105 in a defined date range (pattern evidence).  
- All matches the CRA's algorithm produced involving the consumer's SSN or close variants.  
- All audit-trail entries for the consumer's file in a defined date range.  
- All identity-theft blocks under § 1681c-2 for the consumer, with disposition.  
  
### 2. Sample query specifications  
  
The plaintiff's request should specify (a) the database, (b) the table or view, (c) the filtering criteria, (d) the columns sought, and (e) the format. Example:  
  
```  
TEMPLATE — Query specification  
  
Request: Produce a CSV export from the e-OSCAR / ACDV system of  
all ACDV records satisfying ALL of:  
  
 • date_received BETWEEN '2023-01-01' AND '2024-12-31'  
 • dispute_code_1 IN ('102','103','104','105','106')  
 • furnisher_id = [redacted furnisher member number]  
  
Include all fields, including but not limited to:  
 acdv_id, date_received, date_sent, date_responded,  
 cra_member_id, furnisher_member_id, consumer_first_name,  
 consumer_last_name, consumer_ssn_last4, consumer_dob,  
 account_number_partial, dispute_code_1, dispute_code_2,  
 dispute_narrative, response_code, response_narrative,  
 modified_fields, attached_image_count, attached_image_names  
  
Format: CSV (UTF-8), one row per ACDV. Provide a separate  
field-dictionary document.  
  
Provide a certification under FRCP 26(g) and 34 by an  
appropriate witness that the query was run as specified and  
that the export is complete.  
```  
  
### 3. Identifying database systems to query  
  
Through 30(b)(6) testimony (see File 07) and meet-and-confer practice, identify:  
  
- The CRA's primary consumer-file database (often a proprietary mainframe-derived store).  
- The CRA's dispute-handling system (often a workflow tool that wraps e-OSCAR).  
- The matching-algorithm pipeline (often a separate batch system).  
- The identity-theft handling system.  
- The furnisher's loan-servicing or card-servicing platform.  
- The furnisher's dispute-handling workflow.  
- The complaint-management system (CFPB portal integration).  
  
### 4. Format considerations  
  
Plaintiffs should resist "data summary" productions. Insist on (a) CSV or relational dumps, (b) schema documentation, (c) at-rest data dictionaries, and (d) certification by a witness with personal knowledge.  
  
---  
  
## H. Privilege Screening and Clawback  
  
### 1. Screening before production  
  
Producing parties should screen for privilege using a combination of (a) custodian-level review, (b) keyword-based "privilege hits" (counsel surnames, "privileg*," "attorney," "legal," etc.), and (c) sampling QA. The output is a privilege log (see File 22).  
  
### 2. FRE 502 framework  
  
- **FRE 502(b)** — Inadvertent disclosure does not waive privilege if (1) the disclosure is inadvertent, (2) the holder took reasonable steps to prevent disclosure, and (3) the holder promptly took reasonable steps to rectify the error.  
- **FRE 502(d)** — A federal court "may order that the privilege or protection is not waived by disclosure connected with the litigation pending before the court — in which event the disclosure is also not a waiver in any other federal or state proceeding."  
- **FRE 502(e)** — Party agreements bind only the parties unless incorporated into a court order.  
  
A 502(d) order is materially stronger than a 502(b) analysis because it eliminates the "reasonable steps" inquiry. Every FCRA ESI protocol should include a 502(d) order.  
  
### 3. TEMPLATE — Standalone FRE 502(d) order  
  
```  
ORDER UNDER FEDERAL RULE OF EVIDENCE 502(d)  
  
 1. The production of any document or ESI in this litigation  
 does not constitute a waiver of any privilege or protection  
 from disclosure, including attorney-client privilege and  
 work-product protection, in this or any other federal or  
 state proceeding.  
  
 2. The producing party may at any time give written notice of  
 a claim of privilege over any produced material. Within  
 7 days of such notice, the receiving party shall (i) return,  
 sequester, or destroy the material and any copies, and  
 (ii) take reasonable steps to retrieve the material from  
 any person to whom it was disclosed.  
  
 3. The receiving party may challenge the privilege claim under  
 FRCP 26(b)(5)(B) by motion within 14 days of the notice.  
  
 4. No party need conduct any specific level of pre-production  
 privilege review to invoke this Order's protections. The  
 Court enters this Order pursuant to FRE 502(d), which  
 supersedes the FRE 502(b) inadvertence-and-reasonable-steps  
 inquiry.  
  
So Ordered.  
```  
  
### 4. Privilege log requirements  
  
Privilege logs in ESI cases typically use a "metadata" or "categorical" approach. Counsel should negotiate (a) field-level descriptions, (b) treatment of email threads (single-entry or per-message), (c) treatment of attachments, and (d) categorical descriptions for high-volume privileged communications (e.g., all internal-counsel quality-assurance emails in a defined period). See File 22 for full treatment.  
  
---  
  
## I. Spoliation Issues Common in FCRA Cases  
  
FCRA defendants have several routine practices that produce spoliation risk:  
  
### 1. Routine destruction of ACDV records after retention period  
  
Many CRAs and furnishers retain ACDV records for limited periods (e.g., 18–24 months) under their internal data-retention policies. Where the consumer's dispute predates the policy's destruction window, an ACDV may be unavailable when suit is filed. The duty to preserve under Rule 37(e) overrides the routine retention period once the duty attaches — typically with the dispute itself. Plaintiffs should accordingly:  
  
- Issue litigation-hold demands at or before the second dispute.  
- Identify in the hold the specific ACDV transmissions to preserve.  
- In discovery, demand production of all ACDVs and require an affidavit identifying any ACDVs lost, the date lost, and the reason.  
  
### 2. Email retention  
  
Microsoft 365 and Google Workspace allow per-mailbox retention with default policies. Many companies retain mail for 30, 90, or 365 days unless the user manually preserves. Failure to suspend retention upon a hold is a frequent Rule 37(e) failure.  
  
### 3. Voicemail and recorded-call destruction  
  
Call-center voice recordings have very short retention (often 90 days). Voicemail is sometimes deleted on access. Where the consumer interacted with the defendant by phone, the litigation hold should immediately suspend voice-recording and voicemail destruction.  
  
### 4. Ephemeral and disappearing-message platforms  
  
Slack, Teams, and similar platforms can be configured with auto-deletion. Mobile platforms (Signal, default-disappearing iMessage settings) are particularly risky. The hold must reach IT administrators of these platforms.  
  
### 5. Database overwrites  
  
Some CRA matching pipelines overwrite intermediate results. Where the consumer's "match" history is at issue, the hold must extend to the intermediate pipeline output.  
  
### 6. Adverse-inference and curative relief  
  
Under Rule 37(e)(2), an adverse-inference instruction requires "intent to deprive." Curative measures under (e)(1) — preclusion of testimony, exclusion of evidence, allowance of secondary evidence, additional discovery, fee-shifting — require only prejudice. Plaintiffs should frame motions in the alternative.  
  
### 7. MDL and aggregated-case decisions  
  
Where the same defendant has been the subject of MDLs or multiple FCRA actions, prior spoliation rulings can establish a pattern relevant to willfulness under *Safeco*. Pull (via PACER) any prior orders from MDL transferee courts that ruled on ESI preservation. Cite as persuasive authority on the same defendant's preservation obligations.  
  
---  
  
## See Also  
  
- **File 01 — FCRA discovery strategy overview.**  
- **File 02 — Plaintiff written discovery to CRAs**: RFPs that incorporate the ESI scope categories in Section B.  
- **File 03 — Plaintiff written discovery to furnishers**: RFPs that incorporate the ESI scope categories in Section C.  
- **File 05 — Defense-side ESI**: defendant-perspective preservation and production.  
- **File 06 — Subpoenas and third-party discovery**: ESI subpoenas to specialty CRAs, vendors, and outsourced dispute processors.  
- **File 07 — 30(b)(6) deposition topics**: deposition topics for CRA and furnisher IT, data-quality, and dispute-resolution witnesses; foundational for database queries in Section G.  
- **File 08 — Protective orders and meet-confer**: confidentiality framework that supports the ESI protocol.  
- **File 11 — FCRA discovery case law**: *Zubulake*, *Cushman*, *Safeco*, and Rule 37(e) authorities.  
- **File 18 — Pre-suit informal discovery**: the dispute and FOIA work that feeds preservation triggers.  
- **File 22 — Privilege logs** (forthcoming): privilege-log mechanics referenced in Section H.  
