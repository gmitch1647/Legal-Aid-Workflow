# FCRA Discovery Strategy Overview — Plaintiff-Side Against CRAs

**Topic:** Strategic framework for plaintiff-side written and oral discovery against consumer reporting agencies (CRAs) in FCRA litigation
**Primary statutes:** 15 U.S.C. §§ 1681 et seq.; Fed. R. Civ. P. 26, 30, 33, 34, 36, 45
**Regulation:** 12 C.F.R. Part 1022 (Regulation V)
**Cross-references:**
- `discovery_02_FCRA_Initial_Disclosures.md`
- `discovery_03_Interrogatories_to_CRAs.md`
- `discovery_04_RFPs_to_CRAs.md`
**Audience:** Consumer-side plaintiffs' counsel suing the Big Three (Equifax, Experian, TransUnion) and specialty CRAs (LexisNexis Risk, ChexSystems, CoreLogic, First Advantage, HireRight, Sterling, Checkr, MIB Group, etc.)
**Last updated:** May 2026

> **SOURCE DISCIPLINE:** This file is built from public-domain primary sources (the FCRA statute, Regulation V, FRCP, published federal opinions, CFPB and FTC guidance, and concepts commonly shared in CLE materials and bar publications). No proprietary practitioner-treatise content is reproduced.

---

## 1. Discovery Objectives by Claim Type

The first analytical move in every FCRA discovery plan is to map the operative claims to the statutory elements that will have to be proved. Each subsection of the Act drives different document categories and different deposition topics. A plaintiff who blanket-serves discovery without tying each request to a statutory element is inviting overbreadth and proportionality objections under Rule 26(b)(1) (as amended December 1, 2015).

### 1.1 § 1681e(b) — Reasonable Procedures to Assure Maximum Possible Accuracy

This is the workhorse claim against CRAs. The plaintiff must prove (i) inaccurate information was included in a consumer report, (ii) the inaccuracy was due to the CRA's failure to follow reasonable procedures to assure maximum possible accuracy, (iii) the consumer suffered injury, and (iv) the injury was caused by the inaccuracy. *See, e.g., Sarver v. Experian Info. Solutions*, 390 F.3d 969 (7th Cir. 2004); *Cushman v. Trans Union Corp.*, 115 F.3d 220 (3d Cir. 1997).

Discovery objectives:
- Identify every procedure used to assemble the plaintiff's file (intake of furnisher tapes, matching logic, file segmentation).
- Obtain matching-algorithm documentation — partial-match thresholds, identifier weights, scoring rules, exception logic. This is the central battleground in mixed-file and identity-confusion cases. *See Williams v. First Advantage Background Servs. Corp.*, 947 F.3d 735 (11th Cir. 2020) (matching procedures using only name + DOB without SSN held willfully unreasonable for a common name).
- Obtain notice-of-inaccuracy materials — CFPB complaints, prior lawsuits, internal QA reports — that show the CRA was on notice of systemic problems with the relevant data type.

### 1.2 § 1681i — Reinvestigation Duties

When a consumer disputes information directly with a CRA, the CRA must "conduct a reasonable reinvestigation to determine whether the disputed information is inaccurate" within 30 days (45 if the dispute is accompanied by additional information mid-investigation). 15 U.S.C. § 1681i(a)(1)(A).

Discovery objectives:
- Map the dispute pipeline end-to-end: receipt, coding, transmission via e-OSCAR/ACDV to the furnisher, receipt of the furnisher response, posting to the consumer's file, consumer notification.
- Quantify human involvement: how many minutes (often seconds) does the CRA's dispute agent spend per dispute? *See Hinkle v. Midland Credit Mgmt., Inc.*, 827 F.3d 1295 (11th Cir. 2016) (perfunctory automated verification supports willful-violation inference).
- Obtain dispute-code translation tables. CRAs typically reduce free-form consumer disputes to a two-digit ACDV code drawn from a roster of roughly 26 standard codes — a process that loses substantial information from the consumer's narrative.
- Identify what (if any) consumer-supplied documents were transmitted to the furnisher.

### 1.3 § 1681s-2(b) — Furnisher Reinvestigation Duties

Section 1681s-2(b) creates a private right of action against furnishers who receive a dispute notice from a CRA and fail to conduct a reasonable investigation. (By contrast, § 1681s-2(a) is enforceable only by regulators.) Although this file focuses on CRAs, plaintiffs almost always sue both the CRA and the furnisher in tandem; discovery from the CRA establishes what the furnisher received.

Discovery objectives from the CRA in support of the furnisher claim:
- Production of the precise ACDV transmitted, including the dispute code, narrative field, and any attached documents.
- Production of the furnisher's response (the ACDV "Response"), including the response code and any free-text notes.
- Subscriber agreements and audit records showing what the CRA represented to the furnisher about the furnisher's investigation duties.

### 1.4 § 1681b — Permissible Purpose

A CRA may furnish a consumer report only for a permissible purpose enumerated in § 1681b(a). When a plaintiff alleges an impermissible pull (e.g., a debt collector running a report on a non-debtor, or a former spouse using employer credentials to pull a credit file), discovery focuses on:
- The subscriber agreement and certifications under § 1681e(a).
- The CRA's user-verification procedures — how does the CRA confirm that a new subscriber has a permissible purpose?
- The "soft pull" vs. "hard pull" record for the plaintiff's file.
- The CRA's procedures for auditing subscriber pulls (random sampling, anomaly detection).

### 1.5 § 1681m — Adverse Action

§ 1681m is now enforceable only by regulators (post-*Safeco*-era Congressional action eliminated the private right of action for § 1681m(h), and § 1681m(a) is regulator-only), but adverse-action notices remain critically relevant in damages discovery — they document the credit denials that drive emotional-distress and economic-harm theories.

### 1.6 § 1681b(b) — Employment Background Checks

For employment screening cases against specialty CRAs (First Advantage, HireRight, Sterling, Checkr), the plaintiff must prove the CRA furnished a report for employment purposes without (i) the user's certification of compliance with § 1681b(b)(1), (ii) clear and conspicuous written disclosure to the consumer, or (iii) the consumer's written authorization.

Discovery objectives:
- The user (employer) certification on file.
- The disclosure-and-authorization template the CRA distributed.
- Procedures for ensuring "matters of public record" are complete and up-to-date per § 1681k.
- The criminal-record matching algorithm (often distinct from the credit-file algorithm).

### 1.7 Identity-Theft Cases — §§ 1681c-2, 1681i(a)(5)

When the underlying inaccuracy is identity theft, additional duties apply: blocking of fraudulent information within four business days of receipt of an identity-theft report (§ 1681c-2), and special reinvestigation procedures (§ 1681i(a)(5)). Discovery targets the CRA's processing of the FTC Identity Theft Report and its compliance with the four-business-day blocking deadline.

---

## 2. Sequencing — When to Serve What

### 2.1 Initial Disclosures (Rule 26(a)(1))

See `discovery_02_FCRA_Initial_Disclosures.md`. The plaintiff should disclose damages categories early — emotional distress, denied credit, lost employment, time-off-work, out-of-pocket expenses — but be careful about disclosing specific witnesses (treating physicians, employers) before privilege and HIPAA waiver issues have been worked through.

### 2.2 Early Written Discovery (Day 30–90 Post Rule 26(f) Conference)

The first wave should be narrow and high-leverage:
- One short interrogatory set (10–15 questions) targeting custodians, retention periods, and the identity of the corporate witnesses likely to be designated under Rule 30(b)(6).
- A focused first RFP set targeting the plaintiff's own file: the disclosure file, the dispute history, the ACDVs, the consumer's complete file as defined by § 1681g.
- A request for the matching-algorithm documentation in concept (high-level technical specifications), even though the actual source-code fight will follow later.

### 2.3 Second-Wave Written Discovery (Day 90–180)

Once the plaintiff has the file and dispute records, broader discovery follows:
- Pattern evidence — other-consumer complaints involving similar errors. *Cf.* FRE 404(b) (admissible to prove notice, knowledge, willfulness, and absence of mistake).
- CFPB and FTC supervisory correspondence.
- Internal audits and quality reviews.
- Furnisher subscriber agreements and certifications.

### 2.4 Depositions

Order matters. Consider:
1. **Rule 30(b)(6) on dispute processing** — what happened with this consumer's dispute? This locks in the CRA's narrative early.
2. **Rule 30(b)(6) on matching/file assembly** — typically a different witness; addresses the underlying accuracy claim.
3. **Rule 30(b)(6) on subscriber management / permissible purpose** — if applicable.
4. **Furnisher 30(b)(6) deposition** — informed by the ACDV records the CRA has produced.
5. **Fact witnesses** — the specific dispute agent who handled the consumer's file, if identifiable.

### 2.5 Expert Discovery

Plaintiff experts typically include:
- A credit-reporting industry expert (often a retired CRA or furnisher employee) who can testify about reasonable procedures.
- A consumer-credit economist for damages (lost credit opportunities, interest-rate differential).
- A treating mental-health provider for emotional distress.

Reserve expert disclosures for after fact discovery so the expert can opine on the actual procedures rather than the procedures as described in marketing materials.

---

## 3. Targets — Who to Serve and What to Subpoena

- **CRA defendants** — interrogatories, RFPs, RFAs, 30(b)(6) depositions.
- **Furnisher defendants** — parallel discovery; cross-reference the CRA's ACDV records.
- **Third-party furnishers** — Rule 45 subpoenas (data tapes, dispute responses).
- **Plaintiff's creditors / lenders / employers** — Rule 45 subpoenas for adverse-action records, internal scoring notes, and the third-party reports they relied on.
- **Background-screening end-users (employers)** — Rule 45 subpoenas for the report copy, the adverse-action timeline, and the disclosure-and-authorization forms used.
- **CFPB and FTC** — FOIA requests and Touhy subpoenas for supervisory examination reports (heavily redacted in practice, but supervisory non-public information may be obtained through formal Touhy procedure).
- **Credit repair organizations** — if implicated in the dispute chain, but careful: many CROs are themselves defendants or co-conspirators with the consumer.

---

## 4. Common Defense Objections and How to Overcome Them

### 4.1 Relevance

Defense will frame § 1681e(b) discovery as "your client's individual file is the only thing that matters." Respond by tying each request to a statutory element. Procedures that produced *other* mixed files are directly relevant to whether the procedure used in the plaintiff's case was "reasonable." Courts routinely allow this scope. *See, e.g., Williams v. First Advantage*, supra (admitting evidence of prior identical errors to support willfulness).

### 4.2 Overbreadth / Proportionality (Rule 26(b)(1) post-2015)

The December 1, 2015 amendments moved the proportionality factors into the very definition of discoverable matter. Defense routinely cites this. Plaintiff's counter:
- Frame the request narrowly in time (e.g., the 2-year period preceding and following the events at issue).
- Tie the request to a specific data field or matching parameter (not "all algorithms").
- Emphasize the parties' "relative access to relevant information" — Rule 26(b)(1) was amended to include this factor, and it cuts hard in plaintiff's favor where the CRA controls all the relevant evidence.
- Emphasize the "importance of the issues" — FCRA cases vindicate statutory rights, and many courts treat consumer-protection statutes as enhancing the importance prong.

### 4.3 Trade Secret / Proprietary Algorithm

The single most-litigated CRA discovery objection. CRAs claim their matching algorithms are competitively sensitive trade secrets. Plaintiff's response:
- A trade-secret claim is not an absolute bar; it requires a showing of need balanced against confidentiality interest. *See* Fed. R. Civ. P. 26(c)(1)(G).
- Offer a robust two-tier protective order with an "attorneys' eyes only" / "highly confidential — source code" tier and on-site / clean-room review protocols.
- Cite published opinions ordering production of CRA matching procedures subject to protective order. *See, e.g.*, in mixed-file cases courts have repeatedly ordered production of partial-match thresholds and decision logs.

### 4.4 Work Product / Attorney-Client Privilege

CRAs sometimes claim that post-dispute internal investigations were conducted "in anticipation of litigation." This claim is weak where the investigation is part of the CRA's statutorily mandated § 1681i reinvestigation duty — the investigation is required by law, not prepared in anticipation of litigation. Insist on a privilege log under Rule 26(b)(5)(A).

### 4.5 Apex Doctrine

CRAs invoke the "apex" doctrine to block depositions of senior executives. Plaintiff's response: show unique personal knowledge (e.g., a public statement, congressional testimony, or signed policy document) and exhaustion of lower-level alternatives.

---

## 5. Protective Order Strategy — Algorithm Protection Is the Central Battleground

The protective order is, in modern FCRA practice, more strategically important than the complaint. A poorly negotiated PO will block plaintiff's expert from meaningfully reviewing the matching algorithm; a well-negotiated one will give the expert clean-room access with sufficient annotation time to render an opinion.

Key provisions to negotiate:
- **Tiers of confidentiality.** Standard practice is three tiers: (i) "Confidential" (ordinary business records), (ii) "Highly Confidential — Attorneys' Eyes Only" (subscriber lists, internal audits), (iii) "Highly Confidential — Source Code" (matching algorithm source, partial-match thresholds, scoring weights).
- **Source-code review protocol.** On-site at producing party's counsel's office; standalone non-networked computer; ban on photography or screen-capture; printed extracts limited and Bates-stamped; plaintiff's experts identified by name and subject to disqualification challenges before access.
- **Expert disclosure.** Producing party gets a window (commonly 10 business days) to object to a specific expert based on competitive harm; objection grounds must be substantive, not just "competitor."
- **Sunset / destruction clauses.** All source-code materials returned or destroyed at case conclusion; certification of destruction.
- **Use in other litigation.** Permit use in related cases (multi-district, parallel actions) by stipulation, to avoid duplicative algorithm-discovery fights.

Practice tip: Negotiate the protective order in parallel with the Rule 26(f) report. Do not wait until the source-code dispute is ripe — by then, you will be in a worse bargaining position.

---

## 6. Class-Action vs. Individual-Case Discovery Differences

### 6.1 Individual Cases

In individual FCRA cases, discovery is focused on (a) the plaintiff's specific file and the procedures used to assemble it, (b) pattern evidence to support willfulness, and (c) damages. Class certification is not at issue, so plaintiff has somewhat narrower latitude for "other consumer" discovery, but pattern evidence remains relevant to willfulness under *Safeco* — discovery of similar prior incidents is admissible to show the CRA "ran a risk of violating the law substantially greater than the risk associated with a reading that was merely careless." *Safeco Ins. Co. of Am. v. Burr*, 551 U.S. 47, 69 (2007).

### 6.2 Class Actions

In putative class actions, pre-certification discovery is bifurcated in many jurisdictions: class discovery first (commonality, typicality, ascertainability), merits discovery later. Plaintiff should:
- Front-load discovery on the **uniform procedure** — that's the predominant-common-question driver under Rule 23(b)(3).
- Seek class-list data early (subject to protective order) to test ascertainability.
- Demand statistical samples of other consumers' files affected by the challenged procedure.
- Anticipate the CRA's "individualized injury" defense by securing data on the percentage of files where the procedure produced an objectively verifiable error.

Beware of post-*TransUnion LLC v. Ramirez*, 141 S. Ct. 2190 (2021), Article III standing requirements: class members must have suffered concrete injury — for most absent class members, that means demonstrating publication to a third party. Discovery must therefore target publication records, not just file-content errors.

---

## 7. Practice Tips and Pitfalls

1. **Do not lead with a 60-interrogatory megaservice.** Rule 33(a)(1) caps interrogatories at 25 absent stipulation or court order. Use the budget strategically.
2. **Pin down e-OSCAR coding early.** The dispute-code translation determines what the furnisher actually saw — and is often dispositive on the "reasonable reinvestigation" question.
3. **Get the consumer's complete file under § 1681g first, by self-help.** Before serving discovery, have the consumer request the full file disclosure. This often reveals data the CRA will later claim does not exist.
4. **Preserve metadata.** Many CRA dispute-handling systems log timestamps and agent-IDs. Demand native-format production with metadata preserved.
5. **Watch the 30-day reinvestigation clock.** Production of the dispute-handling timeline is often the single most damning exhibit at summary judgment.
6. **Do not concede "automated review is reasonable."** *Hinkle*, supra, and a growing body of district-court authority support the view that purely automated reinvestigation can support a willfulness finding. Build the record.
7. **Audit your own protective order draft.** CRAs often propose protective orders that quietly include clauses prohibiting expert testimony based on confidential materials, or requiring destruction of work product within 30 days of case conclusion. Read every clause.
8. **Use the FTC's 40 Years of Experience report.** The FTC's 2011 staff report "40 Years of Experience with the Fair Credit Reporting Act" is public-domain authoritative interpretation and can be cited in discovery briefs to support the relevance of matching-procedure inquiries.
9. **Document the negative.** Build the record of what the CRA *did not* do (did not contact the furnisher independently; did not review documents the consumer attached; did not investigate after the second dispute). The absence of action is often more probative than any single affirmative procedure.
10. **Cross-pollinate with CFPB enforcement actions.** Public CFPB consent orders against Equifax, Experian, and TransUnion describe procedural deficiencies in granular detail. Quote them in discovery briefs to show that the procedures the plaintiff seeks to discover have already been publicly identified as deficient.

---

## See also

- `discovery_02_FCRA_Initial_Disclosures.md` — Rule 26(a)(1) disclosure templates and damages computation
- `discovery_03_Interrogatories_to_CRAs.md` — Sample interrogatories by topic
- `discovery_04_RFPs_to_CRAs.md` — Sample document requests and source-code production protocols
- `FCRA_Statute_Annotated.md` — section-by-section statutory text
- `FCRA_Caselaw_Circuit_Decisions.md` — circuit-by-circuit holdings on procedural reasonableness

---

*End of file.*
