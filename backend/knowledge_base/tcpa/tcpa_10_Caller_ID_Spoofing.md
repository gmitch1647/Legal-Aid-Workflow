# TCPA Topic 10 — Caller ID Spoofing, the Truth in Caller ID Act, and the TRACED Act  
  
**Statute:** 47 U.S.C. § 227(e) (Truth in Caller ID Act of 2009, codified into TCPA); Pallone-Thune TRACED Act, Pub. L. No. 116-105 (Dec. 30, 2019)  
**Regulations:** 47 C.F.R. § 64.1604 (Caller ID spoofing prohibitions); 47 C.F.R. § 64.6300 et seq. (STIR/SHAKEN); 47 C.F.R. § 64.6305 (Robocall Mitigation Program)  
**Key FCC orders:** First Caller ID Authentication Report and Order, 35 FCC Rcd. 3241 (2020); Robocall Mitigation Database orders; numerous TRACED Act implementation actions  
**Last updated:** May 16, 2026  
  
---  
  
## 1. Overview  
  
Section 227(e) — added to the TCPA by the **Truth in Caller ID Act of 2009** — prohibits **deceptive caller-ID spoofing** done with intent to defraud, cause harm, or wrongfully obtain anything of value. It supplements the TCPA's traditional anti-robocall framework with a fraud-focused provision aimed at scam calls.  
  
The 2019 **TRACED Act** (Pallone-Thune Telephone Robocall Abuse Criminal Enforcement and Deterrence Act) significantly expanded § 227(e), increased penalties, required FCC implementation of **STIR/SHAKEN** caller-ID authentication, and created the **Robocall Mitigation Program**.  
  
Although this area is mostly **agency-enforcement-driven** (FCC and state attorneys general), it provides essential context for any TCPA practice, especially robocall mitigation and the broader anti-spoofing ecosystem.  
  
---  
  
## 2. The prohibition — § 227(e)(1)  
  
> "It shall be unlawful for any person within the United States, or any person outside the United States if the recipient is within the United States, in connection with any voice service or text messaging service, to cause any caller identification service to knowingly transmit misleading or inaccurate caller identification information with the intent to defraud, cause harm, or wrongfully obtain anything of value, unless such transmission is exempted pursuant to paragraph (3)(B)."  
  
47 U.S.C. § 227(e)(1).  
  
### 2.1 Elements  
  
1. **In connection with** a voice service or text-messaging service.  
2. **Causing** a caller-ID service to transmit caller-ID info.  
3. **Knowingly** doing so with misleading or inaccurate info.  
4. **With intent to defraud, cause harm, or wrongfully obtain anything of value.**  
5. **Not exempted** under § 227(e)(3)(B) (law enforcement, court orders, etc.).  
  
### 2.2 Coverage of text messaging  
  
The TRACED Act amended § 227(e)(8) (definitions) to expressly include **text-messaging services** within the scope of § 227(e). Spoofed text-message originator info is now covered. Pre-2019, the statute covered only voice services; post-2019, both.  
  
### 2.3 Coverage of foreign-originated calls  
  
The TRACED Act amendments also extended § 227(e) to **calls originating outside the United States** if the recipient is in the U.S. Pre-2019, only domestic origination was covered. This was a response to the explosion of overseas robocall operations.  
  
### 2.4 "Caller identification information"  
  
Defined at § 227(e)(8)(A) as information regarding the **originating telephone number or party**, transmitted in connection with the call or text. Covers traditional Caller ID, ANI, and text-message originator information.  
  
### 2.5 Permissible spoofing  
  
Not all caller-ID modification is prohibited. Legitimate use cases (with neither intent to defraud nor cause harm):  
  
- A doctor returning patient calls from a personal cell but displaying the office number.  
- A business displaying a single main-line callback number rather than individual extensions.  
- Law-enforcement undercover operations (statutory exemption at § 227(e)(3)(B)(i)).  
- Court orders authorizing concealment for safety (e.g., domestic-violence victims).  
  
The statute focuses on **intent** to defraud, harm, or wrongfully obtain value — not on the mere act of replacing the displayed number.  
  
---  
  
## 3. TRACED Act — major enhancements  
  
The Pallone-Thune Telephone Robocall Abuse Criminal Enforcement and Deterrence Act was signed into law on December 30, 2019. Key provisions affecting TCPA practice:  
  
### 3.1 Increased penalties  
  
- Forfeiture penalties for § 227(e) violations increased to **up to $10,000 per violation**, plus an additional **$10,000 if intentional** (§ 227(e)(5)).  
- Removed the one-year limit on FCC's authority to issue citation-required notices for spoofing violations.  
- Extended the statute of limitations for FCC enforcement to **4 years** (from 1 year for some prior actions).  
  
### 3.2 STIR/SHAKEN mandate — § 227(b)(7)  
  
The TRACED Act amended TCPA § 227 to add subsection (b)(7), requiring the FCC to adopt rules mandating that voice-service providers implement caller-ID authentication frameworks. The FCC adopted these rules in 2020 (First Caller ID Authentication R&O, 35 FCC Rcd. 3241).  
  
### 3.3 STIR/SHAKEN deployment  
  
- **STIR** = Secure Telephone Identity Revisited (set of IETF protocols for cryptographic verification of caller-ID).  
- **SHAKEN** = Signature-based Handling of Asserted information using toKENs (framework for implementing STIR within carrier networks).  
- Originating provider digitally signs the call with one of three attestation levels:  
  - **A (Full)** — provider knows the caller and authorized them to use the number.  
  - **B (Partial)** — provider knows the caller but not the source of the number.  
  - **C (Gateway)** — provider received the call from another network with no attestation.  
- Terminating provider verifies the signature and may pass through, label ("Spam Likely"), or block the call.  
  
### 3.4 Implementation deadlines  
  
- **June 30, 2021** — large voice-service providers required to implement STIR/SHAKEN in the IP portions of their networks. 47 C.F.R. § 64.6301.  
- **June 30, 2023** — small voice-service providers required to comply (after extensions).  
- Non-IP networks: providers must engage in alternative caller-ID authentication frameworks or implement a Robocall Mitigation Program.  
  
### 3.5 Robocall Mitigation Program — § 64.6305  
  
Every voice-service provider must file in the FCC's **Robocall Mitigation Database** a certification that it has implemented STIR/SHAKEN or, where unable, has implemented a Robocall Mitigation Program with specific elements. Providers that fail to file are blocked from accepting calls from non-compliant carriers.  
  
The Robocall Mitigation Program must include:  
  
- Procedures for identifying customers using or likely to use the network for robocalls.  
- Procedures for taking action against those customers (e.g., termination).  
- Cooperation with FCC and other carriers in traceback efforts.  
  
### 3.6 Gateway provider rules  
  
Subsequent FCC orders extended STIR/SHAKEN and Robocall Mitigation Program obligations to **gateway providers** (those entry-points for foreign-originated calls). 47 C.F.R. § 64.6305(d). Gateway providers must authenticate, mitigate, or block illegal calls entering the U.S.  
  
---  
  
## 4. FCC enforcement role  
  
### 4.1 FCC penalties  
  
Under § 227(e)(5), the FCC may issue forfeiture orders of up to $10,000 per violation, with an additional $10,000 for intentional violations. Recent FCC actions have produced hundreds of millions in proposed forfeitures, including:  
  
- **John Burkman/Jacob Wohl** (2022) — $5+ million proposed forfeiture for robocalls misleadingly suggesting mail-in voting consequences.  
- **Steve Kramer / Lingo Telecom** (2024) — FCC fines exceeding $6 million for the fake "President Biden" AI-voice robocalls in the New Hampshire primary. Lingo Telecom settled for $1 million.  
- **Rising Eagle / Texas Operation** — $225 million proposed forfeiture (2021), largest in FCC history at time of order, for health-insurance spoofed robocalls.  
  
### 4.2 State Attorney General concurrent enforcement  
  
The TRACED Act expressly authorized state attorneys general to bring civil enforcement actions under § 227(e) in federal court, recover damages on behalf of state residents, and obtain injunctive relief. 47 U.S.C. § 227(g) (state AG enforcement provision, expanded by TRACED).  
  
### 4.3 DOJ coordination  
  
The TRACED Act required the FCC and DOJ to develop joint reports and cooperation mechanisms on robocall enforcement. The FBI has prosecuted some § 227(e) violators under wire-fraud statutes in parallel with FCC enforcement.  
  
---  
  
## 5. Private right of action — limited  
  
**Section 227(e) does not include a private right of action.** Enforcement is by the FCC and state attorneys general.  
  
This means individual consumers cannot sue in tort under § 227(e) for spoofed calls. They may, however:  
  
- Use § 227(b) or § 227(c) where the underlying call also violates ATDS/prerecorded/DNC rules.  
- Sue under state UDAP and consumer-protection statutes that prohibit deceptive caller-ID practices (many states have analogous laws).  
- Sue under common-law fraud, intentional infliction of emotional distress, or invasion-of-privacy theories where damages are quantifiable.  
- File complaints with the FCC, FTC, and state attorneys general for enforcement referral.  
  
---  
  
## 6. Practical impact for consumer-law practice  
  
Although § 227(e) is largely outside private practice, several practical points are useful:  
  
### 6.1 Spoofed-number identification  
  
Where a TCPA defendant denies making the calls or argues that someone else used its number, plaintiffs can:  
  
- Subpoena originating carrier records.  
- Use FCC's Industry Traceback Group (ITG) to trace calls back to origin.  
- Rely on STIR/SHAKEN attestation data and call-detail records to identify the actual originating party.  
  
### 6.2 Vicarious liability for spoofed calls  
  
If a debt collector or marketer uses spoofed Caller ID to evade traceability and contact the consumer, this may support:  
  
- Increased willfulness/knowing findings for treble damages under § 227(b)(3) and § 227(c)(5).  
- FDCPA § 1692e(10) claims (use of false/deceptive means to collect a debt).  
- State UDAP claims.  
  
### 6.3 Robocall Mitigation Database as discovery resource  
  
The FCC's public Robocall Mitigation Database (https://fccprod.servicenowservices.com/rmd) discloses provider certifications and may be relevant in TCPA cases against telephony providers or in identifying responsible "facilitators."  
  
### 6.4 Carrier safe harbor  
  
47 C.F.R. § 64.1200(k) (blocking safe harbor) and related provisions give voice-service providers limited safe harbor from common-carrier liability when they block calls flagged as illegal. This is mostly relevant to carriers themselves, not telemarketers.  
  
---  
  
## 7. Selected cases and enforcement actions  
  
- ***United States v. Roesel*** (E.D. Va. 2022) — federal criminal prosecution for spoofed robocall scam (wire fraud + § 227(e) violations) [VERIFY case name/citation].  
- **FCC v. Rising Eagle Capital Group** — $225 million proposed forfeiture (2021); see FCC 21-71.  
- **FCC enforcement against Lingo Telecom** (2024) — $1 million settlement for AI-voice "Biden" robocalls.  
- **New Hampshire v. Kramer** (2024) — state criminal charges for AI-voice "Biden" robocalls; separate from FCC.  
- ***Texas v. R Squared Telecom, LLC*** — early state-AG TRACED enforcement [VERIFY case posture].  
  
---  
  
## 8. Interaction with TCPA private litigation  
  
Although § 227(e) is not privately enforceable, it produces several effects useful in TCPA private cases:  
  
1. **Better caller identification.** STIR/SHAKEN attestation data enables plaintiffs to trace calls more reliably.  
2. **Provider liability theories.** Voice-service providers that knowingly facilitate illegal robocalls may face FCC enforcement and potentially private claims under § 227(b) or state law.  
3. **Reduced robocall volume.** Aggressive FCC enforcement and STIR/SHAKEN have shifted some private litigation focus to harder-to-trace text spam.  
4. **Evidence of willfulness.** A defendant who spoofs Caller ID demonstrates willfulness for § 227(b)(3) and § 227(c)(5) treble damages.  
  
---  
  
## 9. Litigation/regulatory checklist  
  
1. **Identify whether the underlying conduct also violates § 227(b) or § 227(c).** Private claims arise there, not under § 227(e).  
2. **Use STIR/SHAKEN data** to confirm originating carrier and attestation level.  
3. **Subpoena carriers** for traceback information; consider FCC Industry Traceback Group cooperation.  
4. **Check Robocall Mitigation Database** for the carrier's certification and program details.  
5. **Refer egregious spoofing to the FCC, FTC, and state AG** for parallel enforcement.  
6. **Build willfulness record** — spoofed Caller ID is strong evidence of willful violation supporting treble damages.  
  
---  
  
## 10. See also  
  
- TCPA Topic 04 — Artificial/Prerecorded Voice (including 2024 AI ruling)  
- TCPA Topic 07 — § 227(b) Restrictions on Calls  
- TCPA Topic 09 — DNC Registry and § 64.1200(d)  
- TCPA Topic 12 — FCC Enforcement and TRACED Act Implementation  
- FDCPA § 1692e(10) — False or Deceptive Means