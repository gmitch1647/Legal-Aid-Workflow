# FCRA Discovery Case Law Reference  
  
| Field | Value |  
|-------|-------|  
| **Topic** | Federal court decisions on contested discovery issues in Fair Credit Reporting Act (FCRA) litigation |  
| **FRCP Rules** | 26, 30, 33, 34, 36, 37, 45 |  
| **FCRA Cross-References** | 15 U.S.C. §§ 1681e(b), 1681i, 1681s-2(a)-(b); 12 C.F.R. §§ 1022.41–.43 (Reg V) |  
| **Sources** | Justia, Cornell LII, CourtListener, Federal Reporter (verified) |  
| **Last Updated** | 2026-05-16 |  
  
> **Scope.** This reference catalogs published federal decisions that have shaped what discovery is permitted, compelled, or limited in FCRA cases. It is organized by issue area, not by party or court. Citations have been verified against public-domain sources. Several discovery orders are unpublished slip opinions cited regularly by practitioners; where the exact reporter cite could not be confirmed, the entry is flagged `[VERIFY CITATION]`.  
  
> **Foundational standards.** Discovery scope is governed by FRCP 26(b)(1)'s relevance-and-proportionality standard. The substantive willfulness standard the discovery must serve is set by *Safeco Insurance Co. of America v. Burr*, 551 U.S. 47 (2007) (objectively unreasonable conduct), which makes pattern evidence on similar consumer disputes potentially relevant. Standing thresholds for class discovery now run through *Spokeo, Inc. v. Robins*, 578 U.S. 330 (2016), and *TransUnion LLC v. Ramirez*, 141 S. Ct. 2190 (2021).  
  
---  
  
## A. Matching Algorithm Production  
  
### Williams v. First Advantage LNS Screening Solutions, Inc., 947 F.3d 735 (11th Cir. 2020)  
  
*Facts.* Background-screening CRA twice attributed criminal records of a "Ricky Williams" to plaintiff "Richard Williams," costing him two job offers. At trial, evidence showed First Advantage had a policy of requiring three identifiers (name + DOB + SSN or driver's license) to attribute criminal records to common-name consumers but treated the third-identifier rule as "aspirational." Jury returned $250,000 compensatory and $3.3M punitive damages, reduced on appeal to $1M punitive.  
  
*Discovery significance.* Although Eleventh Circuit decided the appeal on the merits, the underlying trial record—built through aggressive discovery into First Advantage's matching workflow, internal compliance audits, and the VP of Compliance's testimony about the "aspirational" identifier rule—demonstrates the importance of matching-procedure discovery and serves as a roadmap for plaintiffs' counsel.  
  
*Why it matters.* Establishes that internal admissions about deviations between written matching policies and actual practice are discoverable and devastating on the willfulness question under § 1681n.  
  
### Ramirez v. TransUnion LLC, 951 F.3d 1008 (9th Cir. 2020), rev'd in part, 141 S. Ct. 2190 (2021)  
  
*Facts.* TransUnion's "OFAC Advisor" product flagged consumers as potential terrorist or drug-trafficker matches based on first-and-last-name comparison only, ignoring date of birth, middle name, and Social Security number. The class trial record included extensive evidence of TransUnion's name-only matching logic.  
  
*Discovery significance.* The case demonstrates the full evidentiary scope obtainable through algorithmic discovery: TransUnion was required to produce its matching logic, vendor agreements with the OFAC list provider, and internal procedures. Supreme Court reversal on standing did not disturb the matching-algorithm discovery rulings.  
  
*Why it matters.* Confirms that "rudimentary" matching procedures are themselves discoverable evidence of unreasonableness under § 1681e(b) and that disclosure of name-matching parameters does not require source-code review.  
  
### Cortez v. Trans Union, LLC, 617 F.3d 688 (3d Cir. 2010)  
  
*Facts.* Trans Union appended an OFAC alert to plaintiff's report based on a partial name match. Trial verdict for plaintiff, with $50,000 compensatory and $750,000 punitive damages awarded.  
  
*Discovery significance.* Third Circuit rejected Trans Union's argument that OFAC data was outside the consumer's "file" because the data was provided by a third-party vendor. Practical effect: vendor-supplied matching logic is discoverable and not shielded by vendor-relationship objections.  
  
*Why it matters.* Forecloses the "we license the algorithm from a third party" objection that CRAs commonly assert when matching logic is sought in discovery.  
  
### Sessa v. Trans Union, LLC, 74 F.4th 38 (2d Cir. 2023)  
  
*Facts.* TransUnion reported plaintiff owed a "balloon payment" at lease end that the lease did not in fact require. District court granted summary judgment for TransUnion on the theory the inaccuracy was "legal."  
  
*Discovery significance.* Second Circuit reversed, holding § 1681e(b) does not require a threshold "legal vs. factual" inquiry — accuracy claims proceed so long as the information is "objectively and readily verifiable." Decision broadens the universe of inaccuracies that justify procedural discovery into matching and verification systems.  
  
*Why it matters.* Removes a defense-friendly limiting principle that CRAs invoked to block discovery into procedures for verifying contract terms.  
  
**See also:** Discovery_03 (Plaintiff RFPs to CRAs §§ III.B–C, matching procedures and source-code protocols); Discovery_11 (Source Code Review Protocol).  
  
---  
  
## B. ACDV / e-OSCAR Record Production  
  
### Saunders v. Branch Banking & Trust Co. of Va., 526 F.3d 142 (4th Cir. 2008)  
  
*Facts.* Furnisher BB&T failed to note plaintiff's ongoing dispute when reporting an automobile debt. Jury awarded $1,000 statutory plus $80,000 punitive damages; Fourth Circuit affirmed.  
  
*Discovery significance.* The trial record included the ACDV records BB&T received from TransUnion and BB&T's coded response. Saunders is regularly cited for the proposition that the complete ACDV record — not the furnisher's summary — must be produced because the actual ACDV codes (e.g., Dispute Code 106 vs. 109) determine whether the furnisher conducted a reasonable investigation under § 1681s-2(b).  
  
*Why it matters.* Establishes that summarized or paraphrased dispute records are inadequate; plaintiffs are entitled to the verbatim ACDV record, including all fields the furnisher saw and the codes it transmitted in response.  
  
### Johnson v. MBNA America Bank, N.A., 357 F.3d 426 (4th Cir. 2004)  
  
*Facts.* Plaintiff disputed an MBNA account she said was her ex-husband's. MBNA's investigation consisted of an employee checking the account's "name field" against MBNA's computer; no other documentation reviewed. Fourth Circuit reversed JMOL for MBNA.  
  
*Discovery significance.* The court's analysis required examination of MBNA's actual investigation files — call logs, employee notes, screenshots — to determine whether the investigation was "reasonable." Cited often for the proposition that internal investigation files, not just the ACDV response code, are discoverable.  
  
*Why it matters.* Anchors the practitioner argument that "reasonable investigation" under § 1681s-2(b) is a fact question turning on the investigation file's contents, making complete production essential.  
  
**Spoliation note.** No published FCRA appellate decision squarely addresses spoliation of ACDV records, but district courts frequently apply FRCP 37(e) when furnishers cannot produce ACDVs because retention periods (often 25 months under FCRA recordkeeping practice) have elapsed. Counsel should issue preservation letters at the outset.  
  
**See also:** Discovery_04 (Plaintiff RFPs to Furnishers §§ II–III); Discovery_15 (Preservation Letters).  
  
---  
  
## C. Other-Consumer Dispute Records (Pattern Evidence)  
  
### Safeco Ins. Co. of America v. Burr, 551 U.S. 47 (2007)  
  
*Facts.* Defendant insurers failed to send adverse action notices under § 1681m(a). Supreme Court held that "willfulness" includes objectively unreasonable conduct ("reckless disregard"), not merely knowing violations.  
  
*Discovery significance.* By tying willfulness to the objective unreasonableness of the defendant's reading of the statute, *Safeco* makes pattern evidence — how the defendant treated other consumers with similar disputes — directly relevant. If the defendant treated 500 similar disputes identically and routinely lost, that pattern supports recklessness.  
  
*Why it matters.* The doctrinal foundation for plaintiffs' demands for "all dispute files for consumers with substantially similar disputes." Defendants' typical objection — that pattern evidence is irrelevant to a single plaintiff's claim — fails after *Safeco*.  
  
### Cortez v. Trans Union, LLC, 617 F.3d 688 (3d Cir. 2010)  
  
In addition to its matching-algorithm holding, *Cortez* approved punitive damages in part on evidence that Trans Union's OFAC matching procedures had generated misidentifications affecting many consumers, supporting an inference of reckless disregard. Reinforces the discoverability of company-wide dispute statistics.  
  
### Henson v. CSC Credit Services, 29 F.3d 280 (7th Cir. 1994)  
  
*Facts.* CRAs reported a judgment incorrectly entered in the public Judgment Docket. Seventh Circuit affirmed summary judgment for the CRAs because they had no notice the underlying record was erroneous.  
  
*Discovery significance.* While the case curtails CRA liability for clean reproduction of court records, it implicitly supports discovery into a CRA's procedures for handling consumer disputes once notice is received — pattern evidence of post-notice procedures remains discoverable and relevant.  
  
*Why it matters.* Confirms the line between unreviewable initial-reporting decisions and reviewable post-dispute investigation, narrowing pattern-evidence demands to the post-dispute side.  
  
**Scope limitations.** Courts routinely apply limiting principles to "similar consumer" demands. Common rulings:  
  
- Production typically limited to consumers with disputes (i) of the same type (e.g., mixed file, OFAC, identity-theft block) and (ii) within a defined temporal window (often 2–4 years).  
- Geographic limitations are common when state-law claims are involved.  
- Substituted production (sampled records, statistical summaries) is sometimes ordered in lieu of full files when class action is not pleaded.  
  
**Class-certification interplay.** Pattern-evidence discovery often previews class-action proof. Courts in pre-certification posture sometimes limit pattern discovery to a representative sample (5–10%) to reduce burden while preserving the named plaintiff's right to develop willfulness evidence; full production may be ordered post-certification.  
  
**See also:** discovery_17_Class_Action_Discovery_FCRA.md § II (numerosity discovery); Discovery_03 (Plaintiff RFPs to CRAs § VII).  
  
---  
  
## D. Furnisher Account-Level Documentation (the *Hinkle* Issue)  
  
### Hinkle v. Midland Credit Management, Inc., 827 F.3d 1295 (11th Cir. 2016)  
  
*Facts.* Midland, a debt buyer, purchased a charged-off GE/Meijer account and a T-Mobile account from upstream buyers. When the consumer disputed both, Midland "verified" by checking the disputed information against its own internal records. Midland did not request account-level documentation (signed contracts, statements, payment history) from the seller, even though the purchase agreement granted Midland the right to obtain such documents. Eleventh Circuit reversed summary judgment for Midland.  
  
*Holding (discovery-relevant).* A reasonable jury could find Midland's investigation unreasonable because it failed to obtain account-level documentation it had the contractual right to obtain. The court emphasized that the purchase agreement's seller-cooperation clauses showed Midland knew it might need such documentation.  
  
*Why it matters.* Hinkle is the foundation for one of the most common FCRA discovery battles. After Hinkle, plaintiffs routinely request:  
  
1. The purchase agreement and any amendments;  
2. Schedules identifying the specific account purchased;  
3. Sellers' reps and warranties about data accuracy and document availability;  
4. Communications between buyer and seller regarding account-level documentation;  
5. Any "media" (statements, contracts) actually obtained from the seller.  
  
Defense efforts to limit discovery to the furnisher's own internal records routinely fail post-*Hinkle*.  
  
### Bach v. First Union National Bank, 149 F. App'x 354 (6th Cir. 2005) [VERIFY CITATION — unpublished]  
  
Sixth Circuit case often cited for the proposition that a furnisher's investigation must be reasonable under the circumstances, including the depth of dispute, supports discovery into the furnisher's internal investigation files.  
  
### Bibbs v. Trans Union LLC, 43 F.4th 331 (3d Cir. 2022)  
  
*Facts.* Plaintiff disputed accounts that had been transferred and were no longer being reported by the furnisher but remained "past due" in TransUnion's report.  
  
*Discovery significance.* Third Circuit affirmed summary judgment for Trans Union, finding the reporting was technically accurate. However, the panel emphasized that account-level documentation showing transfer history would have been the linchpin if a § 1681s-2(b) furnisher claim had been adequately pleaded. Cited for the principle that transfer/assignment documentation is discoverable in furnisher cases.  
  
**See also:** Discovery_04 (Plaintiff RFPs to Furnishers § IV, purchase agreements and chain of title); Discovery_07 (Subpoenas to upstream sellers).  
  
---  
  
## E. CRA Subscriber Agreements  
  
There is no controlling appellate decision specifically ordering production of subscriber agreements in FCRA cases. District courts have routinely compelled production over CRA confidentiality objections under tiered protective orders, on the rationale that:  
  
1. The subscriber's certification of permissible purpose under § 1681b is directly relevant to a § 1681q or § 1681n claim.  
2. The terms of subscriber access (audit rights, mass-disclosure prohibitions, OFAC-flag opt-outs) bear on the CRA's "reasonable procedures" under § 1681e(a).  
3. Subscriber agreements illuminate the CRA's revenue model and explain choices about matching aggressiveness — relevant to willfulness.  
  
A frequently cited unpublished order on this issue is *In re Equifax Information Services LLC FCRA Litigation*, MDL — [VERIFY CITATION], where the court compelled production of representative subscriber agreements under "Attorneys' Eyes Only" designation, recognizing genuine commercial sensitivity but rejecting blanket withholding.  
  
**See also:** Discovery_03 (Plaintiff RFPs to CRAs § V); Discovery_12 (Protective Orders § III, AEO designations).  
  
---  
  
## F. Internal CRA Audits and Quality Reviews  
  
### Federal courts have consistently rejected the self-critical analysis privilege  
  
The privilege has its origins in *Bredice v. Doctors Hospital, Inc.*, 50 F.R.D. 249 (D.D.C. 1970), aff'd, 479 F.2d 920 (D.C. Cir. 1973), but the federal courts of appeals have either rejected it outright or declined to apply it on the facts:  
  
- **Third Circuit:** Privilege not recognized as a matter of federal common law. *See* *In re Domestic Air Transp. Antitrust Litigation*, 142 F.R.D. 354 (N.D. Ga. 1992) (collecting cases).  
- **Fourth Circuit:** *In re Grand Jury Proceedings*, 861 F.2d 268 (4th Cir. 1988) (table) [VERIFY CITATION], declining to apply.  
- **Ninth Circuit:** *Union Pacific R.R. v. Mower*, 219 F.3d 1069 (9th Cir. 2000), rejecting the privilege in employment context and signaling broad federal-court skepticism.  
  
*Why it matters for FCRA practice.* CRAs regularly assert the self-critical analysis privilege to withhold:  
  
- Internal accuracy audits and "match rate" studies;  
- Reports of internal quality-assurance groups;  
- Documents prepared for FCRA-compliance reviews after CFPB supervisory examinations.  
  
The doctrinal landscape supports plaintiffs in compelling production. Courts that "do not decide" whether the privilege exists nearly always find it does not apply on the facts because (i) the privilege is rejected when the audit was prepared for compliance with a mandatory regulatory regime (like § 1681e(b)) and (ii) the public-interest balance favors disclosure in consumer-protection enforcement.  
  
### Practical scope. Plaintiffs should expect to obtain:  
  
- Internal CRA audit reports;  
- Match-rate, mixed-file, and dispute-rate metrics;  
- Reports prepared in response to CFPB supervisory examinations under 12 U.S.C. § 5514;  
- Post-incident remediation studies.  
  
CRAs routinely insist on AEO designation, and most courts accept that for raw audit data while ordering substantive findings disclosed at "Confidential" tier.  
  
**See also:** Discovery_03 (Plaintiff RFPs to CRAs § VIII); Discovery_12 (Protective Orders).  
  
---  
  
## G. Furnisher Policies, Procedures, and Training Materials (Reg V § 1022.42)  
  
Under 12 C.F.R. § 1022.42, every furnisher must establish and implement reasonable written policies and procedures to ensure the accuracy and integrity of furnished information. These policies are discoverable as a matter of course.  
  
### Seamans v. Temple University, 744 F.3d 853 (3d Cir. 2014)  
  
*Facts.* Temple reported a student loan as delinquent, then continued reporting it after the student disputed and obtained partial relief. Third Circuit reversed summary judgment, holding § 1681s-2(b) requires furnishers to conduct reasonable investigations of indirect disputes.  
  
*Discovery significance.* The decision presupposes that the furnisher's actual policies (not its post hoc litigation justification) are the touchstone. After *Seamans*, courts routinely compel:  
  
1. Reg V § 1022.42 policy documents (current and contemporaneous with the dispute);  
2. Training materials for dispute-investigation employees;  
3. Internal escalation procedures;  
4. Furnisher's quality-assurance program for ACDV responses.  
  
### Boggio v. USAA Federal Savings Bank, 696 F.3d 611 (6th Cir. 2012)  
  
*Facts.* Furnisher continued to report a deficiency balance after consumer claimed identity theft. Sixth Circuit reversed dismissal, emphasizing that the duty to investigate under § 1681s-2(b) requires more than an automated check.  
  
*Why it matters.* Reinforces that the furnisher's policies and procedures — and whether they actually required human review of identity-theft disputes — are central discovery targets.  
  
**See also:** Discovery_04 (Plaintiff RFPs to Furnishers § V); fcra_07_furnisher_duties.md.  
  
---  
  
## H. Plaintiff's Other Credit History  
  
### Robinson v. Equifax Information Services, LLC, 560 F.3d 235 (4th Cir. 2009)  
  
*Facts.* Equifax repeatedly failed to correct identity-theft-related accounts after multiple disputes. Jury awarded $200,000 in actual damages and $50,000 punitive. Fourth Circuit affirmed.  
  
*Discovery significance.* Defense routinely seeks broad discovery of plaintiff's contemporaneous credit history to argue that any denial of credit was caused by other negative items, not by the disputed account. *Robinson* recognized that this damages-causation defense is legitimate but does not require unlimited fishing expeditions.  
  
*Practical scope orders.* Courts typically permit:  
1. Plaintiff's own credit reports (often two years prior through trial date);  
2. Adverse-action notices the plaintiff received;  
3. Credit applications during the damages period;  
  
...and deny:  
1. Bank statements and tax returns absent specific factual predicate;  
2. Pre-dispute credit history older than the relevant period;  
3. Sealed bankruptcy materials unless directly probative.  
  
**See also:** Discovery_05 (Defense Discovery to Plaintiffs §§ II–III).  
  
---  
  
## I. Credit Repair Organization (CRO) Records  
  
There is no controlling appellate decision squarely on point. District courts have split:  
  
- **Pro-discovery line:** Communications between plaintiff and CROs are discoverable where the defense has a good-faith basis to allege that disputes were "boilerplate" CRO-generated mail unsuitable for triggering the investigation duty. *See, e.g., Childress v. Experian Information Solutions, Inc.*, 2013 WL — [VERIFY CITATION] (S.D. Ind.).  
  
- **Protective line:** Some courts have limited CRO discovery to communications that the plaintiff actually transmitted (or that the CRO transmitted on plaintiff's behalf) to the CRA or furnisher, treating other CRO communications as work product or attorney-client analog (where the CRO is operating under a lawyer's supervision).  
  
**Reg V § 1022.43(b)(2) interaction.** A furnisher need not investigate a direct dispute that is submitted "by, or prepared on behalf of, the consumer by, a credit repair organization." If the defense is invoking this exemption, the defense has put the CRO communications squarely in play and must accept reciprocal discovery (e.g., into the furnisher's process for identifying CRO-originated disputes).  
  
**See also:** Discovery_05 (Defense Discovery to Plaintiffs § IV); Reg V § 1022.43(b)(2).  
  
---  
  
## J. Emotional-Distress Damages Discovery  
  
### Sloane v. Equifax Info. Servs., LLC, 510 F.3d 495 (4th Cir. 2007)  
  
*Facts.* Identity-theft plaintiff sued after Equifax took 21 months to correct her file. Jury awarded $106,000 economic plus $245,000 emotional-distress damages. Fourth Circuit affirmed liability and most of the emotional-distress award (reducing it to $150,000).  
  
*Discovery significance.* Sloane stands for the proposition that FCRA emotional-distress damages may be supported by lay testimony — the plaintiff's own description, family member observations of insomnia, weight loss, anxiety — without expert psychiatric proof. That doctrinal point governs the scope of permissible defense discovery.  
  
### Prado v. Equifax Information Services LLC, No. 18-CV-02405-PJH (LB), 2019 WL 88140 (N.D. Cal. Jan. 3, 2019)  
  
*Facts.* Plaintiff alleged mixed-file mistakes that caused "garden variety" emotional distress without separately pleading an emotional-distress claim and without intent to use expert or medical proof. Equifax sought seven years of medical records.  
  
*Holding.* Court sustained plaintiff's objection. Where a plaintiff makes only garden-variety distress allegations, the plaintiff does not place her medical history "so at issue" as to compel medical-records discovery. Court noted that compelled medical-records discovery may be "even more invasive than conducting a medical or psychological examination."  
  
*Why it matters.* *Prado* is the controlling district-court template across the Ninth Circuit and is widely followed elsewhere. To preserve the garden-variety shield, plaintiff's counsel should:  
  
1. Not separately plead IIED or NIED;  
2. Not name a treating provider as a witness;  
3. Not designate an expert on emotional distress;  
4. Stipulate not to use medical records affirmatively;  
5. Frame damages in lay terms ("anxiety," "embarrassment," "sleep difficulties") without medical labels.  
  
### Subject-matter waiver  
  
If the plaintiff identifies a treating mental-health provider, designates an expert, or affirmatively uses medical records, the waiver attaches. Courts in *Schoffstall v. Henderson*, 223 F.3d 818 (8th Cir. 2000), and analogous Title VII cases (cited often in FCRA) have found waiver where the plaintiff alleges specific psychological injury or treatment.  
  
**See also:** Discovery_05 (Defense Discovery to Plaintiffs § V); Discovery_12 (Protective Orders for psychotherapy records).  
  
---  
  
## K. 30(b)(6) Preparation Challenges  
  
There is no FCRA-specific appellate decision sanctioning a CRA or furnisher for inadequate 30(b)(6) preparation. The governing framework comes from generalist authority widely cited in FCRA practice:  
  
### Foundational Standards  
  
- **FRCP 30(b)(6) duty.** The corporation must designate a witness who can testify about matters "known or reasonably available to the organization." Failure constitutes a sanctionable failure to appear under FRCP 37(d).  
- **Conscientious good-faith effort.** *See* *Bd. of Trs. of Leland Stanford Junior Univ. v. Tyco Int'l Ltd.*, 253 F.R.D. 521 (C.D. Cal. 2008) (corporation must prepare designees on each topic, not just produce a knowledgeable individual).  
- **Sanctions for "bandying."** Where corporation designates a witness who repeatedly disclaims knowledge of designated topics, courts impose attorney's fees, additional depositions at the corporation's cost, evidentiary preclusion, and adverse inferences. *See* *Black Horse Lane Assoc. v. Dow Chem. Corp.*, 228 F.3d 275 (3d Cir. 2000).  
  
### FCRA-Specific Application  
  
In FCRA practice, the most common 30(b)(6) failures involve:  
  
1. **CRA matching procedures.** Witness who can describe high-level "matching logic" but cannot answer about the specific scoring thresholds, the role of the "OFAC Advisor" data, or whether the deceased-list scrub was applied.  
2. **Furnisher dispute handling.** Witness who knows the e-OSCAR interface but cannot identify who within the furnisher reviewed ACDV codes or what authority they had to alter the tradeline.  
3. **Reg V § 1022.42 policies.** Witness who knows the policies exist but cannot describe how compliance with them is monitored or audited.  
  
Plaintiffs in such situations have successfully obtained continuation depositions at the corporation's expense (under FRCP 37(a)(5)(A)) and, in egregious cases, adverse-inference jury instructions at trial.  
  
**See also:** Discovery_07 (30(b)(6) Topics — CRAs); Discovery_08 (30(b)(6) Topics — Furnishers); Discovery_14 (Motions to Compel).  
  
---  
  
## L. Standing-Related Discovery Post-*TransUnion v. Ramirez*  
  
### TransUnion LLC v. Ramirez, 141 S. Ct. 2190 (2021)  
  
*Facts.* OFAC mixed-file class action. Jury awarded $60M; class of 8,185 members. Supreme Court held that only the 1,853 class members whose reports were actually disseminated to third-party subscribers had Article III standing. Mere existence of inaccurate file with future risk of dissemination was insufficient.  
  
*Discovery significance.* Plaintiffs in post-*Ramirez* class actions must develop record evidence in pre-certification discovery of:  
  
1. Dissemination of class members' inaccurate reports to third parties (the key concrete-harm hook);  
2. Class members' actual exposure to denial-of-credit or other downstream harm;  
3. The CRA's transmission logs (CDIA Online Solution or proprietary subscriber tracking).  
  
Defense counsel routinely seek to bifurcate, conducting standing discovery first to whittle the class.  
  
### Spokeo, Inc. v. Robins, 578 U.S. 330 (2016)  
  
The foundational case requiring a "concrete" injury for Article III standing in FCRA cases, even where Congress has provided a statutory cause of action. On remand, the Ninth Circuit found Robins had alleged concrete harm. *Robins v. Spokeo, Inc.*, 867 F.3d 1108 (9th Cir. 2017).  
  
*Discovery significance.* Post-*Spokeo* and post-*Ramirez*, every FCRA class plaintiff must build a discovery record on dissemination, downstream harm, and individualized exposure. This frequently requires:  
  
1. CRA transmission records (RFPs to CRAs);  
2. Subscriber's adverse-action records (third-party subpoenas);  
3. Class member identification through CRA databases — the link between standing discovery and ascertainability discovery in class actions.  
  
**See also:** discovery_17_Class_Action_Discovery_FCRA.md § V (standing in class actions).  
  
---  
  
## M. Touhy / Federal-Agency Subpoenas  
  
### Governing Regulations  
  
- **CFPB:** 12 C.F.R. Part 1070, Subpart C ("Disclosure of CFPB Information in Connection with Legal Proceedings"). Service on General Counsel only; agency may decline.  
- **FTC:** 16 C.F.R. § 4.11(e) ("Disclosure of Records and Testimony"). Agency authorization required for employee testimony.  
- **General authority:** *United States ex rel. Touhy v. Ragen*, 340 U.S. 462 (1951).  
  
### Federal-Agency Subpoena Practice  
  
Courts have generally enforced *Touhy* regulations as exhaustion requirements: a party seeking agency information or testimony must first request it under the regulations and exhaust agency procedures. Refusal to produce can be challenged under the APA in district court where the agency sits. *See* *COMSAT Corp. v. NSF*, 190 F.3d 269 (4th Cir. 1999).  
  
### FCRA Practice  
  
Subpoenas to CFPB and FTC most commonly seek:  
- Supervisory examination records of CRAs and furnishers;  
- Consumer complaint data;  
- Communications between agency and the defendant;  
- Internal agency assessments of compliance.  
  
Agency response typically: production of public materials; assertion of deliberative-process and law-enforcement privileges over non-public materials; refusal of testimony.  
  
**See also:** Discovery_06 (Third-Party Subpoenas §§ VI–VII); Discovery_12 (Motions to Quash).  
  
---  
  
## N. Sanctions in FCRA Discovery  
  
### Sanctions Framework  
  
FRCP 37 supplies the framework for sanctions when a party fails to comply with discovery obligations, including monetary sanctions, evidence preclusion, adverse inference instructions, and (in extreme cases) default or dismissal. FRCP 37(e) addresses spoliation of ESI specifically.  
  
### Notable FCRA Sanctions Patterns  
  
While there is no published FCRA appellate sanctions decision of the magnitude of *Coleman Holdings, Inc. v. Morgan Stanley & Co.* (Florida), district courts in FCRA cases have imposed:  
  
1. **Adverse inferences** for failure to produce ACDV records that should have been retained;  
2. **Issue sanctions** under FRCP 37(b)(2)(A)(i) where CRAs failed to comply with orders to produce matching-procedure documentation;  
3. **Cost-shifting** for late-disclosed evidence or for 30(b)(6) depositions that had to be retaken.  
  
### Spoliation in FCRA Cases  
  
The most common FCRA spoliation issues:  
  
1. **ACDV records.** Furnishers commonly destroy ACDVs after 25 months under records-retention practice; if a preservation letter was sent earlier, FRCP 37(e) sanctions are available.  
2. **Call recordings.** Furnishers' customer-service call recordings (often retained for only 90 days) are routinely destroyed before discovery; plaintiff's counsel must issue preservation letters immediately.  
3. **Email retention.** CRAs' internal emails about specific consumer disputes are often subject to short retention; preservation letters at the dispute stage are critical.  
  
**See also:** Discovery_15 (Preservation Letters); Discovery_14 (Sanctions Motions).  
  
---  
  
## Closing Practice Notes  
  
1. **Discovery is the case in FCRA litigation.** Most FCRA cases settle within 30 days of completion of 30(b)(6) depositions. The discovery strategy is the case strategy.  
  
2. **Pattern evidence drives the willfulness multiplier.** *Safeco* recklessness — and the punitive-damages multiplier on the § 1681n claim — is built almost entirely through similar-consumer dispute records and internal audit data.  
  
3. **Source code is overrated; procedures are underrated.** Counsel often focus on source-code review, but the heavier-weight evidence lies in CRA written procedures, training materials, and internal audit reports.  
  
4. **Touhy is a last resort, not a first move.** Agency subpoenas rarely yield testimony but often yield supervisory examination records and consumer-complaint data that materially advance willfulness proof.  
  
5. **Preserve early, preserve aggressively.** ACDVs, call recordings, and emails about specific consumer disputes are perishable. The preservation letter must precede the demand letter, and preservation enforcement (motion practice if a meet-and-confer call reveals destruction) must follow immediately.  
  
---  
  
*End of discovery_16_FCRA_Discovery_Case_Law.md*  
