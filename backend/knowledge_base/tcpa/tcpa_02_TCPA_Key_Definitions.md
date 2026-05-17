# TCPA Key Definitions — 47 U.S.C. § 227(a)  
  
**Topic:** Core defined terms in the Telephone Consumer Protection Act  
**Primary statute:** 47 U.S.C. § 227(a)  
**Implementing regulation:** 47 C.F.R. § 64.1200(f) (parallel FCC definitions)  
**Last updated:** May 16, 2026  
  
---  
  
## 1. Overview  
  
Every TCPA claim turns on the statutory definitions in 47 U.S.C. § 227(a). The substantive prohibitions in § 227(b), (c), and (d) are written in terms that incorporate these definitions, and the FCC's implementing rules at 47 C.F.R. § 64.1200(f) largely track—and in some respects expand on—them. After the Supreme Court's decision in *Facebook, Inc. v. Duguid*, 592 U.S. 395 (2021), and the FCC's 2024 declaratory ruling on AI-generated voice, the contours of several of these definitions have shifted significantly. This file walks through each defined term, the corresponding regulatory definition, the leading authority, and the practical issues that recur in litigation.  
  
The TCPA itself is short (less than 10 statutory pages), but its definitions do enormous work. A defendant who can defeat the application of a single definition—most commonly "automatic telephone dialing system"—can often dispose of a claim at the pleading stage. Plaintiffs' counsel correspondingly must plead facts that bring each definition into play.  
  
---  
  
## 2. "Automatic Telephone Dialing System" — § 227(a)(1)  
  
The most heavily litigated TCPA term. The statute defines an "automatic telephone dialing system" (ATDS, often "autodialer") as:  
  
> "equipment which has the capacity—(A) to store or produce telephone numbers to be called, using a random or sequential number generator; and (B) to dial such numbers." — 47 U.S.C. § 227(a)(1).  
  
### 2.1 The post-Duguid construction  
  
In *Facebook, Inc. v. Duguid*, 592 U.S. 395, 399 (2021), a unanimous Supreme Court (Sotomayor, J.) held that "[t]o qualify as an 'automatic telephone dialing system,' a device must have the capacity either to store a telephone number using a random or sequential generator or to produce a telephone number using a random or sequential number generator." In other words, the random-or-sequential-number-generator (RSNG) modifier attaches to both verbs—"store" and "produce." Equipment that merely stores numbers without using an RSNG, and dials from a curated list, is not an ATDS.  
  
This narrow construction is treated in depth in `tcpa_03_ATDS_Post_Duguid.md`. The key practical point at the definition level: a plaintiff must allege capacity to use an RSNG, not merely capacity to store and dial.  
  
### 2.2 "Capacity"  
  
The statute reaches equipment that "has the capacity"—not equipment that actually used the capacity. The Third Circuit in *Panzarella v. Navient Solutions, LLC*, 37 F.4th 867 (3d Cir. 2022), however, held that liability requires that the defendant "use" the equipment's ATDS capacity—it is not enough that the equipment could theoretically have used an RSNG. Courts continue to split on whether pleading capacity alone, without use, satisfies the standard.  
  
### 2.3 FCC's parallel definition  
  
47 C.F.R. § 64.1200(f)(2) (formerly (f)(1)) tracks the statutory language. The FCC's pre-Duguid expansive readings—including the 2003 and 2015 orders that swept in predictive dialers regardless of RSNG capacity—were largely set aside by *ACA International v. FCC*, 885 F.3d 687 (D.C. Cir. 2018), and superseded by *Duguid*.  
  
---  
  
## 3. "Called Party"  
  
The statute uses the phrase "called party" in § 227(b)(1)(A) but does not define it. The phrase is at the heart of the recycled-number / reassigned-number problem: when a cell number is reassigned from a consenting consumer to a new subscriber, is the consent of the original holder still operative?  
  
### 3.1 Circuit interpretation  
  
The Seventh Circuit in *Soppet v. Enhanced Recovery Co.*, 679 F.3d 637 (7th Cir. 2012) (Easterbrook, J.), held that "called party" means the current subscriber—not the intended recipient. The Eleventh Circuit in *Osorio v. State Farm Bank, F.S.B.*, 746 F.3d 1242 (11th Cir. 2014), agreed. Under this reading, a caller who reaches a new subscriber on a recycled number cannot rely on the prior subscriber's consent.  
  
### 3.2 FCC treatment  
  
In its 2015 Omnibus Order, the FCC adopted the "intended recipient" plus one-call safe harbor; the D.C. Circuit vacated that approach in *ACA International*. The FCC has since established the Reassigned Numbers Database (47 C.F.R. § 64.1200(l)) and a corresponding safe harbor for callers who properly query it. (See `tcpa_04_Prior_Express_Consent.md` § 5.)  
  
### 3.3 Practical effect  
  
Counsel for callers should treat "called party" as the current subscriber and assume that consent is non-transferable upon reassignment. Counsel for consumers should plead facts establishing the plaintiff's current subscriber status at the time of the call.  
  
---  
  
## 4. "Telephone Solicitation" — § 227(a)(4)  
  
> "the initiation of a telephone call or message for the purpose of encouraging the purchase or rental of, or investment in, property, goods, or services, which is transmitted to any person." — 47 U.S.C. § 227(a)(4).  
  
The definition expressly excludes calls or messages:  
  
- **(A)** to any person with that person's prior express invitation or permission;  
- **(B)** to any person with whom the caller has an established business relationship (EBR); or  
- **(C)** by a tax-exempt nonprofit organization.  
  
### 4.1 Relationship to "telemarketing"  
  
The FCC defines "telemarketing" at 47 C.F.R. § 64.1200(f)(13) in nearly identical terms ("the initiation of a telephone call or message for the purpose of encouraging the purchase or rental of, or investment in, property, goods, or services"). The two terms are often used interchangeably, but "telephone solicitation" is the statutory term that triggers § 227(c) and the Do-Not-Call rules; "telemarketing" is the regulatory term used in the prior-express-written-consent rules of § 64.1200(a)(2)–(3).  
  
### 4.2 Dual-purpose calls  
  
A call that conveys account information but also promotes a new product is treated as a "telephone solicitation" / "advertisement." See *Chesbro v. Best Buy Stores, L.P.*, 705 F.3d 913 (9th Cir. 2012). The FCC's 2012 TCPA Order adopted a "primary purpose" test that has been criticized but remains in force.  
  
---  
  
## 5. "Established Business Relationship" — § 227(a)(2)  
  
The TCPA itself defers to the FCC's definition. 47 C.F.R. § 64.1200(f)(5) provides:  
  
> "a prior or existing relationship formed by a voluntary two-way communication between a person or entity and a residential subscriber with or without an exchange of consideration, on the basis of the subscriber's purchase or transaction with the entity within the eighteen (18) months immediately preceding the date of the telephone call or on the basis of the subscriber's inquiry or application regarding products or services offered by the entity within the three months immediately preceding the date of the call, which relationship has not been previously terminated by either party."  
  
### 5.1 Two windows  
  
- **18 months** from the date of a "purchase or transaction."  
- **3 months** from the date of an "inquiry or application."  
  
### 5.2 What an EBR does and does not do  
  
An EBR is an exemption from the "telephone solicitation" definition and, in the residential-DNC context, from the requirement that a caller not call a residential number on the federal DNC list. *It is not an exemption from the prior-express-written-consent requirement* for autodialed or prerecorded marketing calls to cell phones. See 47 C.F.R. § 64.1200(a)(2)–(3); 2012 TCPA Order (FCC 12-21). This is one of the most common compliance mistakes among small marketers.  
  
### 5.3 Termination  
  
A consumer can terminate the EBR at any time by making a do-not-call request. § 64.1200(f)(5)(i).  
  
---  
  
## 6. "Telephone Facsimile Machine" — § 227(a)(3)  
  
> "equipment which has the capacity (A) to transcribe text or images, or both, from paper into an electronic signal and to transmit that signal over a regular telephone line, or (B) to transcribe text or images (or both) from an electronic signal received over a regular telephone line onto paper."  
  
This definition is at the center of the long-running "junk fax" jurisprudence. The Supreme Court's decision in *PDR Network, LLC v. Carlton & Harris Chiropractic, Inc.*, 588 U.S. 1 (2019), addressed whether the Hobbs Act required district courts to follow the FCC's 2006 interpretation of "unsolicited advertisement"; the Court remanded without resolving the underlying issue.  
  
### 6.1 Online fax services  
  
In *Amerifactors Financial Group, LLC*, 34 FCC Rcd 11950 (CGB 2019), the FCC's Consumer and Governmental Affairs Bureau ruled that online fax services that deliver faxes as email attachments to a recipient's inbox are not "telephone facsimile machines." This significantly narrowed junk-fax liability for cloud-based recipients.  
  
---  
  
## 7. "Unsolicited Advertisement" — § 227(a)(5)  
  
> "any material advertising the commercial availability or quality of any property, goods, or services which is transmitted to any person without that person's prior express invitation or permission, in writing or otherwise." — 47 U.S.C. § 227(a)(5).  
  
This term applies specifically to faxes under § 227(b)(1)(C). The classic litigation issue is whether a "free" offer (e.g., a free seminar, a free informational meeting) is an "advertisement." Courts generally hold that a "pretext" free offer that promotes commercially available products is an advertisement. See *Physicians Healthsource, Inc. v. Boehringer Ingelheim Pharmaceuticals, Inc.*, 847 F.3d 92 (2d Cir. 2017).  
  
### 7.1 Solicited Faxes Order vacated  
  
The FCC's 2006 "Solicited Fax Rule"—requiring opt-out notices even on faxes sent with prior express permission—was vacated by the D.C. Circuit in *Bais Yaakov of Spring Valley v. FCC*, 852 F.3d 1078 (D.C. Cir. 2017), as exceeding the FCC's statutory authority.  
  
---  
  
## 8. "Person"  
  
Although § 227(a) does not separately define "person," the substantive prohibitions in § 227(b) apply to "any person." Courts have read this broadly to include corporations, partnerships, and other entities. The TCPA's vicarious-liability principles, articulated by the FCC in *In re DISH Network, LLC*, 28 FCC Rcd 6574 (2013), apply common-law agency principles (actual authority, apparent authority, ratification) to attribute the calls of a third party to the "seller" on whose behalf they are placed. See *Henderson v. United Student Aid Funds, Inc.*, 918 F.3d 1068 (9th Cir. 2019).  
  
---  
  
## 9. "Residential Telephone Subscriber"  
  
Used in § 227(c) and 47 C.F.R. § 64.1200(c)–(d). The FCC has extended residential DNC protections to wireless numbers used as residential lines. See 2003 TCPA Order, 18 FCC Rcd 14014, ¶ 33; *Stevens-Bratton v. TruGreen, Inc.*, 437 F. Supp. 3d 648 (W.D. Tenn. 2020). A consumer who lists a personal cell phone on the National Do Not Call Registry receives the same protections as a wireline subscriber under § 64.1200(c)(2).  
  
---  
  
## 10. "Artificial or Prerecorded Voice"  
  
Although this phrase does not appear in § 227(a)'s definitions, it is the operative term in § 227(b)(1)(A) and (B). It has gained dramatic new importance after the FCC's 2024 declaratory ruling.  
  
### 10.1 The 2024 AI declaratory ruling  
  
In its February 8, 2024 Declaratory Ruling (FCC 24-17), the FCC unanimously confirmed that the TCPA's restrictions on "artificial or prerecorded voice" calls "encompass current AI technologies that generate human voices." The ruling reaches both:  
  
- voices that are "wholly simulate[d]" by AI; and  
- voices that "resemble the voice of a real person taken from an audio clip" (voice cloning).  
  
Such calls require the same prior express consent (or prior express written consent, if marketing) as traditional prerecorded calls. The ruling does not amend § 227(a) but interprets the operative term in § 227(b)(1)(A)–(B).  
  
### 10.2 Text messages are not "voice"  
  
The Second Circuit in *Soliman v. Subway Franchisee Advertising Fund Trust, Ltd.*, 99 F.4th 145 (2d Cir. 2024), held that a text message is not "an artificial or prerecorded voice" within the meaning of § 227(b)(1)(A). Text messages, however, remain subject to the TCPA's autodialer prohibition (where applicable post-*Duguid*) and to the residential-DNC and internal-DNC rules. See *Campbell-Ewald Co. v. Gomez*, 577 U.S. 153, 156 (2016) (treating text messages as "calls" within the meaning of the TCPA).  
  
---  
  
## 11. Practical Drafting and Litigation Notes  
  
- **Plead with the statutory text.** A TCPA complaint should quote § 227(a)(1) and allege facts that, taken as true, support each element of the relevant definition. After *Duguid* and *Borden v. eFinancial, LLC*, 53 F.4th 1230 (9th Cir. 2022), conclusory allegations that a "predictive dialer" or "platform" was used will not survive a motion to dismiss in most circuits.  
- **Distinguish "telephone solicitation" from "telemarketing."** The first triggers DNC liability (§ 227(c)); the second triggers PEWC requirements (§ 64.1200(a)(2)–(3)). Many cases involve both.  
- **Watch the EBR clock.** An 18-month EBR (purchase) is far easier for a defendant to establish than a 3-month EBR (inquiry). Document each.  
- **The reassigned-number problem.** If the called party is not the consenting party, consent is no defense unless the caller properly used the Reassigned Numbers Database (47 C.F.R. § 64.1200(l)).  
- **AI voice.** Treat any AI-generated voice call—agentic, conversational, or scripted—as subject to the same consent rules as a prerecorded call.  
- **Faxes.** Online fax services may take the call outside the "telephone facsimile machine" definition entirely under *Amerifactors*.  
  
---  
  
## 12. See also  
  
- `tcpa_03_ATDS_Post_Duguid.md` — full treatment of the autodialer definition post-*Duguid*.  
- `tcpa_04_Prior_Express_Consent.md` — consent for non-marketing calls and the recycled-number problem.  
- `tcpa_05_Prior_Express_Written_Consent.md` — PEWC for marketing calls.  
- `tcpa_06_Revocation_of_Consent.md` (forthcoming).  
- `tcpa_07_Do_Not_Call_Residential.md` (forthcoming).  
- `tcpa_08_Fax_Provisions.md` (forthcoming).  
- `tcpa_09_Caller_ID_STIR_SHAKEN.md` (forthcoming).  
- `tcpa_10_Remedies_and_Damages.md` (forthcoming).