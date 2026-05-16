# Sample Interrogatories to Consumer Reporting Agencies — Plaintiff Side

**Topic:** Plaintiff's Rule 33 interrogatories to CRA defendants in FCRA litigation
**Primary statutes:** 15 U.S.C. §§ 1681e, 1681g, 1681i, 1681b; Fed. R. Civ. P. 33
**Regulation:** 12 C.F.R. Part 1022
**Cross-references:**
- `discovery_01_FCRA_Discovery_Strategy_Overview.md`
- `discovery_02_FCRA_Initial_Disclosures.md`
- `discovery_04_RFPs_to_CRAs.md`
**Last updated:** May 2026

> **SOURCE DISCIPLINE:** Built from FCRA statute, Regulation V, FRCP, published federal opinions that routinely quote discovery requests verbatim, and CFPB/FTC public guidance. No proprietary practitioner-treatise content reproduced.
>
> **TEMPLATE — ADAPT TO CASE.** All numbered interrogatories below are sample templates. Rule 33(a)(1) limits a party to 25 interrogatories absent stipulation or court order; counsel must select strategically. Combine related questions where the substance is genuinely subsidiary.

---

## Preamble — Definitions and Instructions

The following definitions and instructions should accompany any interrogatory set served on a CRA:

```
TEMPLATE — ADAPT TO CASE

DEFINITIONS

1. "You," "your," and "[CRA]" mean the named defendant, its parents,
 subsidiaries, predecessors, affiliates, officers, directors, employees,
 agents, and any person acting on its behalf.

2. "Consumer report" has the meaning given in 15 U.S.C. § 1681a(d).

3. "Plaintiff's file" means the entire body of information about plaintiff
 maintained by you, including all information of the type defined in
 15 U.S.C. § 1681g(a) and all metadata, regardless of whether it would
 appear on a consumer disclosure or a consumer report.

4. "Dispute" means any communication from plaintiff or any third party
 notifying you of an inaccuracy or alleged inaccuracy in plaintiff's
 file, whether or not it was coded as a "dispute" in your system.

5. "Matching algorithm" means any procedure, set of rules, software,
 logic, decision tree, or scoring model used by you to determine
 whether incoming furnisher data should be attached to a particular
 consumer file.

6. "ACDV" means an Automated Consumer Dispute Verification form, including
 any e-OSCAR transmission to or from a furnisher.

7. "Relevant time period" means [insert dates — typically 4–6 years
 preceding the events at issue through the present].

INSTRUCTIONS

A. These interrogatories are continuing in nature; supplement under
 Rule 26(e) as additional responsive information becomes available.

B. If you object to any portion of an interrogatory, respond to the
 non-objected portion and identify with specificity the portion
 to which you object.

C. If you assert privilege, provide a privilege log compliant with
 Rule 26(b)(5)(A).

D. Identify all persons by full name, last known address, telephone
 number, and (for current or former employees) title and dates of
 employment.

E. For all software, systems, and procedures, identify by name,
 version, and dates in use.
```

---

## Topic A — General Identification, Corporate Structure, and Custodians (Interrogatories 1–5)

**1.** Identify the full corporate name and principal place of business of every entity that participated in any way in the collection, assembly, evaluation, communication, or distribution of any information in plaintiff's file during the relevant time period.

*Why it matters:* CRAs operate through multiple corporate affiliates (e.g., Trans Union LLC, TransUnion Interactive, Inc., Trans Union of Puerto Rico, Inc.). Pin down the proper defendant and identify potential corporate-veil issues.

**2.** Identify every person who participated in the handling of plaintiff's file or any dispute submitted by plaintiff, including (a) intake agents, (b) reinvestigation agents, (c) supervisors, and (d) quality-control reviewers. For each, state full name, employee ID, title, dates of employment, and current employment status.

*Why it matters:* Foundational. Identifies the universe of fact-witness depositions. Defense will routinely respond with role categories only; press for individual names.

**3.** Identify every records-custodian or system-of-record administrator responsible during the relevant time period for (a) consumer file records, (b) dispute records, (c) ACDV/e-OSCAR records, (d) subscriber records, (e) matching-algorithm documentation, (f) training records, and (g) consumer complaint records.

*Why it matters:* Sets up subsequent Rule 30(b)(6) deposition designations and ESI-discovery sweeps.

**4.** State your record-retention schedule for each category identified in Interrogatory 3, including the retention period, format of storage, and any destruction or purge policies.

*Why it matters:* Establishes whether responsive material still exists and supports any spoliation argument. Many CRAs purge dispute records after 25 months despite extended statutes of limitations.

**5.** Identify each Rule 30(b)(6) designee you intend to or are likely to designate for the topics of (a) file assembly, (b) matching procedures, (c) reinvestigation procedures, (d) subscriber management, and (e) consumer complaints and prior litigation.

*Why it matters:* Forces early disclosure of corporate witnesses and informs deposition sequencing.

---

## Topic B — Matching Algorithm and File Assembly (Interrogatories 6–15)

This topic targets the heart of every mixed-file and identity-confusion case. Authority for ordering production of matching procedures includes *Williams v. First Advantage Background Servs. Corp.*, 947 F.3d 735 (11th Cir. 2020) (matching procedures using only name and date of birth without SSN held willfully unreasonable for a common name). The FTC's "40 Years of Experience with the Fair Credit Reporting Act" (FTC Staff Report, July 2011) repeatedly criticizes name-only matching and supports the relevance of this discovery.

**6.** Describe in detail the procedure by which information received from a furnisher is matched to a consumer file, including all data fields used, all weights or scores assigned to those fields, all partial-match thresholds, and all tie-breaker rules.

*Why it matters:* Foundational matching question. Expect defendant to claim trade secret; respond with protective-order offer and citation to Williams.

**7.** State each version of your matching algorithm in use during the relevant time period, the dates each version was in use, and the date and nature of every change.

*Why it matters:* Establishes whether the algorithm in use when plaintiff's file was assembled differs from the current algorithm — affects causation and prospective-relief arguments.

**8.** For each data field used in matching incoming furnisher data to consumer files, identify (a) the field name, (b) the source(s) from which you receive that field, (c) any standardization or cleansing routine applied to the field, and (d) the minimum match threshold required for that field to count as a match.

*Why it matters:* Pins down whether name-only or name+partial-SSN matching was used. Critical in mixed-file cases.

**9.** Describe each procedure you use to prevent the creation of mixed files (i.e., files containing information about more than one consumer).

*Why it matters:* Direct § 1681e(b) inquiry into reasonableness of procedures. Defense often claims "industry standard" — get specifics.

**10.** Identify each study, audit, internal report, or external publication during the relevant time period that analyzed the frequency or rate of mixed files in your databases, and for each, state the conclusion reached and the date.

*Why it matters:* Notice evidence supporting willfulness under *Safeco Ins. Co. of Am. v. Burr*, 551 U.S. 47 (2007). Pattern-evidence foundation.

**11.** Describe your procedure, if any, for re-evaluating whether information was correctly matched to a consumer file following receipt of a consumer dispute that alleges the information does not belong to the consumer.

*Why it matters:* Plaintiffs commonly find that the dispute pipeline never returns to the matching layer — the dispute is sent to the furnisher, the furnisher confirms its records, and the matching error is never reviewed. *Cushman v. Trans Union Corp.*, 115 F.3d 220 (3d Cir. 1997) (reinvestigation must address the dispute as raised, not merely re-verify with the furnisher).

**12.** State whether the matching algorithm used in plaintiff's case used Social Security Number, and if so, whether full-SSN or partial-SSN matching was required.

*Why it matters:* Direct factual question keyed to plaintiff's case. Williams identifies SSN as a critical disambiguating identifier for common-name consumers.

**13.** Identify by name and version every software system or vendor product used in your matching, file-assembly, and de-duplication processes during the relevant time period.

*Why it matters:* Identifies third-party vendors who may have additional documents and may be deposed under Rule 45.

**14.** Describe your procedure for handling so-called "header" or "trailer" information from furnisher tapes, including how header information (consumer name, address, SSN, DOB) is reconciled when it conflicts with the information already on file for the consumer.

*Why it matters:* Conflicts in header information are a leading source of mixed files; how the CRA reconciles them is dispositive on reasonable-procedures inquiry.

**15.** Identify each instance during the relevant time period in which you affirmatively decided not to attach a furnisher's tradeline to a consumer's file because the matching identifiers were insufficient, and state the criteria used to make that decision.

*Why it matters:* Establishes the negative — the standards the CRA *will* enforce, against which the standards it failed to enforce in plaintiff's case can be measured.

---

## Topic C — File Preparation and Accuracy Procedures (§ 1681e(b)) (Interrogatories 16–20)

**16.** Describe each procedure you follow to assure the maximum possible accuracy of information appearing in consumer reports, as required by 15 U.S.C. § 1681e(b).

*Why it matters:* The core statutory inquiry. Expect a high-level narrative response; follow up with Rule 30(b)(6) and document requests.

**17.** Identify each step you take, before adding new information to a consumer file, to verify that the source of the information is reputable.

*Why it matters:* *Sarver v. Experian Info. Solutions*, 390 F.3d 969 (7th Cir. 2004), permits a CRA to rely on furnishers it "reasonably believes [are] reputable" absent notice of systemic problems — the converse is that notice of problems destroys this defense.

**18.** Identify every procedure used to detect and correct errors in incoming furnisher data on a population-wide basis, including any statistical sampling, anomaly detection, or audit program.

*Why it matters:* Establishes whether the CRA monitors its own data quality. Absence is probative.

**19.** Describe the procedure, if any, by which you identify consumer reports that may contain information about more than one consumer, prior to delivering the report to a subscriber.

*Why it matters:* Front-end mixed-file detection. Often nonexistent.

**20.** State whether your accuracy procedures vary by data type (e.g., trade-line data, public-record data, collection accounts, employment data, criminal-record data), and describe each variation.

*Why it matters:* Specialty data types — particularly public records and criminal records — have different error profiles and different procedural histories. CFPB and FTC enforcement actions have repeatedly identified public-record matching as deficient.

---

## Topic D — Reinvestigation Procedures (§ 1681i) (Interrogatories 21–35)

This topic is governed by *Cushman v. Trans Union*, 115 F.3d 220 (3d Cir. 1997); *Hinkle v. Midland Credit Mgmt., Inc.*, 827 F.3d 1295 (11th Cir. 2016) (perfunctory automated verification supports willfulness); and the CFPB's enforcement record on dispute-handling procedures, most recently the CFPB's 2025 enforcement complaint against Experian alleging systemic deficiencies in dispute processing.

**21.** Describe in detail your procedure for receiving, recording, coding, and processing a consumer dispute, from initial receipt through final disposition.

*Why it matters:* Establishes the full pipeline and identifies discrete points of failure.

**22.** Identify every dispute code (sometimes called "ACDV dispute code" or "Metro 2 dispute code") used in your dispute system during the relevant time period, and provide the description and translation of each.

*Why it matters:* The dispute-code roster used in e-OSCAR contains roughly two dozen codes — a small set into which every consumer narrative must be shoehorned. Identification of the code set is foundational.

**23.** For each dispute submitted by plaintiff, state the dispute code(s) assigned, who assigned them, and the date and time of assignment.

*Why it matters:* Plaintiff-specific question. Often reveals that a multi-paragraph dispute was reduced to "not mine" or "incorrect balance."

**24.** Describe the procedure, if any, by which a consumer's written dispute narrative is reviewed by a natural person before a dispute code is assigned.

*Why it matters:* Many CRAs use offshore vendors or low-paid intake agents who spend on the order of seconds per dispute. Establishing the per-dispute review time is critical evidence on reasonableness.

**25.** State the average and median time spent by your agents on the initial intake and coding of a consumer dispute during the relevant time period.

*Why it matters:* Direct quantification of review effort. Frequently below 60 seconds per dispute industry-wide.

**26.** Describe the procedure by which consumer-supplied documents (e.g., court orders, identity-theft reports, account statements) accompanying a dispute are processed, reviewed, and transmitted (or not transmitted) to the furnisher.

*Why it matters:* *Cushman* and its progeny establish that the reasonableness of reinvestigation depends in part on whether available documentation was considered. CRAs frequently fail to transmit attached documents via ACDV.

**27.** Describe each circumstance under which you contact a furnisher by means other than the e-OSCAR / ACDV system in connection with a consumer dispute (e.g., direct telephone call, email, request for documentation).

*Why it matters:* Establishes the limits of the automated system. In identity-theft and mixed-file cases, a phone call would often resolve the dispute — and the absence of such contact is probative.

**28.** Describe each circumstance under which you investigate a consumer dispute independently of the furnisher (e.g., review of original court records in a public-record dispute, comparison of identifying information in the consumer's file to identifying information attached to the disputed tradeline).

*Why it matters:* The "independent investigation" question. CRAs routinely outsource the entire reinvestigation to the furnisher — a practice plaintiffs argue is unreasonable on its face under *Cushman*.

**29.** State the average and median time spent by your agents on the final review of a furnisher's ACDV response before posting the result to the consumer's file.

*Why it matters:* Closes the back end of the pipeline. Often automatic.

**30.** Describe the procedure by which a dispute is escalated, if at all, when the furnisher's ACDV response (a) does not address the dispute as raised by the consumer, (b) provides a verification with no detail, or (c) is internally inconsistent.

*Why it matters:* The "verification" problem under *Hinkle*. Rote verification is often not a reasonable reinvestigation.

**31.** Identify every quality-control or audit procedure applied to consumer-dispute reinvestigations during the relevant time period, including sampling rates, scoring criteria, and corrective-action procedures.

*Why it matters:* Establishes whether the CRA monitors its own dispute-handling and what it has learned.

**32.** State the percentage of consumer disputes during the relevant time period that resulted in (a) deletion, (b) modification, (c) verification as reported, and (d) no change other than addition of a consumer statement.

*Why it matters:* Macro-statistics frame the reasonableness inquiry. High verification-as-reported rates suggest a perfunctory process.

**33.** Identify each circumstance during the relevant time period in which you determined that a dispute had been frivolous or irrelevant under 15 U.S.C. § 1681i(a)(3), and state the criteria used to make that determination.

*Why it matters:* Some CRAs use the "frivolous or irrelevant" exception aggressively to terminate disputes from third-party dispute services. Establishes the practice.

**34.** Describe your procedure for handling repeat disputes by the same consumer regarding the same alleged inaccuracy.

*Why it matters:* Repeat-dispute scenarios are common in identity-theft and mixed-file cases. CRA refusal to revisit prior verifications can show recklessness.

**35.** State whether you have any procedure to notify the consumer of the specific source of information confirming or refuting a disputed item, beyond the generic "verified by furnisher" notice contemplated by 15 U.S.C. § 1681i(a)(6).

*Why it matters:* The notice the consumer receives shapes the next dispute — and an inadequate notice can support a § 1681i(a)(6) violation independent of the underlying accuracy claim.

---

## Topic E — Furnisher Relationship Management (Interrogatories 36–40)

**36.** Identify each furnisher that reported to you any information appearing in plaintiff's file during the relevant time period, and for each, describe the contractual relationship and identify the operative subscriber agreement(s).

*Why it matters:* Foundational for furnisher-specific claims and for subpoenas to non-defendant furnishers.

**37.** Describe each certification, representation, or warranty you require from a furnisher before accepting data, including any certification regarding accuracy and any certification regarding compliance with 15 U.S.C. § 1681s-2(a).

*Why it matters:* § 1681e(a) requires reasonable procedures to ensure that furnishers have a permissible purpose and follow accurate-reporting duties. Subscriber-agreement certifications are central.

**38.** Identify every furnisher whose subscriber privileges you suspended, terminated, or restricted during the relevant time period for reasons relating to data quality, dispute-response quality, or compliance with the FCRA, and state the reasons for each action.

*Why it matters:* Establishes the universe of "problem" furnishers and the CRA's awareness of furnisher-side accuracy problems.

**39.** Describe each audit, review, or quality assessment you performed of a furnisher's data quality or dispute-response quality during the relevant time period.

*Why it matters:* CRAs have at least nominal furnisher-monitoring obligations under § 1681e(a); the existence and rigor of audits informs reasonableness.

**40.** State whether you have any procedure to detect when a furnisher's ACDV responses are inconsistent with the furnisher's prior data reporting (e.g., furnisher reports an account as charged-off, then verifies the account as open and current in response to a dispute).

*Why it matters:* This kind of inconsistency is a red flag for perfunctory furnisher review and should trigger CRA escalation.

---

## Topic F — Permissible Purpose Verification (§ 1681b, § 1681e(a)) (Interrogatories 41–45)

**41.** Identify the permissible purpose (per 15 U.S.C. § 1681b(a)) certified by each subscriber that obtained a consumer report regarding plaintiff during the relevant time period.

*Why it matters:* Direct fact question in any impermissible-purpose case.

**42.** Describe your procedure for verifying, before approving a new subscriber, that the subscriber has a permissible purpose under § 1681b(a) and has the procedures required by § 1681e(a).

*Why it matters:* On-boarding procedures are the front-end safeguard. Often consists of a one-page certification with no field verification.

**43.** Describe your procedure for auditing existing subscribers' compliance with their permissible-purpose certifications, including any random sampling, anomaly detection, or response to flagged pull patterns.

*Why it matters:* Continuing oversight. CFPB enforcement actions have repeatedly flagged inadequate subscriber monitoring.

**44.** Identify every instance during the relevant time period in which you suspended, terminated, or restricted a subscriber's access for reasons relating to permissible-purpose compliance.

*Why it matters:* Pattern evidence and CRA awareness.

**45.** State whether you maintain a log of every consumer-report pull, including the subscriber ID, the date and time, the certified purpose, and any flags or anomalies. If yes, describe the system.

*Why it matters:* Establishes the existence of pull-history data essential to impermissible-purpose claims.

---

## Topic G — Complaints and Prior Litigation Involving Similar Errors (Interrogatories 46–50)

**46.** Identify each lawsuit filed against you during the relevant time period alleging an inaccuracy of the same type as the inaccuracy alleged by plaintiff (e.g., mixed file involving common name; criminal-record mismatch; identity-theft data not blocked).

*Why it matters:* Notice and willfulness evidence. *Cf. Williams v. First Advantage* (admitting evidence of prior identical errors). Frame the request narrowly by error type to avoid overbreadth objections.

**47.** Identify each complaint regarding plaintiff's file or regarding errors of the same type as plaintiff's that you received during the relevant time period from (a) the CFPB Consumer Complaint Database, (b) state attorneys general, (c) the FTC, or (d) any state regulator.

*Why it matters:* Public CFPB complaint data is already public-domain; defendant's discovery of corresponding internal records identifies the universe.

**48.** Describe the procedure by which complaints described in Interrogatory 47 are reviewed, analyzed for systemic patterns, and used to inform changes to your procedures.

*Why it matters:* Process question. Often reveals that complaints are closed individually with no aggregate analysis.

**49.** Identify each settlement, consent order, assurance of voluntary compliance, or regulatory action involving you during the relevant time period that addressed (a) matching procedures, (b) dispute-handling procedures, (c) permissible-purpose verification, or (d) accuracy of public-record reporting.

*Why it matters:* Many of these are publicly available; identification ties them to internal records.

**50.** State whether any of the foregoing complaints, lawsuits, or regulatory actions resulted in changes to your procedures, and describe each change.

*Why it matters:* If yes, prior procedure was deficient (admission). If no, willfulness inference strengthens. Either answer benefits plaintiff.

---

## Topic H — Training and Policies/Procedures (Interrogatories 51–55)

**51.** Identify every written policy or procedure governing dispute handling, matching, file assembly, or permissible-purpose verification in effect during the relevant time period.

*Why it matters:* Foundation for the corresponding RFP. Forces a privilege-log fight if defendant withholds.

**52.** Describe the training provided to dispute-handling agents, including (a) duration, (b) curriculum, (c) testing or certification, (d) refresher training, and (e) the identity of the trainers.

*Why it matters:* CRAs employ many offshore agents with minimal training. Documentation often shows training measured in hours, not days.

**53.** Describe the performance metrics by which dispute-handling agents are measured, including any productivity quotas (disputes processed per hour or per shift) and any quality metrics.

*Why it matters:* Productivity quotas are highly probative of perfunctory review. *Hinkle* progeny.

**54.** Identify every change to the dispute-handling training curriculum during the relevant time period, including the date and the substantive content of each change.

*Why it matters:* Timeline of corrective action — or absence of corrective action — following complaints.

**55.** Describe the compensation structure for dispute-handling agents, including any bonus, productivity, or quality-based components.

*Why it matters:* Bonus structures tied to throughput are independently probative of unreasonable procedures.

---

## Topic I — Disposition of Consumer Dispute Documents (Interrogatories 56–60)

**56.** Describe how documents submitted by plaintiff with each of her disputes were processed, stored, transmitted (or not transmitted), and ultimately retained or destroyed.

*Why it matters:* Often documents are scanned, OCR'd, and either summarized or discarded. Establishing the disposition is essential to the *Cushman* analysis.

**57.** State whether each of plaintiff's dispute-supporting documents was reviewed by a natural person before any dispute code was assigned, and if so, by whom and for how long.

*Why it matters:* Drills into the per-document review effort.

**58.** State whether each of plaintiff's dispute-supporting documents was transmitted to the furnisher via e-OSCAR ACDV, and if not, why not.

*Why it matters:* Non-transmission is a frequent violation. ACDV systems impose practical document-size limits that often function as a de facto bar to document transmission.

**59.** Identify every record (paper or electronic) currently in your possession reflecting the receipt, handling, or content of plaintiff's dispute-supporting documents.

*Why it matters:* Inventory of plaintiff-specific evidence.

**60.** Describe your procedure for retaining or destroying consumer-supplied dispute documentation, including retention periods and the basis for each.

*Why it matters:* Spoliation argument foundation if documents have been destroyed.

---

## Limits and Objections — Anticipating and Responding

### Numerical Limit (Rule 33(a)(1))

The 25-interrogatory cap is binding absent stipulation. Subparts that are "logically or factually subsumed" within and necessarily related to the primary question count as one. *See* 1993 Advisory Committee Note to Rule 33. Counsel should:
- Combine narrowly related questions ("identify X, Y, and Z" rather than three separate interrogatories).
- Negotiate an expanded number with opposing counsel — typically 30–50 is reasonable in a complex CRA case.
- If denied, seek leave of court under Rule 33(a)(1) showing good cause.

### Proportionality (Rule 26(b)(1) post-December 2015)

Defense will object that any matching-algorithm or systemic-procedure interrogatory is disproportionate. Response framework:
- The "importance of the issues at stake" — FCRA vindicates a statutory right and protects fundamental consumer interests.
- The "amount in controversy" — willful violations support statutory and punitive damages disproportionate to nominal compensatories.
- The "parties' relative access to relevant information" (added in 2015) — the CRA controls all the responsive information; the plaintiff has none.
- The "importance of the discovery in resolving the issues" — matching procedures are the central § 1681e(b) inquiry.

### Trade Secret (Rule 26(c)(1)(G))

A trade-secret objection is not absolute; it shifts the burden to balance the need for the information against the competitive harm. Plaintiff should:
- Offer a multi-tier protective order with on-site / clean-room review for source code.
- Cite published authority ordering CRA matching-algorithm production under protective order.
- Distinguish the matching algorithm from genuinely proprietary scoring models (FICO, VantageScore) — the matching algorithm is a procedural artifact, not a competitive product.

### Work Product / Privilege

Investigations conducted in compliance with a statutory duty (§ 1681i) are not "in anticipation of litigation" and are not protected work product. *Cf. Hickman v. Taylor*, 329 U.S. 495 (1947). Demand a privilege log under Rule 26(b)(5)(A) with sufficient detail to assess each claim.

### Compound / Vague / Burdensome

Defense will tag many of the above interrogatories as "compound." Genuinely compound interrogatories can be reframed; vague terms should be defined in a meet-and-confer rather than reformulated by opposing counsel; burden should be quantified — burden assertions without quantification are insufficient under modern proportionality doctrine.

---

## Practice Tip — Sequencing the Interrogatory Wave

A common rookie mistake is to serve all 25 interrogatories at once. A better approach:
1. **First wave (10 interrogatories):** Custodians, retention, 30(b)(6) designees, identification of relevant systems, identification of relevant policies — the meta-discovery foundation.
2. **Second wave (10 interrogatories):** Substantive procedural questions on matching and reinvestigation — informed by the documents produced in the first wave.
3. **Reserved (5 interrogatories):** Held back for follow-up after depositions, often used to lock in admissions about specific procedural failures revealed in deposition testimony.

---

## See also

- `discovery_01_FCRA_Discovery_Strategy_Overview.md`
- `discovery_02_FCRA_Initial_Disclosures.md`
- `discovery_04_RFPs_to_CRAs.md`
- `discovery_05_Interrogatories_to_Furnishers.md` (planned)
- `FCRA_Caselaw_Circuit_Decisions.md`

---

*End of file.*
