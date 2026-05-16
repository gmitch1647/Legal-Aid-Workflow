# Sample Requests for Production to Furnishers in FCRA Litigation
**Topic:** Plaintiff-side requests for production propounded on furnishers (banks, card issuers, mortgage servicers, auto-finance, debt collectors, debt buyers, telecoms, utilities, landlord-screening furnishers) under Federal Rule of Civil Procedure 34
**Primary statute:** 15 U.S.C. § 1681s-2; FRCP 34
**Cross-references:** 12 C.F.R. §§ 1022.40–.43 (Regulation V Subpart E) and Appendix E (Interagency Guidelines); FRCP 26(b)(1), 26(b)(2)(B) (ESI not reasonably accessible), 26(f), 34(b)(2)(E) (form of production); CDIA Metro 2 Format Reference Guide and e-OSCAR User Guide (industry standards); CFPB Consumer Financial Protection Circular 2022-07; CFPB Supervisory Highlights Issue 32 (Spring 2024)
**Last updated:** May 16, 2026

## Introduction and scope

The strongest documents in an FCRA case against a furnisher are: (1) the ACDV records — the structured, time-stamped electronic dispute traffic between CRAs and furnishers passing through e-OSCAR; (2) the furnisher's written policies, procedures, scripts, and training materials; (3) account-level documents (origination, history, payment, communications); and (4) pattern documents showing other-consumer disputes of the same error type. The drafter's job is to ask for each in technical language sufficient to defeat the predictable defense response that the furnisher's customer-service screen "summary" is all that exists.

These templates follow the FRCP 34 framework. Plaintiff should pair them with the interrogatories in `discovery_05_Interrogatories_to_Furnishers.md`. A pre-production FRCP 26(f) conference should include explicit treatment of (a) Metro 2 field-level data, (b) ACDV records in native format including all attachments, (c) ESI sources and custodians, (d) form-of-production (load-file-with-images, native files for spreadsheets and databases, structured data exports for transactional systems), (e) any protective-order needs, and (f) any not-reasonably-accessible ESI claims under FRCP 26(b)(2)(B). All sample text below is delineated as "TEMPLATE — ADAPT TO CASE."

---

## Definitions and instructions (standard recitals — abbreviated)

- "Document" and "ESI" carry their broadest meaning under FRCP 34(a)(1) and the Federal Rules of Evidence.
- "ACDV" means an automated consumer dispute verification message processed through e-OSCAR (or any successor or equivalent system), including the inbound dispute, all attachments transmitted with the dispute, the response, and all status updates.
- "Metro 2" refers to the data format published by the Consumer Data Industry Association for furnishing of consumer information to consumer reporting agencies.
- "Account-level documentation" includes the original application, signed contract, payment history, statements, communications with the consumer, dispute correspondence, and all other documents relating to the specific account.
- "Plaintiff's account" means the account identified in Paragraph __ of the Complaint and any predecessor, replacement, or related account.
- "Relevant period" is [propose 2 years before first dispute through present, plus broader policies-and-procedures window].

---

## Topic 1 — The consumer's account file

The first task is to obtain the complete file on the plaintiff's account in its native form — not the customer-service summary screen. Modern furnisher systems typically include an origination system, a servicing system, a collection/recovery system (if charged off), and a dispute-handling system, each with its own records.

**TEMPLATE — ADAPT TO CASE**

1. All documents and ESI relating to the origination of Plaintiff's account, including the application, signed agreement, disclosures, credit-decision records, identity-verification records, and underwriting notes.

2. The complete payment history for Plaintiff's account, in native electronic format, including every posted transaction, reversal, fee assessment, fee waiver, payment-source identifier, and balance computation.

3. All monthly or periodic statements issued to Plaintiff or to any joint account holder with respect to Plaintiff's account.

4. All communications between Defendant (or any agent, vendor, or representative of Defendant) and Plaintiff or any person purporting to act on Plaintiff's behalf, in any medium (phone, letter, email, text, secure-message, in-app, in-person), including all call recordings, call transcriptions, IVR logs, and voicemail recordings.

5. All system notes, collection notes, account notes, and any free-text annotations in Defendant's account-management, servicing, and collection systems concerning Plaintiff's account.

6. All documents reflecting any status change on Plaintiff's account, including changes to delinquency, charge-off, repossession, foreclosure, bankruptcy, deceased status, dispute flag, fraud flag, or settlement status.

7. Documents sufficient to identify each user who accessed, viewed, or modified Plaintiff's account record during the relevant period, including user ID, access date and time, and the function performed.

8. All "screen prints," "system captures," or other operator-visible representations of Plaintiff's account record as it appeared on each occasion that any dispute concerning the account was reviewed.

9. All correspondence between Defendant and Plaintiff concerning any dispute, complaint, or inquiry made by Plaintiff in connection with the account.

10. All documents reflecting the calculation, derivation, or revision of any "date of first delinquency" furnished by Defendant for Plaintiff's account.

11. All documents reflecting any transfer, sale, or assignment of Plaintiff's account, including purchase agreements, bills of sale, allonges, assignment instruments, data files transferred, and any document retained by the transferor.

---

## Topic 2 — ACDV records (the central document type)

ACDV records are the central documentary evidence in any indirect-dispute § 1681s-2(b) case. Plaintiffs must specify the technical scope, including all attachments (which is the focus of CFPB Circular 2022-07's holding that CRAs must forward consumer-supplied documents and that furnishers must consider them).

**TEMPLATE — ADAPT TO CASE**

12. Every ACDV received by Defendant from any consumer reporting agency concerning Plaintiff or Plaintiff's account, in native electronic format, including each field, the inbound dispute code(s), the inbound free-text description, every attachment transmitted with the ACDV, the unique ACDV control number, all timestamps, and the originating CRA.

13. Every response transmitted by Defendant to any CRA in response to any ACDV identified in Request 12, in native electronic format, including each outbound field, response code(s), free-text response, and timestamp.

14. All documents reflecting the routing, queueing, prioritization, or assignment of each ACDV identified in Request 12 within Defendant's organization or any vendor's organization, including the identity of the assigned investigator and any escalation.

15. All investigation worksheets, decision trees, checklists, or scripts completed in connection with each ACDV identified in Request 12.

16. All documents consulted, reviewed, retrieved, or generated by any person investigating each ACDV identified in Request 12, including screen prints showing what the investigator viewed.

17. All e-OSCAR audit logs, transaction logs, exception reports, and status reports concerning Plaintiff or Plaintiff's account.

18. All communications (internal or external) concerning each ACDV identified in Request 12, including emails, instant messages, ticket-system records, and any escalation correspondence.

19. The contents of Defendant's e-OSCAR mailbox(es) (or successor or equivalent) for the dates corresponding to each ACDV identified in Request 12, in native form, sufficient to show all messages and attachments processed.

20. For each ACDV identified in Request 12, all documents reflecting the consumer-information indicator (CII), special-comment code, compliance-condition code, and any dispute-flag transmitted by Defendant to any CRA in connection with the dispute.

---

## Topic 3 — Direct dispute correspondence and investigation files

The direct-dispute file is governed by 12 C.F.R. § 1022.43 and addresses any dispute received directly from the consumer concerning the consumer's liability, the terms of the account, or the consumer's performance. Direct disputes are also pre- and post-dispute evidence relevant to the § 1681s-2(b) investigation.

**TEMPLATE — ADAPT TO CASE**

21. All correspondence (including emails, letters, secure-message-portal messages, web-form submissions, and call recordings) received from Plaintiff or any person purporting to act on Plaintiff's behalf concerning Plaintiff's account or any aspect of Defendant's furnishing of information about Plaintiff.

22. All correspondence sent by Defendant to Plaintiff in response to any direct dispute, including any frivolous-dispute notice under 12 C.F.R. § 1022.43(f)(2).

23. All documents reflecting Defendant's investigation of each direct dispute received from Plaintiff, including the materials consulted, the investigator's notes, and the documentation of the outcome.

24. All documents reflecting any update, correction, deletion, or modification of furnished information made in response to a direct dispute from Plaintiff.

---

## Topic 4 — Furnisher's investigation work papers

The reasonableness of the investigation under *Gorman v. Wolpoff & Abramson, LLP*, 584 F.3d 1147, 1156–57 (9th Cir. 2009), and *Chiang v. Verizon New England Inc.*, 595 F.3d 26 (1st Cir. 2010), is judged by what the furnisher actually did. Work-papers are the operational evidence.

**TEMPLATE — ADAPT TO CASE**

25. All work papers, investigation files, dispute logs, dispute-ticket records, and case-management entries generated by Defendant or any agent in connection with any dispute (indirect or direct) concerning Plaintiff's account.

26. All notes, memoranda, or written communications by any investigator, supervisor, or compliance officer relating to any dispute concerning Plaintiff's account.

27. All quality-assurance, quality-control, audit, or review records concerning the handling of any dispute relating to Plaintiff's account.

28. All training records, certifications, and competency-test results for each person who participated in handling any dispute relating to Plaintiff's account.

29. All productivity, time-keeping, or workload reports that include time spent by the investigators who handled any dispute relating to Plaintiff's account, on the dates the disputes were handled.
 *Annotation: targets the *Gorman* "non-cursory" inquiry. A dispute "handled" in 30 seconds, batch-processed across many disputes per minute, is rarely a reasonable investigation.*

---

## Topic 5 — Debt buyers — purchase agreements and account-level documentation

This category is essential under *Hinkle v. Midland Credit Mgmt., Inc.*, 827 F.3d 1295 (11th Cir. 2016). The court held that a debt buyer may not "verify" through its automated system without considering whether to request account-level documents that its purchase agreement entitles it to obtain.

**TEMPLATE — ADAPT TO CASE**

30. All purchase agreements, forward-flow agreements, bills of sale, assignments, allonges, schedules, and related instruments under which Defendant acquired Plaintiff's account, with all amendments and exhibits.

31. All representations and warranties made by the seller of Plaintiff's account to Defendant, including any limitations on the warranties and any disclaimer of warranty.

32. All documents reflecting the consideration paid by Defendant for the portfolio that included Plaintiff's account, the size and composition of the portfolio, and the cents-on-the-dollar valuation.

33. All documents reflecting Defendant's contractual rights — under the purchase agreements or any related document — to request from the seller or any prior owner account-level documents concerning Plaintiff's account.
 *Annotation: this is the exact contractual right that *Hinkle* held should have been exercised.*

34. All requests made by Defendant to the seller or any prior owner for account-level documents concerning Plaintiff's account, all responses to those requests, and all documents received.

35. The data file (or files) transferred from the seller to Defendant in connection with Plaintiff's account, in native format, with field-mapping documentation.

36. All documents reflecting Defendant's policies, procedures, thresholds, or work instructions for determining when to request account-level documentation in connection with a dispute.

37. All documents reflecting the chain of title for Plaintiff's account from origination through Defendant's acquisition.

38. All communications between Defendant and the original creditor, or any intermediate owner, concerning Plaintiff's account.

---

## Topic 6 — Policies, procedures, training, scripts

Policies and procedures are required under 12 C.F.R. § 1022.42. Compliance failure here is among the strongest willfulness predicates under *Safeco Ins. Co. of Am. v. Burr*, 551 U.S. 47 (2007), and was central to *Williams v. First Advantage LNS Screening Solutions, Inc.*, 947 F.3d 735 (11th Cir. 2020), where the court affirmed a willfulness finding based on the absence of, and failure to follow, procedures.

**TEMPLATE — ADAPT TO CASE**

39. All written policies and procedures in effect during the relevant period governing Defendant's furnishing of information to consumer reporting agencies.

40. All written policies and procedures in effect during the relevant period governing Defendant's receipt and investigation of ACDVs.

41. All written policies and procedures in effect during the relevant period governing Defendant's receipt and investigation of direct disputes under 12 C.F.R. § 1022.43.

42. All written policies and procedures in effect during the relevant period governing the flagging of disputed accounts under 15 U.S.C. § 1681s-2(a)(3) and the suppression of refurnishing of blocked information under § 1681s-2(a)(6).

43. All documents reflecting any review, update, or revision of the policies and procedures identified in Requests 39–42 under 12 C.F.R. § 1022.42(c).

44. All training materials, slide decks, e-learning modules, knowledge-base articles, desk references, call-center scripts, decision trees, flow charts, and FAQ documents in use during the relevant period for personnel involved in furnishing or dispute handling.

45. All training-completion records, attendance logs, and competency-test results for personnel involved in furnishing or dispute handling during the relevant period.

46. All "job aids" or "knowledge base" entries used by dispute-handling personnel addressing the categories of dispute at issue in this case.

47. All risk assessments, risk maps, or risk inventories concerning FCRA furnishing or dispute handling prepared by Defendant or for Defendant during the relevant period.

---

## Topic 7 — Audits, quality control, and internal compliance memos

Internal-audit and quality-control records are often where furnishers' own people document the very problems plaintiffs allege.

**TEMPLATE — ADAPT TO CASE**

48. All internal audit reports, audit work papers, audit issue logs, and management responses concerning FCRA furnishing or dispute handling during the relevant period.

49. All quality-control or quality-assurance reports, scorecards, sampling results, and findings concerning FCRA furnishing or dispute handling during the relevant period.

50. All compliance memoranda, compliance bulletins, and compliance training materials issued during the relevant period addressing FCRA furnishing or dispute handling.

51. All consultant reports, third-party reviews, and external assessments concerning FCRA furnishing or dispute handling during the relevant period.

52. All board, committee, or senior-management presentations, briefings, or minutes during the relevant period addressing FCRA furnishing or dispute handling.

53. All remediation plans, look-back analyses, or restitution programs concerning FCRA furnishing or dispute handling during the relevant period.

---

## Topic 8 — Communications with CRAs

Furnisher communications with CRAs frequently contain admissions about systems, processes, dispute-handling limitations, and known errors. They are also often the source of the format and timing assumptions that govern ACDV processing.

**TEMPLATE — ADAPT TO CASE**

54. All agreements between Defendant and any CRA governing the furnishing of information (subscriber agreements, data-furnisher agreements, and any related agreements), with all amendments.

55. All policies, procedures, technical specifications, and onboarding materials provided by any CRA to Defendant concerning the furnishing of information, Metro 2 format requirements, or ACDV processing.

56. All correspondence between Defendant and any CRA concerning Plaintiff or Plaintiff's account.

57. All correspondence between Defendant and any CRA during the relevant period concerning the same error type alleged in this case or the same dispute categories at issue, including any escalation, dispute-bulk-rejection, file-reject, or data-quality communications.

58. All e-OSCAR user-administration records (account creation, role assignments, user provisioning and deprovisioning) for personnel involved in furnishing or dispute handling during the relevant period.

---

## Topic 9 — Other-consumer dispute records (pattern evidence under *Safeco*)

Pattern evidence — that the furnisher received many disputes of the same type, and either failed to act or acted ineffectually — is among the strongest willfulness predicates after *Safeco*. The case law on the appropriate scope is fact-specific, but courts routinely permit narrow pattern discovery tied to the specific error type. See generally *Safeco*, 551 U.S. at 68–70 (willfulness requires conduct entailing an unjustifiably high risk of harm, known or so obvious it should be known).

**TEMPLATE — ADAPT TO CASE**

59. All ACDVs received by Defendant during the relevant period bearing the same inbound dispute code(s) at issue in this case, in native form including all attachments. [Plaintiff should propose anonymization or production under protective order, and propose a sample size if proportional concerns arise.]

60. Aggregate dispute statistics for the relevant period, by month, broken down by dispute code, response code, and disposition (verified, modified, deleted, no information found).
 *Annotation: tracks CFPB Supervisory Highlights Issue 32 (Spring 2024) finding that CRAs failed to monitor furnishers that responded uniformly across all disputes — these statistics demonstrate the same pattern from the furnisher side.*

61. All complaints received by Defendant during the relevant period through the CFPB Consumer Complaint Database concerning furnishing or dispute handling, including the complaint, the response, and the disposition.

62. All civil pleadings, demand letters, arbitration claims, or attorney correspondence received by Defendant during the relevant period alleging FCRA furnishing or dispute-handling violations of the same type at issue in this case, including the response and disposition.

63. All examination findings, supervisory letters, MRAs, MRIAs, consent orders, settlement agreements, and other regulatory documents received by Defendant during the relevant period addressing FCRA furnishing or dispute handling.

64. All documents reflecting Defendant's response to any of the items identified in Request 63.

---

## Topic 10 — Document retention and litigation holds

Records about records are often outcome-determinative. Furnishers occasionally claim that older ACDVs or call recordings have been purged in the ordinary course. Discovery into retention practices and litigation holds is critical to spoliation analysis under FRCP 37(e).

**TEMPLATE — ADAPT TO CASE**

65. All document retention policies, schedules, and record-destruction procedures in effect during the relevant period applicable to: account-level documents; ACDV records; e-OSCAR transmissions; call recordings; system logs; email; chat or messaging records; dispute investigation files; and policies and procedures.

66. All litigation hold notices, preservation memoranda, and related communications issued by Defendant in connection with Plaintiff's claims or this litigation, identifying each recipient and the scope of the hold.

67. All documents reflecting any deletion, destruction, purge, or disposal of any record that, but for the deletion, destruction, purge, or disposal, would have been responsive to any other Request.

68. All documents reflecting backup, archive, or "cold storage" copies of any source of ESI that has been purged from active systems but that may contain responsive material.

---

## Section: Metro 2 / e-OSCAR record production (technical vocabulary)

Plaintiffs commonly receive a one-page "tradeline" or customer-service-screen print as production for an ACDV, when the underlying e-OSCAR record contains dozens of fields and may have attachments. The plaintiff must use the technical vocabulary in the Requests to defeat this practice. CFPB Supervisory Highlights Issue 32 (Spring 2024) confirmed that ACDV records are the operative compliance record, and CFPB Circular 2022-07 confirmed that consumer-supplied attachments must be transmitted and considered.

The plaintiff's Requests should specifically include:

- **Native ACDV records.** Production "in the form ordinarily maintained" under FRCP 34(b)(2)(E)(ii), which for ACDVs means the structured e-OSCAR record export, not a PDF screen print.
- **All fields, including base segment and J1/J2/L1/K1–K4 segments.** Furnishers may produce only the dispute reason code and the response code; plaintiffs need every Metro 2 field, including: Account Type, Account Status, Payment Rating, Payment History Profile (24-month grid), Current Balance, Amount Past Due, Original Loan Amount, Credit Limit, High Credit, Date Opened, Date Closed, Date of Last Payment, Date of Account Information, Date of First Delinquency, Consumer Information Indicator, Compliance Condition Code, Special Comment Code, ECOA Code, Portfolio Type, Terms Frequency, Terms Duration, Scheduled Monthly Payment Amount, Actual Payment Amount.
- **Inbound dispute fields.** Dispute Code 1, Dispute Code 2, Free-Form Text, Images/Attachments, FCRA Relevant Information.
- **Outbound response fields.** Response Code 1, Response Code 2, Free-Form Response Text, any corrections to base-segment fields.
- **Audit trail.** Date/time of receipt; date/time of response; user IDs of all who touched the record; routing/queueing history.
- **Attachments.** Any consumer-supplied document transmitted with the dispute or referenced in the ACDV. This is the specific point of CFPB Circular 2022-07.
- **Soft-rejected, hard-rejected, and unread items.** Many furnishers' e-OSCAR practices include rejection codes that effectively decline investigation. These items belong in production.

Sample technical Request:

**TEMPLATE — ADAPT TO CASE**

69. For each ACDV identified in Request 12, produce the complete native e-OSCAR record, including every base-segment and ancillary-segment field, every inbound and outbound dispute code, every free-form text field, every attachment, and the full audit trail (receipt, routing, queue, assignment, action, response, status update, and closure), in a structured electronic format that preserves field labels and timestamps. To the extent any portion of the record is maintained in a proprietary internal format that is not the e-OSCAR record itself but that contains additional substantive information, produce that record as well.

70. Documents sufficient to identify Defendant's complete Metro 2 field mapping from Defendant's source systems to the e-OSCAR/CRA transmission format, including any automated transformations, suppressions, or default-value rules applied during transmission.

71. All e-OSCAR User Guide, Metro 2 Format Reference Guide, and any other industry-published technical documentation maintained by Defendant during the relevant period.
 *Annotation: the CDIA technical guides are not confidential; they define the operational vocabulary in which any ACDV dispute must be evaluated.*

---

## Common defects and motion practice

Furnishers typically resist these requests on three grounds: (1) burden/proportionality, especially for pattern evidence; (2) confidentiality, especially of internal procedures; and (3) ESI cost/accessibility, especially for e-OSCAR archives. The drafter should:

- For burden: tie each request to a § 1681s-2(b) element, a Reg V provision (especially § 1022.42), or a willfulness factor; accept reasonable temporal narrowing; offer custodian and search-term agreement on email; offer to sample on pattern evidence.
- For confidentiality: agree to a stipulated protective order under FRCP 26(c) with attorneys'-eyes-only designation available for sensitive vendor contracts, Metro 2 mapping documents, and source-code-like materials.
- For ESI accessibility: insist on the FRCP 26(b)(2)(B) standard ("not reasonably accessible because of undue burden or cost") and require a sworn evidentiary showing; explore cost-sharing only after a showing.
- For "no responsive documents" answers on ACDV records: cite *Hinkle*, *Saunders*, and CFPB Supervisory Highlights Issue 32; move to compel under FRCP 37(a) and, if appropriate, seek FRCP 37(e) ESI-spoliation sanctions.

---

## See also

- `discovery_05_Interrogatories_to_Furnishers.md` — paired interrogatories
- `discovery_07_Requests_for_Admission_FCRA.md` — paired RFAs
- `07_FCRA_Furnisher_Duties.md` — substantive law of § 1681s-2 and Reg V
- `11_FCRA_Case_Law_Circuits.md` — *Gorman*, *Saunders*, *Hinkle*, *Chiang*, *Williams*
- `12_Regulation_V_Summary.md` — 12 C.F.R. §§ 1022.40–.43 and Appendix E
- `13_FCRA_Agency_Guidance.md` — CFPB Circular 2022-07; Supervisory Highlights Issue 32 (Spring 2024)
