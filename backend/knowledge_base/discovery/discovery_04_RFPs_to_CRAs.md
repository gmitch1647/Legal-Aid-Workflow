# Sample Requests for Production to Consumer Reporting Agencies — Plaintiff Side

**Topic:** Plaintiff's Rule 34 Requests for Production of Documents to CRA defendants in FCRA litigation
**Primary statutes:** 15 U.S.C. §§ 1681e, 1681g, 1681i, 1681b; Fed. R. Civ. P. 34
**Regulation:** 12 C.F.R. Part 1022
**Cross-references:**
- `discovery_01_FCRA_Discovery_Strategy_Overview.md`
- `discovery_02_FCRA_Initial_Disclosures.md`
- `discovery_03_Interrogatories_to_CRAs.md`
**Last updated:** May 2026

> **SOURCE DISCIPLINE:** Built from FCRA statute, Regulation V, FRCP, published federal opinions, and CFPB/FTC public guidance. No proprietary practitioner-treatise content reproduced.
>
> **TEMPLATE — ADAPT TO CASE.** All numbered RFPs are sample templates. Rule 34 does not impose a numerical limit, but proportionality under Rule 26(b)(1) (as amended December 1, 2015) constrains scope. Counsel must tie each request to a specific FCRA element.

---

## Preamble — Definitions, Instructions, and Production Format

```
TEMPLATE — ADAPT TO CASE

DEFINITIONS

[Incorporate the definitions from the interrogatory set: "You,"
"[CRA]," "consumer report," "plaintiff's file," "dispute," "matching
algorithm," "ACDV," "relevant time period."]

ADDITIONAL DEFINITIONS

1. "Document" has the broadest meaning consistent with Rule 34(a)(1)
 and includes ESI, drafts, embedded metadata, hard-copy originals,
 audio and video files, and source code.

2. "Communication" means any transmission of information between
 two or more persons, including email, instant message, SMS,
 Slack, Microsoft Teams, voicemail, recorded telephone calls,
 internal memoranda, and electronic ticket-system entries.

3. "Source code" means human-readable computer programming
 instructions, in any computer programming language, including
 inline comments and version-control commit messages, used to
 implement any matching algorithm, file-assembly procedure, or
 dispute-handling procedure.

INSTRUCTIONS

A. Produce documents in their native electronic format with all
 metadata preserved. For documents originally created on paper,
 produce as searchable PDF with corresponding load file.

B. Produce email in native format (.msg or .pst) with full
 metadata, including sent/received timestamps, BCC fields,
 and attachments.

C. For each document withheld on privilege grounds, provide a
 privilege log compliant with Rule 26(b)(5)(A) identifying
 the date, author, recipients, subject matter, and basis
 for the claim.

D. Produce documents in a unified Bates-numbered production
 accompanied by a production log identifying the custodian(s)
 from whom each document was collected.

E. Source code, if produced, shall be produced pursuant to the
 source-code review protocol set forth in the operative
 Protective Order.
```

---

## Topic A — Consumer's File and Disclosure History (RFPs 1–10)

**1.** All documents constituting plaintiff's file as defined in 15 U.S.C. § 1681g(a), including all information of which any notation is in plaintiff's file, regardless of the source or medium of storage.

*Why it matters:* The complete file — broader than a consumer disclosure. *See* § 1681g(a) ("all information in the consumer's file at the time of the request"). Courts have construed "file" broadly to include metadata, system flags, and back-end notations not visible on the consumer disclosure.

**2.** All consumer disclosures, file disclosures, or other documents you furnished to plaintiff or any representative of plaintiff during the relevant time period.

*Why it matters:* Establishes the disclosure timeline and may reveal differences between successive disclosures (indicating data changes the CRA must explain).

**3.** All documents reflecting every consumer report you issued concerning plaintiff during the relevant time period, including the date, the subscriber, the certified purpose, and the contents of each report.

*Why it matters:* Foundational. Identifies every third party who received plaintiff's report — essential for damages and impermissible-purpose claims.

**4.** All documents reflecting every "soft inquiry," pre-screen, or non-consumer-initiated review of plaintiff's file during the relevant time period.

*Why it matters:* Inquiries that do not appear on a consumer disclosure may nonetheless reflect impermissible access.

**5.** All documents reflecting plaintiff's complete dispute history with you, including all initial dispute submissions, all responses, all reinvestigation results, and all internal notes, codes, or annotations.

*Why it matters:* Plaintiff-specific dispute file. Frequently the single most important production.

**6.** All documents and communications between you and any furnisher relating to plaintiff or to any account or item appearing in plaintiff's file.

*Why it matters:* Reaches direct-channel communications that bypass the ACDV system.

**7.** All documents reflecting the addition, modification, or deletion of any tradeline, public record, or other item in plaintiff's file, including the date of each event, the source, and the agent or automated process responsible.

*Why it matters:* Establishes change-history. Many CRA systems retain detailed audit logs not visible on consumer disclosures.

**8.** All documents reflecting any "consumer statement," dispute statement, or fraud or active-duty alert appearing or having appeared in plaintiff's file.

*Why it matters:* Statements consumers add are sometimes truncated, lost, or not transmitted to subscribers.

**9.** All documents reflecting plaintiff's enrollment in any service offered by you, including credit-monitoring, identity-theft protection, or score-access services, and any communications between you and plaintiff regarding such services.

*Why it matters:* CRAs frequently monetize the consumer relationship; the existence of a paid relationship can be relevant to damages and to the CRA's knowledge of the disputed item.

**10.** All documents reflecting any internal flag, score, or characterization of plaintiff or plaintiff's file (e.g., "high risk," "litigation hold," "VIP," "fraud victim," "dispute repeat").

*Why it matters:* Internal characterizations often reveal CRA awareness of plaintiff's situation and prior disputes.

---

## Topic B — Matching Algorithm Documentation (RFPs 11–20)

This is the highest-stakes RFP topic. The matching algorithm is the procedural artifact that determined whether the disputed information was attributed to plaintiff in the first place. Production should follow the source-code protocol discussed in the dedicated section below.

**11.** All technical specifications, design documents, and architecture diagrams describing the matching algorithm used to attach incoming furnisher data to consumer files during the relevant time period.

*Why it matters:* High-level documentation, less sensitive than source code, often sufficient for an expert opinion on reasonableness. Start here.

**12.** All source code implementing the matching algorithm, including all versions in use during the relevant time period.

*Why it matters:* Subject to source-code review protocol. The actual implementation often differs from the documentation, and the difference can be dispositive.

**13.** All documents reflecting the partial-match thresholds, identifier weights, scoring rules, and tie-breaker logic used by the matching algorithm during the relevant time period.

*Why it matters:* These are the parameters that directly determine the false-positive rate. Williams (matching on first name + last name + DOB only, no SSN) demonstrates the stakes.

**14.** All documents reflecting changes, updates, or revisions to the matching algorithm during the relevant time period, including the date of each change, the substantive nature of the change, the business or compliance reason for the change, and the person(s) responsible for approving the change.

*Why it matters:* Establishes the version in use at the time of plaintiff's events. May reveal changes made in response to litigation or regulatory action.

**15.** All testing, validation, or quality-assurance documentation related to the matching algorithm, including any false-positive rates, false-negative rates, mixed-file rates, or similar metrics computed during the relevant time period.

*Why it matters:* Internal quality data is the single most powerful pattern-evidence category. Often shows the CRA knew its matching produced material error rates.

**16.** All internal studies, analyses, or reports during the relevant time period addressing the rate, frequency, or impact of mixed files in your databases.

*Why it matters:* Notice and willfulness evidence. *Safeco* willfulness standard.

**17.** All communications during the relevant time period between or among employees, contractors, or vendors of yours discussing the accuracy, performance, or limitations of the matching algorithm.

*Why it matters:* Internal candid assessments are often more revealing than official documentation. Email and Slack/Teams searches are essential.

**18.** All decision logs, exception logs, manual-review queues, or similar records reflecting matching decisions made by the matching algorithm or by human reviewers during the relevant time period.

*Why it matters:* Individual matching decisions affecting plaintiff and similar consumers.

**19.** All documents describing the data fields used by the matching algorithm, including (a) field names, (b) source(s), (c) standardization or cleansing applied, and (d) minimum match thresholds.

*Why it matters:* Operationalizes the algorithm in concrete terms reviewable by a non-source-code expert.

**20.** All documents reflecting any process by which the matching algorithm is re-applied or re-evaluated when a consumer dispute alleges that information was incorrectly matched.

*Why it matters:* The "re-matching" question. Often the dispute pipeline never returns to the matching layer.

---

## Topic C — Dispute Records: ACDVs, e-OSCAR, Investigation Files (RFPs 21–30)

**21.** All ACDV transmissions, including e-OSCAR records, sent by you to any furnisher in connection with any dispute submitted by plaintiff during the relevant time period.

*Why it matters:* The precise transmission to the furnisher. Critical for furnisher claims and for the *Cushman* analysis of whether the dispute was accurately conveyed.

**22.** All ACDV responses, including e-OSCAR records, received by you from any furnisher in connection with any dispute submitted by plaintiff during the relevant time period.

*Why it matters:* The furnisher's response — verification code, free-text narrative, attached documentation (if any).

**23.** All documents reflecting plaintiff's written dispute submissions, including (a) the original dispute correspondence as received by you, (b) any envelope, fax cover sheet, or transmittal metadata, (c) any documents attached to the dispute by plaintiff, and (d) any electronic system entries reflecting receipt and intake.

*Why it matters:* Establishes what plaintiff actually communicated, against which the dispute-code translation can be measured.

**24.** All internal notes, comments, free-text fields, or annotations created by your agents in connection with plaintiff's disputes.

*Why it matters:* Agent notes often reveal the actual reasoning (or lack thereof) behind a dispute disposition.

**25.** All recordings or transcripts of telephone communications between plaintiff and your representatives during the relevant time period.

*Why it matters:* CRA call centers routinely record. The recordings often capture admissions and inconsistencies.

**26.** All documents reflecting the dispute-handling agent(s) assigned to plaintiff's disputes, including employee identification, training records, performance evaluations, and disciplinary history.

*Why it matters:* Establishes the qualifications and supervision of the specific agents. *Cf. Hinkle*.

**27.** All documents reflecting the time spent by your agents on each step of plaintiff's disputes (intake, coding, transmission, response review, posting, consumer notification).

*Why it matters:* Per-dispute time is often dispositive on reasonableness.

**28.** All documents reflecting the dispute-handling queue, workflow, or productivity metrics in effect at the time plaintiff's disputes were processed.

*Why it matters:* System-level constraints that shaped the individual handling.

**29.** All documents and communications relating to consumer-supplied documents attached to plaintiff's disputes, including any indication of whether and how those documents were reviewed and whether and how they were transmitted to any furnisher.

*Why it matters:* Documents are the linchpin of *Cushman*'s reasonable-reinvestigation analysis.

**30.** All documents reflecting any review or audit of plaintiff's dispute file conducted at any time, whether in response to litigation, regulatory inquiry, or internal quality assurance.

*Why it matters:* Subsequent reviews often reveal the CRA's own recognition of inadequate handling.

---

## Topic D — Furnisher Subscriber Agreements and Certifications (RFPs 31–37)

**31.** All subscriber agreements between you and any furnisher whose information appeared in plaintiff's file during the relevant time period, including all amendments, addenda, and exhibits.

*Why it matters:* Establishes the contractual baseline for furnisher representations and CRA enforcement.

**32.** All certifications, representations, or warranties provided by such furnishers regarding accuracy, permissible purpose, dispute-response duties, or compliance with the FCRA.

*Why it matters:* The compliance representations are the front-end accuracy safeguard.

**33.** All documents reflecting your on-boarding of new furnishers during the relevant time period, including the procedures applied to verify the furnisher's identity, business purpose, and compliance posture.

*Why it matters:* On-boarding rigor is the threshold permissible-purpose safeguard.

**34.** All documents reflecting your audits, reviews, or quality assessments of any furnisher's data quality or dispute-response quality during the relevant time period.

*Why it matters:* Ongoing oversight.

**35.** All documents reflecting suspensions, terminations, restrictions, or warnings issued by you to any furnisher during the relevant time period for reasons relating to data quality, dispute-response quality, or FCRA compliance.

*Why it matters:* Establishes the CRA's awareness of furnisher misconduct.

**36.** All communications between you and any furnisher relating to systemic data-quality or dispute-response issues, as distinct from communications about individual consumer disputes.

*Why it matters:* Systemic-issue communications are often more probative than individual-dispute records.

**37.** All documents reflecting fee, pricing, or rebate structures between you and furnishers, to the extent those structures are tied to data submission volume, dispute-response performance, or similar metrics.

*Why it matters:* Economic incentives shape behavior; CRA fee structures sometimes reward furnishers for high-volume reporting even at the cost of accuracy.

---

## Topic E — Policies and Procedures (RFPs 38–45)

**38.** All written policies and procedures in effect during the relevant time period governing data accuracy, file assembly, or compliance with 15 U.S.C. § 1681e(b).

*Why it matters:* Foundational. Defendant must produce or formally deny existence.

**39.** All written policies and procedures in effect during the relevant time period governing consumer dispute handling, reinvestigation, and compliance with 15 U.S.C. § 1681i.

*Why it matters:* Foundational. Frame the *Hinkle* and *Cushman* arguments.

**40.** All written policies and procedures in effect during the relevant time period governing matching, file segmentation, and prevention of mixed files.

*Why it matters:* Operational policies that implement § 1681e(b) for the matching context.

**41.** All written policies and procedures in effect during the relevant time period governing subscriber on-boarding, permissible-purpose verification, and compliance with 15 U.S.C. §§ 1681b(f) and 1681e(a).

*Why it matters:* Permissible-purpose framework.

**42.** All written policies and procedures in effect during the relevant time period governing identity theft, blocking of fraudulent information under 15 U.S.C. § 1681c-2, and handling of FTC Identity Theft Reports.

*Why it matters:* Identity-theft-specific procedures.

**43.** All written policies and procedures in effect during the relevant time period governing handling of consumer-supplied documents, including retention, transmission to furnishers, and review by dispute-handling agents.

*Why it matters:* Document handling is *Cushman*'s focal point.

**44.** All written policies and procedures in effect during the relevant time period governing dispute coding, including the dispute-code translation table and the criteria for selecting a code.

*Why it matters:* Code selection is where consumer narratives are most often lost.

**45.** All training materials, scripts, decision trees, or job aids used in training dispute-handling, file-assembly, or subscriber-management personnel during the relevant time period.

*Why it matters:* Training materials often reveal a much less rigorous practice than the formal policies describe.

---

## Topic F — Internal Audits and Quality Reviews (RFPs 46–52)

**46.** All internal audit reports, quality-assurance reviews, and process-improvement documents during the relevant time period addressing the accuracy of consumer reports, the quality of dispute handling, or compliance with the FCRA.

*Why it matters:* Self-assessments. Highly probative on willfulness and on the existence and scope of known problems.

**47.** All external audit reports, including reports by independent consultants, accounting firms, or compliance vendors, during the relevant time period addressing matters identified in the preceding RFP.

*Why it matters:* External assessments are sometimes more candid and may already be in the hands of regulators.

**48.** All documents reflecting key performance indicators, metrics, or dashboards used during the relevant time period to monitor the accuracy of consumer reports or the quality of dispute handling.

*Why it matters:* Ongoing internal metrics. Often discoverable in data-warehouse format.

**49.** All documents reflecting the percentage of consumer disputes resulting in (a) deletion, (b) modification, (c) verification as reported, and (d) other dispositions, broken down by data type, furnisher, and time period.

*Why it matters:* Macro-statistics frame reasonableness.

**50.** All documents reflecting analysis, root-cause investigation, or remediation of mixed-file errors, criminal-record mismatches, or identity-theft-related errors during the relevant time period.

*Why it matters:* Specific to the most common claim categories.

**51.** All documents reflecting consumer satisfaction surveys, dispute-handling surveys, or NPS-style measurements conducted during the relevant time period.

*Why it matters:* Consumer-facing measurement, sometimes captures dissatisfaction the CRA has not addressed.

**52.** All documents reflecting whistleblower complaints, internal compliance reports, or audit findings during the relevant time period regarding alleged deficiencies in matching, dispute handling, or permissible-purpose verification.

*Why it matters:* Whistleblower and compliance-hotline records are often candid and revealing.

---

## Topic G — Other-Consumer Complaints and Pattern Evidence (RFPs 53–58)

Pattern evidence is admissible under Fed. R. Evid. 404(b)(2) to show notice, knowledge, willfulness, and absence of mistake — directly responsive to *Safeco*'s reckless-disregard standard. Frame requests narrowly by error type and time period to avoid overbreadth objections.

**53.** All consumer complaints during the relevant time period alleging an inaccuracy of the same type as the inaccuracy alleged by plaintiff (e.g., mixed file involving a common name; criminal-record mismatch attributable to name + DOB matching; failure to block identity-theft-related information under § 1681c-2).

*Why it matters:* Pattern evidence keyed to plaintiff's claim type. Avoid asking for "all complaints."

**54.** All CFPB consumer complaints involving you during the relevant time period that are categorized as relating to (a) "incorrect information on your report," (b) "problem with a credit reporting company's investigation into an existing problem," or (c) similar CFPB taxonomy categories applicable to the type of error alleged by plaintiff.

*Why it matters:* The CFPB Consumer Complaint Database is public; this request anchors that public data to the CRA's internal records.

**55.** All lawsuits, demand letters, arbitration claims, and similar litigation matters filed against you during the relevant time period alleging an inaccuracy of the same type as the inaccuracy alleged by plaintiff.

*Why it matters:* Prior litigation establishes notice. *Cf. Williams v. First Advantage* (admitting prior identical-error evidence).

**56.** For each complaint, CFPB complaint, or lawsuit identified in the preceding RFPs, all documents reflecting your investigation, response, and any corrective action.

*Why it matters:* The CRA's response demonstrates whether it treats these complaints as one-offs (negligence) or systemic problems requiring remediation (willfulness).

**57.** All documents reflecting any internal analysis aggregating consumer complaints, CFPB complaints, or lawsuits to identify systemic patterns or trends.

*Why it matters:* Aggregate analysis is rare; its absence is itself probative of perfunctory complaint handling.

**58.** All documents reflecting changes to your matching, dispute-handling, or subscriber-management procedures made during the relevant time period in response to consumer complaints, CFPB complaints, or lawsuits.

*Why it matters:* Subsequent remedial measures are admissible under FRE 407 for purposes other than negligence, including to show feasibility, notice, and the existence of a less-risky alternative procedure — directly relevant to the *Safeco* willfulness analysis.

---

## Topic H — CFPB and FTC Supervisory Correspondence (RFPs 59–64)

The CFPB has supervisory authority over the larger CRAs under 12 U.S.C. § 5514 (the "larger participants" rule, 12 C.F.R. § 1090.104). Supervisory examinations produce significant documentation. The CFPB and FTC have also brought enforcement actions producing public consent orders. Discovery of the CRA's communications with regulators is generally permitted subject to confidentiality protocols.

**59.** All CFPB Civil Investigative Demands (CIDs), Notice and Opportunity to Respond and Advise (NORA) letters, and similar pre-enforcement communications received by you during the relevant time period.

*Why it matters:* Reflects regulatory awareness of specific deficiencies.

**60.** All responses by you to the foregoing CIDs and NORA letters.

*Why it matters:* The CRA's responses often reveal the substance of regulator concerns.

**61.** All supervisory examination reports, supervisory letters, Matter Requiring Attention (MRA) letters, and similar supervisory communications from the CFPB to you during the relevant time period concerning accuracy, dispute handling, or permissible-purpose verification.

*Why it matters:* MRAs identify specific procedural deficiencies regulators have already flagged. Supervisory information is "confidential supervisory information" — but discoverable subject to protective order.

**62.** All responses by you to the supervisory communications identified in the preceding RFP, including all corrective action plans and progress reports.

*Why it matters:* CRA representations to regulators are often inconsistent with positions taken in litigation.

**63.** All consent orders, stipulations, and settlements between you and the CFPB or the FTC during the relevant time period, and all communications relating to negotiation of those orders.

*Why it matters:* Public orders are already public; the negotiation history may reveal contested factual issues.

**64.** All communications with any state attorney general, state regulator, or state agency during the relevant time period concerning accuracy, dispute handling, or permissible-purpose verification.

*Why it matters:* State enforcement supplements federal supervision.

---

## Topic I — Communications with Similarly Situated Furnishers (RFPs 65–68)

**65.** All communications between you and any of the following furnishers during the relevant time period regarding accuracy of furnished data, dispute response quality, or compliance with the FCRA: [list furnishers involved in plaintiff's case and known repeat-furnisher defendants].

*Why it matters:* Furnisher-specific communications often reveal the CRA's awareness of specific data-quality problems.

**66.** All communications with industry trade associations (including the Consumer Data Industry Association — CDIA) during the relevant time period regarding the matching, dispute-handling, or permissible-purpose topics at issue in this case.

*Why it matters:* Industry-wide discussions reveal what was "industry standard" — a defense the CRA will raise.

**67.** All documents reflecting your participation in industry working groups or committees during the relevant time period addressing accuracy, dispute handling, or matching.

*Why it matters:* Participation can show awareness of best practices the CRA chose not to adopt.

**68.** All Metro 2 Format Task Force or similar documents reflecting industry-standard data-furnishing formats and the implementation of those formats during the relevant time period.

*Why it matters:* Metro 2 is the dominant furnisher data format; its limitations and recent revisions shape what is feasible.

---

## Topic J — Training Materials and Corporate Communications (RFPs 69–75)

**69.** All training materials, including PowerPoint decks, training videos, written manuals, e-learning modules, and quizzes, used during the relevant time period to train (a) dispute-handling agents, (b) data-quality personnel, (c) subscriber-relationship managers, and (d) compliance personnel.

*Why it matters:* Training reflects the operating standard.

**70.** All documents reflecting performance metrics, productivity quotas, or bonus structures applicable to dispute-handling agents during the relevant time period.

*Why it matters:* Per-dispute productivity quotas drive perfunctory review. *Cf. Hinkle*-progeny cases.

**71.** All scripts, decision trees, or job aids used by dispute-handling agents during the relevant time period.

*Why it matters:* Scripts often contain language designed to discourage further disputes or to channel consumers into particular code categories.

**72.** All organizational charts, headcount reports, and staffing plans for the dispute-handling, data-quality, and compliance functions during the relevant time period.

*Why it matters:* Resource allocation is directly relevant to reasonableness of procedures.

**73.** All communications among senior officers and directors during the relevant time period concerning accuracy of consumer reports, the volume or composition of consumer disputes, or compliance with the FCRA.

*Why it matters:* Senior-level awareness is the hallmark of willfulness.

**74.** All documents reflecting board-of-directors or audit-committee discussions during the relevant time period concerning matters identified in the preceding RFP.

*Why it matters:* Board-level awareness is the strongest form of corporate notice.

**75.** All public statements, press releases, marketing materials, and investor communications during the relevant time period describing your accuracy, dispute-handling, or matching procedures.

*Why it matters:* Public representations contradicting internal reality are powerful impeachment material and may support willfulness as well as state-law fraud or UDAP theories.

---

## Source-Code and Algorithm Production — The Central Discovery Battle

Production of the matching algorithm — particularly its source code — is the single most-litigated discovery dispute in modern FCRA cases. The CRA's standard objection invokes trade secret under Rule 26(c)(1)(G); the plaintiff's standard response is a tiered protective order with on-site / clean-room review. Both sides should expect to brief the issue and, in many cases, present it to a magistrate judge or special master.

### Three-Tier Protective Order Structure

A well-drafted protective order should include three confidentiality tiers:

1. **"Confidential."** Ordinary business records subject to standard restrictions on disclosure to outsiders.
2. **"Highly Confidential — Attorneys' Eyes Only" (AEO).** Sensitive business records (subscriber lists, audit results, financial data) restricted to outside counsel of record, identified support staff, and identified experts.
3. **"Highly Confidential — Source Code."** Source code, matching-algorithm parameters, and similar technical materials restricted to outside counsel, two or three identified experts, and one designated paralegal. Reviewed only on a standalone non-networked computer in a designated review room.

### Source-Code Review Protocol — Standard Elements

- **Location:** Producing party's outside counsel's office (or a neutral third-party vendor's review room).
- **Equipment:** Standalone non-networked computer; no Internet access; no removable media; no cameras or smartphones in the review room.
- **Personnel:** Identified by name in advance; producing party has a defined window (commonly 10–14 business days) to object to a particular reviewer on competitive grounds; objection must be substantive (specific employment or consulting relationship), not merely "competitor."
- **Note-taking:** Permitted on paper, but notes are themselves designated source-code-tier and subject to the same restrictions.
- **Printing:** Limited to a defined number of pages (commonly 100–500 lines per session), Bates-stamped on production, retained in the secure facility.
- **Use:** Only for purposes of this litigation; no use in any other matter without further court order.
- **Destruction:** At case conclusion, all source-code materials returned or destroyed, with sworn certification.
- **Cross-use:** Permit, by stipulation, use in clearly related cases to avoid duplicative source-code production.

### Authority for Production

The case law on source-code discovery in FCRA cases is not voluminous, but the broader body of source-code-discovery authority (in patent cases, trade-secret cases, and algorithmic-discrimination cases) is well-developed and largely favorable to production under protective order. Plaintiffs should cite:
- The Sedona Conference's "Commentary on the 2015 Federal Rule Amendments," particularly on proportionality and on the "parties' relative access to relevant information" factor.
- Patent-case precedent on source-code protective-order protocols (the same protocols translate cleanly to FCRA matching algorithms).
- *Williams v. First Advantage*, supra, where the matching procedure (name + DOB without SSN) was the central evidence; this case effectively endorses production of the kind of detailed matching documentation plaintiff will seek.

### Strategic Notes

- **Negotiate the PO in parallel with the Rule 26(f) report.** The earlier the PO is in place, the less leverage the CRA has to block production.
- **Insist on technical specifications first, source code second.** A well-prepared expert can often render an opinion from architecture documents and parameter tables without ever seeing the underlying source code, which may avoid the source-code fight entirely.
- **Identify experts early.** Producing party will object to experts who consult or work for competitors. Identify and clear experts during the meet-and-confer rather than under deadline pressure.
- **Demand version control.** The matching algorithm in use when plaintiff's events occurred may differ from the current version. Insist on production of the specific version applicable to plaintiff's case, identified by build number or commit hash.
- **Build a paper trail of meet-and-confer.** When (not if) the source-code fight goes to the magistrate, the prevailing party will be the one who has documented good-faith effort.

### Pitfalls

- **Boilerplate "trade secret" assertions.** Insist that the producing party identify, with specificity, which elements of the matching algorithm are claimed as trade secret and what competitive harm production would cause. Generic assertions are insufficient under Rule 26(c).
- **Source-code tier swallowing the production.** CRAs sometimes designate everything as source-code tier, including ordinary documentation. Insist on a meet-and-confer to right-size the designations and reserve the right to challenge over-designation.
- **Vendor-owned components.** CRAs sometimes use third-party matching vendors and disclaim possession of vendor source code. If the vendor is a co-defendant or a Rule 45 target, pursue production directly. If the CRA "controls" the vendor product through contract, push for production from the CRA itself under Rule 34(a)(1) ("possession, custody, or control").

---

## Limits and Objections — Anticipating and Responding

The objection framework parallels that for interrogatories (see `discovery_03_Interrogatories_to_CRAs.md`). Key RFP-specific points:

### Proportionality

Frame each RFP narrowly by (a) document category, (b) time period, (c) data type, and (d) tie to a specific FCRA element. Avoid open-ended "all documents relating to" formulations where possible.

### Trade Secret

Addressed above for matching algorithms. For subscriber agreements, internal audits, and similar materials, the standard "Confidential" or "AEO" tiers are normally adequate.

### Burden — ESI

Defense will object that an email-search RFP is unduly burdensome. Plaintiff's response:
- Propose specific custodians, date ranges, and search terms in a Rule 26(f) negotiation.
- Offer to bear reasonable costs of TAR (technology-assisted review) workflow design.
- Insist on transparency in TAR workflow validation (sampling, F1 score targets).

### Privilege / Work Product

The § 1681i reinvestigation is not "in anticipation of litigation"; it is statutorily mandated. Insist on a Rule 26(b)(5)(A)-compliant log.

### "Equally Available" Objection

For CFPB Consumer Complaint Database entries, defense will argue the data is "equally available" to plaintiff via the public database. Response: the public database is anonymized; the CRA's matching of public complaints to internal records is uniquely in its control.

---

## See also

- `discovery_01_FCRA_Discovery_Strategy_Overview.md`
- `discovery_02_FCRA_Initial_Disclosures.md`
- `discovery_03_Interrogatories_to_CRAs.md`
- `discovery_05_Interrogatories_to_Furnishers.md` (planned)
- `discovery_06_RFPs_to_Furnishers.md` (planned)
- `discovery_07_30(b)(6)_Deposition_Topics.md` (planned)
- `discovery_08_Protective_Orders.md` (planned)
- `FCRA_Caselaw_Circuit_Decisions.md`

---

*End of file.*
