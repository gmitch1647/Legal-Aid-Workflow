# The ATDS Definition After Facebook v. Duguid  
  
**Topic:** What qualifies as an "automatic telephone dialing system" (ATDS) under the TCPA after *Facebook, Inc. v. Duguid*, 592 U.S. 395 (2021)  
**Primary statute:** 47 U.S.C. § 227(a)(1), (b)(1)(A)  
**Implementing regulation:** 47 C.F.R. § 64.1200(a)(1), (f)(2)  
**Last updated:** May 16, 2026  
  
---  
  
## 1. Why this is the single most important post-2021 TCPA topic  
  
For roughly two decades, the FCC and most circuit courts read 47 U.S.C. § 227(a)(1) expansively, sweeping in any "predictive dialer" capable of dialing from a stored list without human intervention. That expansive reading collapsed in 2021. In *Facebook, Inc. v. Duguid*, 592 U.S. 395 (2021), the Supreme Court unanimously held that the statutory phrase "using a random or sequential number generator" modifies *both* "store" and "produce." As a result, modern marketing dialers that dial from human-curated lists—the engine of most TCPA class actions for a decade—are no longer ATDSs as a matter of law in the great majority of cases.  
  
The consequence has been seismic. ATDS class actions have collapsed in volume. The center of TCPA litigation has migrated to: (i) the "artificial or prerecorded voice" prong of § 227(b)(1)(A), which *Duguid* did not touch and which the FCC's 2024 declaratory ruling has now extended to AI-generated voice; (ii) marketing calls to numbers on the federal Do-Not-Call list under § 227(c); and (iii) revocation-of-consent claims. Counsel cannot draft, defend, or evaluate a TCPA case in 2026 without a precise understanding of *Duguid* and its circuit progeny.  
  
---  
  
## 2. The pre-*Duguid* expansive ATDS reading  
  
### 2.1 The 2003 and 2015 FCC Orders  
  
In its 2003 TCPA Order, 18 FCC Rcd 14014, the FCC concluded that "predictive dialers"—equipment that dials from stored lists at rates calibrated to agent availability—fall within the ATDS definition because they have the "capacity" to dial without human intervention. The FCC reaffirmed and broadened that reading in its 2015 Omnibus Order, 30 FCC Rcd 7961, which read "capacity" to include not only present capacity but also "potential" capacity (e.g., a smartphone with a downloadable autodialer app).  
  
### 2.2 ACA International  
  
The D.C. Circuit set aside core aspects of the 2015 Order in *ACA International v. FCC*, 885 F.3d 687 (D.C. Cir. 2018). The court rejected the FCC's "expansive interpretation" of "capacity," holding it would sweep in essentially every modern smartphone. It also identified internal tensions in the FCC's ATDS reading. *ACA International* left the precise scope of the ATDS definition open and prompted a circuit split.  
  
### 2.3 The circuit split that produced Duguid  
  
- The Ninth Circuit in *Marks v. Crunch San Diego, LLC*, 904 F.3d 1041 (9th Cir. 2018), held that an ATDS includes equipment with the capacity to "store numbers to be called" and "to dial such numbers automatically," even without an RSNG.  
- The Second Circuit in *Duran v. La Boom Disco, Inc.*, 955 F.3d 279 (2d Cir. 2020), and the Sixth Circuit in *Allan v. Pennsylvania Higher Education Assistance Agency*, 968 F.3d 567 (6th Cir. 2020), followed *Marks*.  
- The Third Circuit in *Dominguez v. Yahoo, Inc.*, 894 F.3d 116 (3d Cir. 2018), the Seventh Circuit in *Gadelhak v. AT&T Services, Inc.*, 950 F.3d 458 (7th Cir. 2020) (Barrett, J.), and the Eleventh Circuit in *Glasser v. Hilton Grand Vacations Co.*, 948 F.3d 1301 (11th Cir. 2020), required RSNG capacity.  
  
The Supreme Court granted certiorari in *Facebook v. Duguid* to resolve the split.  
  
---  
  
## 3. *Facebook, Inc. v. Duguid*, 592 U.S. 395 (2021)  
  
### 3.1 The facts  
  
Noah Duguid received text-message "login notification" alerts from Facebook on a phone number he had never given Facebook and that was not associated with any Facebook account. Facebook's notification system maintained a database of registered users' phone numbers and sent alerts when log-in activity occurred. Duguid sued under § 227(b)(1)(A)(iii), alleging that Facebook's notification system was an ATDS.  
  
### 3.2 The holding  
  
Justice Sotomayor, writing for a unanimous Court, held:  
  
> "To qualify as an 'automatic telephone dialing system,' a device must have the capacity either to store a telephone number using a random or sequential generator or to produce a telephone number using a random or sequential number generator." — 592 U.S. at 399.  
  
The Court relied on conventional grammatical principles—the "series-qualifier canon"—to hold that the modifier "using a random or sequential number generator" applies to both verbs that precede it. The Court also pointed to the statutory context: Congress in 1991 was targeting the random-number-generator dialing technology then in use, not every device capable of dialing from a stored list.  
  
### 3.3 What *Duguid* held an ATDS is NOT  
  
The Court rejected the *Marks* construction. Facebook's notification system, which dialed from a stored database of registered users' numbers, was not an ATDS because it did not use an RSNG to store or produce those numbers.  
  
### 3.4 Footnote 7  
  
A single footnote in *Duguid* has generated extensive litigation. Footnote 7 reads, in relevant part:  
  
> "[A]n autodialer might use a random number generator to determine the order in which to pick phone numbers from a preproduced list. It would then store those numbers to be dialed at a later time." — 592 U.S. at 404 n.7.  
  
Plaintiffs' counsel argue that footnote 7 confirms that a system using an RSNG to *index* or *order* numbers from a curated list qualifies as an ATDS. Defense counsel argue that the footnote is dictum and that it makes sense only as an illustration of how the same device might both "store" and "produce" numbers using an RSNG.  
  
The Eighth and Ninth Circuits have squarely rejected the plaintiff-favorable reading of footnote 7. See *Beal v. Outfield Brew House, LLC*, 29 F.4th 391 (8th Cir. 2022); *Borden v. eFinancial, LLC*, 53 F.4th 1230 (9th Cir. 2022).  
  
---  
  
## 4. What still IS an ATDS post-*Duguid*  
  
Equipment that meets *both* statutory prongs remains an ATDS:  
  
- **(A)** has the capacity to store *or* produce telephone numbers to be called *using an RSNG*; and  
- **(B)** has the capacity to dial those numbers.  
  
Real-world examples of equipment that still qualifies:  
  
- "War dialers" that sequentially dial every number in an exchange (e.g., 555-0000, 555-0001, ...).  
- Systems that randomly generate ten-digit telephone numbers and dial them.  
- Some legacy "blast fax" and "blast text" platforms that generate numbers via RSNG.  
  
These systems are uncommon in legitimate marketing. They remain common in fraud, spam, and certain robocall scam operations—precisely the conduct Congress targeted in 1991.  
  
---  
  
## 5. What is NOT an ATDS post-*Duguid*  
  
The vast majority of modern marketing and servicing platforms fall outside the ATDS definition. Counsel should be prepared to address each category:  
  
### 5.1 Predictive dialers (list-based)  
  
Predictive dialers that dial from human-curated lead lists do not "store or produce" numbers using an RSNG. *Borden v. eFinancial, LLC*, 53 F.4th 1230 (9th Cir. 2022) ("an autodialer must randomly or sequentially generate telephone numbers, not just any number"); *Beal v. Outfield Brew House, LLC*, 29 F.4th 391 (8th Cir. 2022) (texting platform that randomly selected from a stored list of opted-in numbers was not an ATDS).  
  
### 5.2 Click-to-dial systems  
  
Systems requiring an agent to click each number—even if the click triggers automated transmission—are not ATDSs. Such systems do not "store or produce" numbers via RSNG and typically also fail the "automatic" element.  
  
### 5.3 CRM-integrated SMS / MMS platforms  
  
Mass texting platforms (e.g., those used in marketing, healthcare reminders, political outreach) that send to a list of opted-in or imported numbers are not ATDSs. See *Soliman v. Subway Franchisee Advertising Fund Trust, Ltd.*, 99 F.4th 145 (2d Cir. 2024) ("Subway's use of a random number generator to dial pre-stored numbers did not meet the TCPA's definition of an ATDS"); *Borden*, 53 F.4th at 1233–34.  
  
### 5.4 IVR / VoIP servicing systems  
  
Inbound and outbound interactive voice response systems used for account servicing, password reset, fraud alerts, etc., are not ATDSs absent RSNG capacity.  
  
---  
  
## 6. Circuit applications of *Duguid*  
  
### 6.1 Second Circuit — *Soliman v. Subway Franchisee Advertising Fund Trust*, 99 F.4th 145 (2d Cir. 2024)  
  
The Second Circuit affirmed dismissal of a TCPA complaint about Subway's marketing texts. Held: (i) a system that uses a random number generator merely to *select among* pre-stored numbers is not an ATDS; and (ii) a text message is not an "artificial or prerecorded voice." The court rejected the plaintiff's footnote-7 argument.  
  
### 6.2 Third Circuit — *Panzarella v. Navient Solutions, LLC*, 37 F.4th 867 (3d Cir. 2022)  
  
Navient called the Panzarellas using its ININ dialing system. The Third Circuit held that (i) "equipment" should be considered as a system, not a single device; and (ii) although random or sequential number generation is not required for the equipment to *qualify* as an ATDS in the abstract, "use of an ATDS's random or sequential number generator capability is a prerequisite to liability under the TCPA." Navient won summary judgment on the alternative ground that it did not use any RSNG capability when calling the plaintiffs.  
  
### 6.3 Fourth Circuit  
  
The Fourth Circuit has applied *Duguid* in unpublished decisions consistent with the narrow reading. [VERIFY — published 4th Cir. ATDS authority post-*Duguid* is thin; the case the user identified as "*Beal v. Truist Bank*" appears to be the *Truong v. Truist Bank* settlement, not a published 4th Cir. opinion. *Beal v. Outfield Brew House* is an Eighth Circuit case.]  
  
### 6.4 Eighth Circuit — *Beal v. Outfield Brew House, LLC*, 29 F.4th 391 (8th Cir. 2022)  
  
The Eighth Circuit affirmed summary judgment for the defendant. Outfield's "Txt Live" platform sent promotional texts to numbers stored on its lists. The court held that "Txt Live does not generate phone numbers to be called" and therefore did not "produce telephone numbers to be called" within the meaning of § 227(a)(1). The court squarely rejected the plaintiff's footnote-7 reading.  
  
### 6.5 Ninth Circuit — *Borden v. eFinancial, LLC*, 53 F.4th 1230 (9th Cir. 2022)  
  
The Ninth Circuit affirmed dismissal of a TCPA claim about insurance-quote follow-up texts. Held: "[A]n 'automatic telephone dialing system' must generate and dial random or sequential telephone numbers under the TCPA's plain text." The court rejected the plaintiff's argument that any "number" (including a sequential index) suffices; the statute requires generation of *telephone* numbers.  
  
### 6.6 First Circuit — *Carl v. First National Bank of Omaha*  
  
[VERIFY — the First Circuit's published TCPA ATDS authority post-*Duguid* is limited; counsel should confirm the precise cite and holding before relying on this decision in pleading.]  
  
### 6.7 Eleventh Circuit  
  
The Eleventh Circuit has continued to apply its pre-*Duguid* narrow reading (*Glasser v. Hilton Grand Vacations*) and has not departed from *Duguid*'s narrow construction.  
  
---  
  
## 7. The artificial-or-prerecorded-voice prong — still robust  
  
*Duguid* did not touch the *second* operative prohibition in § 227(b)(1)(A): the prohibition on initiating a call to a cell phone "using an artificial or prerecorded voice" without consent. This prong has become the most important basis for cell-phone TCPA liability after *Duguid*.  
  
### 7.1 Statutory text  
  
> "It shall be unlawful for any person within the United States ... to make any call (other than a call made for emergency purposes or made with the prior express consent of the called party) using any automatic telephone dialing system *or* an artificial or prerecorded voice—(i) to any emergency telephone line ... (iii) to any telephone number assigned to a paging service, cellular telephone service, specialized mobile radio service, or other radio common carrier service, or any service for which the called party is charged for the call ..." — 47 U.S.C. § 227(b)(1)(A) (emphasis added).  
  
### 7.2 No RSNG requirement  
  
The artificial-or-prerecorded-voice prong has no autodialer requirement. A single prerecorded call to a cell phone without consent violates the statute. *Campbell-Ewald Co. v. Gomez*, 577 U.S. 153 (2016) (treating text messages as "calls").  
  
### 7.3 The 2024 FCC AI declaratory ruling  
  
On February 8, 2024, the FCC issued a unanimous Declaratory Ruling, FCC 24-17, confirming that "artificial or prerecorded voice" under § 227(b) "encompass[es] current AI technologies that generate human voices." The ruling covers:  
  
- "current AI technologies that ... wholly simulate an artificial voice"; and  
- AI technologies that "resemble the voice of a real person taken from an audio clip" (voice cloning).  
  
Practical consequences:  
  
- AI-voice calls to cell phones require prior express consent (or PEWC if for marketing).  
- The ruling does not change § 227(a)(1); it interprets § 227(b)(1)(A)–(B).  
- Callers using conversational-AI agents must obtain consent in advance.  
  
The FCC issued a follow-on Notice of Proposed Rulemaking in 2024 to consider further disclosure and consent requirements for AI-generated calls.  
  
---  
  
## 8. Practical implications  
  
### 8.1 Many ATDS class actions are effectively foreclosed  
  
Plaintiffs' counsel now face a heavy pleading and proof burden on ATDS claims. A plaintiff must allege facts plausibly suggesting that the defendant's equipment had the capacity to use an RSNG to *generate* the telephone numbers called. Conclusory allegations about "blast" or "predictive" dialers will not survive a Rule 12(b)(6) motion in most circuits.  
  
### 8.2 Prerecorded-voice and AI-voice claims are now central  
  
Counsel evaluating a potential TCPA cell-phone claim should focus first on whether the call used a prerecorded message, soundboard, or AI-generated voice. If it did, the ATDS analysis is largely irrelevant.  
  
### 8.3 DNC claims under § 227(c) take on greater importance  
  
For text and live-voice marketing campaigns that do not satisfy the ATDS definition, plaintiffs increasingly rely on the residential-DNC and internal-DNC provisions of § 227(c) and 47 C.F.R. § 64.1200(c)–(d). These claims do not require an ATDS.  
  
### 8.4 Revocation, consent, and reassigned-number defenses remain potent  
  
Even where § 227(b)(1)(A) is triggered (e.g., AI-voice marketing call), defendants retain the consent, revocation, and reassigned-number-database defenses. (See `tcpa_04_Prior_Express_Consent.md`.)  
  
---  
  
## 9. Pleading strategy: capacity versus actual use  
  
A persistent split in the courts concerns whether § 227(a)(1)'s "has the capacity" language means *theoretical* capacity (the equipment could be reconfigured to use an RSNG) or *as-used* capacity (the equipment as configured at the time of the call used an RSNG).  
  
- *Panzarella v. Navient Solutions*, 37 F.4th 867 (3d Cir. 2022), holds that liability requires actual *use* of the equipment's RSNG capability. A plaintiff who cannot allege use will not survive summary judgment in the Third Circuit.  
- The Second, Eighth, and Ninth Circuits' decisions effectively require allegation of facts plausibly suggesting use, even where capacity is the formal element.  
- Conservative pleading should allege both capacity and use, with factual support drawn from public sources (vendor marketing materials, regulatory filings, prior settlements) about the defendant's dialing platform.  
  
### 9.1 Sample pleading language (post-Duguid compliant)  
  
> "On information and belief, Defendant placed the call using equipment that has the present capacity to use a random or sequential number generator to store or produce telephone numbers and to dial those numbers. Defendant's platform, [name], is marketed as capable of [specific RSNG-related function]. Defendant in fact used that capability with respect to the call to Plaintiff, as evidenced by [factual indicia—e.g., the random ordering of calls received, the pattern of digits, the absence of any pre-existing relationship that would explain a curated list, etc.]."  
  
Without such specificity, complaints have been dismissed in every circuit that has applied *Duguid*.  
  
---  
  
## 10. See also  
  
- `tcpa_02_TCPA_Key_Definitions.md` — definitions including § 227(a)(1) text and "capacity."  
- `tcpa_04_Prior_Express_Consent.md` — consent framework for non-marketing calls to cell phones.  
- `tcpa_05_Prior_Express_Written_Consent.md` — consent for marketing calls.  
- `tcpa_06_Revocation_of_Consent.md` (forthcoming) — revocation post-*Reyes v. Lincoln Automotive*.  
- `tcpa_08_Fax_Provisions.md` (forthcoming) — fax-blaster ATDS analysis.  
- `tcpa_09_AI_Voice_and_Robocalls.md` (forthcoming) — the 2024 AI declaratory ruling in depth.  
- `tcpa_10_Remedies_and_Damages.md` (forthcoming) — $500/$1,500 statutory damages on the prerecorded-voice prong.