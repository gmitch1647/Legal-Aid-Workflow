# Sample Interrogatories to Furnishers in FCRA Litigation
**Topic:** Plaintiff-side written interrogatories propounded on furnishers of information (banks, card issuers, mortgage servicers, auto lenders, debt collectors, debt buyers, telecoms, utilities, landlord-screening furnishers) under Federal Rule of Civil Procedure 33
**Primary statute:** 15 U.S.C. § 1681s-2 (FCRA § 623); FRCP 33
**Cross-references:** 12 C.F.R. §§ 1022.40–.43 (Regulation V Subpart E); 12 C.F.R. Part 1022, Appendix E (Interagency Guidelines on Accuracy and Integrity); CFPB Consumer Financial Protection Circular 2022-07; CFPB Supervisory Highlights Issue 32 (Spring 2024); FRCP 26(b)(1) (proportionality); FRCP 33(d) (option to produce business records)
**Last updated:** May 16, 2026

## Introduction and scope

Interrogatories to furnishers in FCRA cases serve three core functions: (1) mapping the furnisher's corporate structure and identifying the human and electronic actors who participated in the alleged violation; (2) reconstructing the dispute investigation in granular detail (who, when, what reviewed, what decided, what communicated); and (3) building the evidentiary predicate for willfulness under *Safeco Insurance Co. of America v. Burr*, 551 U.S. 47 (2007), through pattern-of-similar-error evidence and policies/procedures discovery.

Rule 33 limits a party to 25 interrogatories absent leave of court. FCRA furnisher cases routinely justify leave because of the multi-layered fact patterns (origination, servicing, dispute receipt, ACDV processing, response, downstream furnishing) and because a single furnisher may operate through multiple legal entities, vendors, and call-center subcontractors. Plaintiffs should be prepared to make a proportionality showing under FRCP 26(b)(1) tied to the elements of § 1681s-2(b): receipt of notice from a CRA; conduct of a reasonable investigation; review of all relevant information; report of results to CRAs; and modification, deletion, or permanent blocking of disputed information.

The templates below are organized by topic, with annotations explaining how each interrogatory ties to a statutory element, regulatory requirement, or case-law holding. They should be adapted to the specific facts and the specific type of furnisher (depository institution, card issuer, mortgage servicer, auto-finance company, third-party collector, debt buyer, telecom, utility, or specialty furnisher). All sample text is delineated as "TEMPLATE — ADAPT TO CASE."

---

## Topic 1 — Identification and corporate structure

The threshold task is identifying which legal entity actually furnished the disputed information and which people and systems handled the dispute. Furnishers commonly operate through service-of-process entities, affiliates, captive servicing subsidiaries, and outsourced dispute-handling vendors. The plaintiff must identify the correct defendant, the correct custodians for documents and ESI, and the correct 30(b)(6) designees.

**TEMPLATE — ADAPT TO CASE**

1. Identify each legal entity within Defendant's corporate family that (a) originated, owns, services, or has owned or serviced Plaintiff's account at any time; (b) has furnished information about Plaintiff's account to any consumer reporting agency; or (c) participated in any aspect of the investigation, response, or follow-up to any dispute identified in the Complaint.
 *Annotation: locks in the proper defendant under § 1681s-2(b) and identifies upstream/downstream affiliates that may also be liable as furnishers.*

2. Identify by name, title, last known address, telephone number, and employer each person who participated in, supervised, or had any responsibility for the investigation of any dispute received from a CRA or directly from Plaintiff concerning the account identified in the Complaint.
 *Annotation: identifies the human decision-maker for § 1681s-2(b) deposition. Critical under *Gorman v. Wolpoff & Abramson, LLP*, 584 F.3d 1147 (9th Cir. 2009), which evaluates reasonableness based on what the furnisher's investigators actually did.*

3. Identify the department, business unit, vendor, or third party responsible at Defendant for receiving and responding to automated consumer dispute verification ("ACDV") messages through e-OSCAR or any equivalent system.

4. Identify each third-party vendor or service provider that Defendant uses or used during the relevant period to (a) furnish information to CRAs; (b) receive or respond to ACDV messages; (c) investigate direct disputes; (d) maintain account-level documents; or (e) train dispute-handling personnel.
 *Annotation: targets the common pattern where dispute handling is wholly or partially outsourced. Furnisher cannot delegate its statutory duty.*

5. State the physical and electronic location(s) at which Defendant maintains: (a) origination records for Plaintiff's account; (b) account history, payment, and servicing records; (c) ACDV records and dispute logs; (d) policies and procedures concerning furnishing and dispute handling; and (e) training records for dispute-handling personnel.

6. Identify by job title and reporting line each position at Defendant whose responsibilities during the relevant period included compliance with 15 U.S.C. § 1681s-2 or 12 C.F.R. §§ 1022.40–.43, and identify the person who held each such position.

7. Identify Defendant's data furnishing reporter number(s) (subscriber code, member number, or equivalent identifier) used to furnish information to each of Equifax, Experian, TransUnion, Innovis, LexisNexis Risk Solutions, and any other CRA to which Defendant furnished information about Plaintiff.

---

## Topic 2 — The specific account at issue

These interrogatories develop the full account chronology and capture every furnisher communication touching Plaintiff. They are essential for any claim of "inaccurate" or "materially misleading" reporting under § 1681s-2(b) and *Saunders v. Branch Banking & Trust Co. of Va.*, 526 F.3d 142 (4th Cir. 2008), which holds that technically accurate but misleading information can violate the FCRA.

**TEMPLATE — ADAPT TO CASE**

8. State the complete chronology of Plaintiff's account, including (a) date of application; (b) date of origination or assignment to Defendant; (c) each balance change, status code change, or account-condition change; (d) the date of each payment and the source of each payment; (e) the date of any charge-off, write-down, settlement, or transfer; and (f) the current ownership and servicing status.

9. Identify every communication (oral, written, electronic, or in-person) between Plaintiff (or any person purporting to act on Plaintiff's behalf) and Defendant or any agent of Defendant concerning the account identified in the Complaint, including for each: date, mode, participants, summary, and Bates number of any document memorializing the communication.

10. State whether and when Defendant flagged Plaintiff's account with any code, indicator, or notation reflecting that the account was disputed, including the specific code or indicator used and the date(s) on which it was applied and removed.
 *Annotation: *Saunders v. BB&T*, 526 F.3d 142 (4th Cir. 2008): failure to mark an account as disputed can render furnished information materially misleading and supports willfulness.*

11. Identify every status code, payment-rating code, account-type code, special-comment code, and consumer-information indicator that Defendant furnished to any CRA in connection with Plaintiff's account, by month, from [date] to present.
 *Annotation: targets Metro 2 field-level data. A furnisher's bare "tradeline summary" routinely omits the special-comment codes that actually carry the disputed-flag indication.*

12. State each "date of first delinquency" (DOFD) furnished by Defendant for Plaintiff's account, the date each such DOFD was furnished, and the basis on which Defendant calculated each such DOFD.
 *Annotation: CFPB Supervisory Highlights Issue 32 (Spring 2024) identified DOFD reporting failures as a recurring furnisher violation. DOFD also drives the 7-year obsolescence period under 15 U.S.C. § 1681c.*

13. Identify each instance in which Defendant transferred, sold, or assigned Plaintiff's account or any rights therein, including the transferee, date, consideration, and the documents transferred.

14. State whether Defendant continued to furnish information about Plaintiff's account to any CRA after the account was transferred, sold, or assigned, and if so, identify each such furnishing.

---

## Topic 3 — Furnishing process and Metro 2 architecture

Furnishers do not transmit narrative reports to CRAs; they transmit structured data in the Metro 2 format maintained by the Consumer Data Industry Association (CDIA). Plaintiffs must develop discovery in Metro 2 vocabulary to obtain the actual field-level data that drives credit-bureau tradeline content, not the post-hoc "summary" that the furnisher's customer-service screens present.

**TEMPLATE — ADAPT TO CASE**

15. Describe the process by which information is extracted from Defendant's account-management system(s) and transmitted to each CRA, identifying each system, application, batch process, file format, transmission frequency, and human or automated checkpoint involved.

16. State whether Defendant furnishes information to CRAs in the Metro 2 format (or any other format), identifying the format, version, and any deviations from the CDIA-published Metro 2 specifications.

17. For Plaintiff's account, identify the value transmitted in each of the following Metro 2 base-segment and J1/J2/L1/K1–K4 fields for each reporting period from [date] to present: Account Type, Account Status, Payment Rating, Current Balance, Amount Past Due, Date of Account Information, Date of Last Payment, Date Closed, Date of First Delinquency, Consumer Information Indicator, Compliance Condition Code, Special Comment Code, and ECOA Code.
 *Annotation: this is the technical inventory of the actual furnished data. Defendants routinely resist this in favor of summary screens; Rule 33(d) does not relieve them when the data must be cross-correlated with ACDV records.*

18. Identify each "purge from file" date, deletion instruction, or correction instruction Defendant transmitted to any CRA concerning Plaintiff's account.

19. Identify each automated rule, algorithm, business logic, or filter that Defendant or any vendor applies to data before transmission to a CRA, including any rule that suppresses, modifies, or overrides field values present in Defendant's account-management system.
 *Annotation: targets the "automation problem" highlighted in *Hinkle v. Midland Credit Mgmt., Inc.*, 827 F.3d 1295 (11th Cir. 2016): automated systems that do not allow human investigators to access source documents undermine the reasonableness of any investigation.*

---

## Topic 4 — Dispute handling under § 1681s-2(b)

This is the heart of the case. Section 1681s-2(b) is the only furnisher duty that supports a private right of action, and the question is always whether the furnisher conducted a "reasonable investigation." *Gorman*, 584 F.3d at 1156–57, and *Chiang v. Verizon New England Inc.*, 595 F.3d 26 (1st Cir. 2010), establish that reasonableness is an objective standard turning on what the furnisher actually did with the dispute notice from the CRA.

**TEMPLATE — ADAPT TO CASE**

20. For each ACDV (or equivalent indirect dispute) received from any CRA concerning Plaintiff's account, state: (a) the date of receipt; (b) the CRA that transmitted it; (c) the dispute code(s) and free-text description provided by the CRA; (d) each item of supporting documentation or attachment received with the dispute; (e) the unique identifier (ACDV control number) assigned to the dispute; and (f) the date and content of Defendant's response.

21. For each ACDV identified in response to Interrogatory 20, identify by name and title each person who reviewed, investigated, or responded to that ACDV, and describe each step that person took, the time each step took, and the materials each person consulted.
 *Annotation: *Gorman*, 584 F.3d at 1157, requires "non-cursory" investigation; the burden under *Chiang*, 595 F.3d at 37, is on plaintiff to identify what reasonable investigation would have uncovered, so plaintiff must know exactly what the investigator did and did not look at.*

22. State the total elapsed time from Defendant's receipt of each ACDV identified in response to Interrogatory 20 to Defendant's transmission of a response, and identify any ACDV for which the elapsed time exceeded the period prescribed by 15 U.S.C. § 1681i(a)(1) as applied through § 1681s-2(b)(2).

23. For each ACDV identified in response to Interrogatory 20, state whether Defendant retrieved, requested, or reviewed any of the following in connection with the investigation: (a) the original application or contract; (b) signature cards or signature verification documents; (c) payment-history records beyond the summary on the customer-service screen; (d) prior communications with the consumer; (e) prior dispute correspondence; (f) any document transmitted by the CRA with the dispute notice; (g) account-level documentation from any prior owner of the account; (h) identity-verification documents; (i) fraud-investigation records.
 *Annotation: tracks *Hinkle*, 827 F.3d at 1305–08 (debt buyer must consider account-level documentation), and CFPB Circular 2022-07 (furnisher must consider supporting documents transmitted with dispute).*

24. State whether, in the course of investigating any ACDV identified in response to Interrogatory 20, any employee or agent of Defendant communicated with Plaintiff, and if so, identify each such communication.

25. Identify the response code transmitted by Defendant to each CRA for each ACDV identified in response to Interrogatory 20 (e.g., "verified as reported," "modified," "deleted," "account information not on file"), and for any "verified" response, identify the document(s) or data source(s) that constituted the verification.
 *Annotation: courts routinely find willfulness where a furnisher returns "verified as reported" without identifying what was verified or against what source.*

26. State whether Defendant has any policy, practice, or procedure for escalating a dispute to a higher level of review based on the dispute code, the nature of the dispute, the dispute history, or any other factor, and identify each such policy and how it was or was not applied to Plaintiff's disputes.

27. State whether Defendant treated any ACDV received concerning Plaintiff's account as frivolous, irrelevant, or otherwise not requiring investigation, and if so, identify the ACDV, the basis for the determination, and the policy or procedure under which the determination was made.

---

## Topic 5 — Direct disputes under § 1681s-2(a)(8) and 12 C.F.R. § 1022.43

The FACTA amendments and Regulation V together impose a duty on furnishers to investigate disputes received directly from consumers when the dispute concerns the consumer's liability, the terms of the account, or the consumer's performance. 15 U.S.C. § 1681s-2(a)(8); 12 C.F.R. § 1022.43. Although § 1681s-2(a) generally lacks a private right of action, direct-dispute records are highly relevant to (i) the reasonableness of the § 1681s-2(b) investigation, (ii) willfulness, and (iii) the existence of "reasonable written policies and procedures" required under 12 C.F.R. § 1022.42.

**TEMPLATE — ADAPT TO CASE**

28. Identify the address(es), email address(es), portal(s), telephone number(s), and any other contact mechanism that Defendant has designated under 12 C.F.R. § 1022.43(c) and any related notice to consumers for receipt of direct disputes during the relevant period.

29. Identify each direct dispute received from Plaintiff or any person purporting to act on Plaintiff's behalf, by date, mode of receipt, contents, contact point used, and disposition.

30. For each direct dispute identified in response to Interrogatory 29, identify each person who reviewed or responded to the dispute, the materials consulted, the elapsed time, and the response provided to Plaintiff.

31. State whether Defendant deemed any direct dispute received from Plaintiff to be frivolous or irrelevant under 12 C.F.R. § 1022.43(f), and if so, identify the dispute, the basis for the determination, and any notice sent to Plaintiff under § 1022.43(f)(2).
 *Annotation: CFPB Circular 2022-07 makes clear that imposing barriers (preferred formats, particular forms of proof, identity-verification beyond what the statute requires) is not a basis for refusing to investigate.*

32. State the date of each periodic review under 12 C.F.R. § 1022.42(c) of Defendant's policies and procedures, identify the person(s) who conducted each review, identify each revision adopted, and identify the basis for each revision.

---

## Topic 6 — Policies, procedures, training (12 C.F.R. § 1022.42)

Regulation V requires furnishers to "establish and implement reasonable written policies and procedures regarding the accuracy and integrity of the information relating to consumers" furnished to CRAs. 12 C.F.R. § 1022.42(a). The "Interagency Guidelines Concerning the Accuracy and Integrity of Information Furnished to Consumer Reporting Agencies" appear at Appendix E to Part 1022 and supply the substantive content. Although § 1022.42 is agency-enforced, the absence of, or failure to follow, reasonable policies and procedures is among the strongest evidence of willfulness under *Safeco*, and *Williams v. First Advantage LNS Screening Solutions, Inc.*, 947 F.3d 735 (11th Cir. 2020), affirmed a $1 million punitive damages award where the defendant lacked procedures and failed to follow the procedures it did have.

**TEMPLATE — ADAPT TO CASE**

33. Identify each written policy, procedure, work instruction, desk reference, decision tree, flowchart, or script in effect during the relevant period that governs any aspect of Defendant's: (a) furnishing of information to CRAs; (b) receipt and processing of ACDVs; (c) investigation of direct disputes; (d) flagging of disputed accounts; (e) updating, correction, or deletion of furnished information; (f) handling of identity-theft assertions; or (g) chain-of-title documentation for purchased accounts.

34. State whether Defendant has considered the Interagency Guidelines published at 12 C.F.R. Part 1022, Appendix E, in developing the policies and procedures required under 12 C.F.R. § 1022.42, and identify each provision of Appendix E that Defendant has determined is not appropriate to its operations and the basis for each such determination.

35. Describe the training that Defendant provides to each category of personnel involved in furnishing or dispute handling, identifying for each category: the curriculum; the duration; the frequency; the trainer; the materials used; the testing or evaluation conducted; and the documentation of completion. For Plaintiff's case, identify whether each person who handled Plaintiff's disputes had completed the applicable training before the dispute was handled.
 *Annotation: *Williams v. First Advantage*, 947 F.3d at 760–62: the court relied on testimony that procedures were "kind of aspirational" and that the defendant failed to follow its own procedures, to support willfulness.*

36. State whether Defendant maintains any quality assurance, quality control, audit, monitoring, or sampling program for dispute handling, and identify each such program, the standards applied, the findings during the relevant period, and the remedial actions taken.

37. Identify each compliance memorandum, internal audit report, internal investigation, or risk-management document generated during the relevant period that addresses any aspect of Defendant's compliance with 15 U.S.C. § 1681s-2 or 12 C.F.R. §§ 1022.40–.43.

38. State whether Defendant has ever determined that any of its policies, procedures, or training related to FCRA furnishing or dispute handling was deficient, and if so, identify the determination, the deficiency, the date, and the remedial action taken.

---

## Topic 7 — Accuracy and integrity policies — Reg V Appendix E Interagency Guidelines

The Interagency Guidelines at 12 C.F.R. Part 1022, Appendix E, identify specific operational practices that bear on accuracy and integrity, including reconciliation of furnishing systems with source systems, identifier-matching protocols, handling of subsequent furnisher updates after corrections, and procedures for handling adverse-information bursts that may indicate identity theft or mixed files. Discovery on each of these is appropriate.

**TEMPLATE — ADAPT TO CASE**

39. Describe Defendant's reconciliation procedures between (a) the systems that hold authoritative account data and (b) the systems used to transmit data to CRAs, including the frequency of reconciliation, the items checked, the personnel responsible, and the documentation generated.

40. Describe Defendant's procedures for matching consumer identifiers (name, social security number, date of birth, address) when furnishing information to ensure that information is associated with the correct consumer, and identify any audit, test, or quality-control mechanism applied to those procedures.
 *Annotation: targets mixed-file fact patterns. *Williams v. First Advantage*, 947 F.3d at 760, identified a lack of three-identifier matching procedures as a basis for willfulness.*

41. Describe Defendant's procedures for handling notification from a CRA that a furnished item has been blocked under 15 U.S.C. § 1681c-2 (identity-theft block), including the steps taken to suppress further furnishing of the blocked information.

42. State whether Defendant has any procedure that addresses the prohibition in 15 U.S.C. § 1681s-2(a)(6)(B) on refurnishing of blocked information, and describe the procedure.

---

## Topic 8 — Other-consumer dispute and complaint history (pattern evidence)

Evidence that the furnisher has received the same kind of error complaint from other consumers — and either ignored the pattern or failed to revise its policies — is among the most powerful willfulness evidence available under *Safeco*. Courts routinely permit narrow pattern discovery tied to the specific error type alleged, subject to FRCP 26(b)(1) proportionality.

**TEMPLATE — ADAPT TO CASE**

43. For the relevant period, state the total number of ACDVs Defendant received concerning the same error type alleged by Plaintiff (e.g., reporting after discharge in bankruptcy; reporting balance after settlement; mixed-file errors; reporting an account that does not belong to the consumer; reporting an account discharged in identity-theft), broken down by year and dispute code.

44. For the relevant period, state the total number of complaints, lawsuits, arbitrations, or regulatory inquiries received by Defendant concerning the same error type alleged by Plaintiff, identifying each by date, claimant, and disposition.

45. For the relevant period, state the total number of consumer complaints concerning Defendant's furnishing or dispute handling that were forwarded to Defendant by the Consumer Financial Protection Bureau's Consumer Complaint Database, broken down by year and complaint category.

46. Identify each consent decree, settlement agreement, public enforcement action, supervisory letter, examination finding, matter requiring attention (MRA), or matter requiring immediate attention (MRIA) issued to Defendant during the relevant period that addresses any aspect of FCRA furnishing or dispute handling.

47. Identify each civil action filed against Defendant during the relevant period alleging a violation of 15 U.S.C. § 1681s-2 or any equivalent state-law furnisher provision, identifying the case caption, docket number, court, and disposition.

---

## Topic 9 — CFPB and prudential regulator communications

Communications with prudential regulators (Federal Reserve, OCC, FDIC, NCUA) and the CFPB about furnishing and dispute handling often contain admissions and acknowledged deficiencies that are highly relevant on willfulness.

**TEMPLATE — ADAPT TO CASE**

48. Identify each examination report, supervisory letter, or written communication from the CFPB or any prudential regulator received during the relevant period addressing Defendant's compliance with the FCRA or Regulation V.

49. Identify each response, corrective action plan, or remediation report submitted by Defendant to the CFPB or any prudential regulator in connection with FCRA compliance.

50. State whether Defendant has filed any self-identified issue, "look-back" remediation, or restitution program concerning FCRA furnishing or dispute handling during the relevant period, and identify each.

---

## Topic 10 — Debt buyers — chain-of-title and account-level documentation

Debt buyers operate under particular scrutiny following *Hinkle v. Midland Credit Mgmt., Inc.*, 827 F.3d 1295 (11th Cir. 2016), which held that a debt buyer's "verification" without obtaining account-level documentation from the original creditor or upstream seller may be unreasonable under § 1681s-2(b). Discovery must reach the purchase agreements, the data fields transferred, and the contractual rights to request account-level documentation.

**TEMPLATE — ADAPT TO CASE**

51. Identify each purchase agreement, forward-flow agreement, bill of sale, assignment, allonge, or other instrument under which Defendant acquired Plaintiff's account, identifying for each: the seller; the date; the consideration; the documents and data transferred; and any retention by the seller of records or documents.

52. Identify each prior owner, holder, or assignee of Plaintiff's account from origination to Defendant's acquisition, and identify the documents in Defendant's possession concerning each prior owner's ownership.
 *Annotation: *Hinkle*, 827 F.3d at 1302–04: the existence of multiple intermediate sellers heightens the duty to obtain account-level documentation rather than relying on a downstream summary.*

53. Identify each contractual right Defendant has — under any purchase agreement, forward-flow agreement, or related document — to request from the seller or any prior owner account-level documentation, including original application materials, signed contracts, payment histories, statements, and dispute correspondence.

54. State, for the relevant period, the total number of requests Defendant made under the rights identified in Interrogatory 53 for account-level documentation, the total number granted, and the total cost paid for such documentation.

55. State whether, in connection with any dispute received from Plaintiff or from any CRA on behalf of Plaintiff, Defendant requested or obtained account-level documentation from the seller or any prior owner of the account, and if so, identify the request, the response, and the documents received.
 *Annotation: this is the precise *Hinkle* failure: the furnisher had the right to request documents and did not exercise the right.*

56. Identify any policy, procedure, or threshold that Defendant uses to determine when account-level documentation will or will not be requested in connection with a dispute, including any cost-based, automation-based, or dispute-volume-based limit.

---

## Topic 11 — Identity-theft cases (§ 1681s-2(a)(6)–(7))

Identity-theft cases involve a discrete set of furnisher duties, including the duty not to refurnish blocked information and the duty to cease furnishing once an identity-theft report has been received.

**TEMPLATE — ADAPT TO CASE**

57. Identify each identity-theft report (within the meaning of 15 U.S.C. § 1681a(q)(4)), police report, FTC Identity Theft Report, or other identity-theft documentation received by Defendant concerning Plaintiff or Plaintiff's account.

58. State whether Defendant has any policy, procedure, or system flag that, upon receipt of an identity-theft report, blocks or suppresses further furnishing of the disputed information, and describe its application to Plaintiff's account.

59. Identify each instance in which Defendant continued to furnish information about Plaintiff's account after receipt of an identity-theft report, and state the basis for each instance.

60. State whether Defendant received notice from any CRA that information furnished about Plaintiff had been blocked under 15 U.S.C. § 1681c-2, and if so, identify the date and content of each notice and Defendant's response.

61. State whether, after receipt of any block notice referenced in Interrogatory 60, Defendant refurnished any of the blocked information to any CRA, and if so, identify each instance and the basis.

---

## Common defects and motion practice

Furnishers regularly object that interrogatories about Metro 2 fields, ACDV records, pattern dispute data, or policies and procedures are "overbroad," "unduly burdensome," "not proportional," or "trade secret." The plaintiff's response should: (1) tie each interrogatory to a specific element of § 1681s-2(b), Reg V, or willfulness; (2) accept reasonable temporal narrowing tied to the dispute window plus look-back relevant to pattern evidence; (3) propose a protective order under FRCP 26(c) for any genuinely proprietary material (Metro 2 internal mappings, vendor contracts, source code for automated rules); and (4) be prepared to use Rule 33(d) when the answer truly is found in business records, but to insist that Rule 33(d) requires identification of the records with the same specificity as an answer.

For categorical refusals to investigate certain dispute types, CFPB Circular 2022-07 is the authoritative guidance and should be invoked: imposing additional preferred-format or preferred-document requirements is not a basis for refusing to investigate.

---

## See also

- `discovery_06_RFPs_to_Furnishers.md` — document requests paired with these interrogatories
- `discovery_07_Requests_for_Admission_FCRA.md` — RFAs that lock in furnisher concessions
- `07_FCRA_Furnisher_Duties.md` — substantive law of § 1681s-2 and Reg V
- `11_FCRA_Case_Law_Circuits.md` — *Gorman*, *Saunders*, *Hinkle*, *Chiang*, *Williams*
- `12_Regulation_V_Summary.md` — 12 C.F.R. §§ 1022.40–.43 and Appendix E
- `13_FCRA_Agency_Guidance.md` — CFPB Circular 2022-07; Supervisory Highlights Issue 32
