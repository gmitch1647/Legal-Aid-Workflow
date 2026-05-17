# TCPA Discovery Strategy Overview

**Topic:** Discovery strategy in Telephone Consumer Protection Act litigation
**Primary statutes:** 47 U.S.C. § 227 (TCPA); 47 C.F.R. § 64.1200 (FCC implementing rules)
**Last updated:** May 16, 2026

---

## 1. Purpose and Orientation

TCPA discovery is fundamentally different from FCRA or FDCPA discovery in three respects. **First**, the operative violation is a *call* (or fax or text), not a writing or trade-line — so the universe of evidence sits in dialer software, telephony switching records, CRM databases, call recordings, and consent platforms (TrustedForm, Jornaya/ActiveProspect, etc.) rather than in static letters or credit-report dispute systems. **Second**, modern TCPA litigation almost always implicates a *chain of parties* — seller, lead generator, master agent, sub-agent, dialer vendor, list provider — and vicarious-liability discovery is often the single most important workstream after *In re DISH Network, LLC*, 28 FCC Rcd 6574 (2013). **Third**, statutory damages of $500 per call ($1,500 if willful or knowing) make TCPA cases unusually class-attractive and unusually settlement-prone; aggressive, well-scoped discovery is often the lever that drives settlement before merits adjudication.

---

## 2. Discovery Objectives by Claim Type

### 2.1 § 227(b)(1)(A) — Autodialed Calls to Cell Phones
After *Facebook, Inc. v. Duguid*, 141 S. Ct. 1163 (2021), an "automatic telephone dialing system" requires equipment that uses a random or sequential number generator to store or produce numbers. Discovery objectives:
- Identify the **dialer hardware/software platform** by manufacturer, version, and configuration.
- Obtain the **configuration files**, dialing-mode settings (preview, progressive, predictive, manual click-to-dial).
- Identify **source lists** — were numbers loaded from a CRM, a purchased lead list, a randomly-generated block, or an opt-in audit trail?
- For text messages, the same analysis applies to the sending platform and API request logs.

### 2.2 § 227(b)(1)(A) / (B) — Prerecorded or Artificial Voice
- Obtain the **audio files** of every prerecorded message used in the campaign.
- Identify whether voices are **AI-generated** (FCC 2024 Declaratory Ruling FCC 24-17).
- Obtain **call-flow / IVR diagrams** showing branching logic.
- Confirm the **identification disclosure** required by § 64.1200(b)(1)–(2).

### 2.3 § 227(b)(1)(C) — Junk Faxes
- **Fax transmission logs** from the broadcaster.
- The **content of the fax** — whether it advertised commercial availability.
- **Opt-out notice** compliance under § 227(b)(2)(D).
- Whether the **recipient line was a stand-alone fax machine or an online fax service**.

### 2.4 § 227(c) — DNC and Internal DNC
- Confirm whether the called number is **on the national DNC**.
- Subpoena the **DNC scrubbing vendor** for scrub timestamps.
- Obtain the **internal DNC list**, written DNC policy, training records.
- Develop **established business relationship** issues.

### 2.5 § 227(e) — Caller ID Spoofing
Discovery on STIR/SHAKEN attestation, the dialer's caller-ID override settings, and gateway provider responsibility.

---

## 3. Targets of Discovery — the Five Roles

### 3.1 The Caller / Telemarketer
The entity whose dialer placed the call. Demand corporate structure, the dialer platform, consent records, scripts, and contracts with upstream sellers.

### 3.2 The Seller
The entity "on whose behalf" the call was made. Under the 2013 *DISH Network* Declaratory Ruling, sellers may be vicariously liable on federal common-law agency principles.

### 3.3 The Lead Generator
The entity that captured the consumer's information and purported consent. Discovery on the lead form, the website, the consent capture vendor.

### 3.4 The Dialer Vendor / SaaS Platform
Often a non-party. Use Rule 45 subpoenas for platform technical documentation and calling logs.

### 3.5 The List Provider / Data Broker
The entity that sold the calling list. Discovery into provenance and opt-in claims.

---

## 4. Vicarious Liability Discovery — the DISH Network Roadmap

### 4.1 Actual Authority Discovery
- The written marketing services agreement.
- Operational manuals and QA protocols.
- Whether the seller controls the manner and means of the calls.

### 4.2 Apparent Authority Discovery
- Whether the telemarketer was authorized to use the seller's brand.
- Whether the seller's website lists the telemarketer.

### 4.3 Ratification Discovery
- Whether the seller accepted the benefits of the unlawful calls.
- Knowledge of TCPA complaints from consumers or regulators.
- Continued use of the same telemarketer after notice.

---

## 5. Class vs. Individual Discovery Focus

### 5.1 Individual Cases
- Focused on plaintiff's calls only: CDRs, recordings, consent records.
- TCPA individual cases routinely settle pre-deposition.

### 5.2 Class Cases
- Wholesale class list and call-record production.
- Common-issue discovery: which dialer? which consent capture?
- *Krakauer v. Dish Network, LLC*, 925 F.3d 643 (4th Cir. 2019).

---

## 6. Standing in TCPA Discovery — Post-TransUnion

After *TransUnion LLC v. Ramirez*, 594 U.S. 413 (2021), defendants now serve early interrogatories asking how the calls "harmed" the plaintiff. Plaintiffs should answer with specific concrete facts — time lost, distraction at work, battery drain, voicemail consumption.

---

## 7. Sequencing — Pre-Suit Through Trial

**Stage 1 — Pre-suit.** Document preservation letters; public-record investigation; reverse-trace the caller-ID.

**Stage 2 — Initial disclosures (Rule 26(a)(1)).** Caller identity, seller identity, dialer platform, damages computation.

**Stage 3 — Written discovery.** Interrogatories and RFPs to caller, seller, and lead generator.

**Stage 4 — Rule 30(b)(6) depositions.** Caller corporate rep on dialer technology; seller corporate rep on oversight.

**Stage 5 — Individual depositions.** Marketing director, compliance officer, IT manager.

**Stage 6 — Expert discovery.** Plaintiff's ATDS expert; damages expert in class cases.

**Stage 7 — Motion practice.** Class certification; summary judgment.

---

## 8. Cost and Proportionality

TCPA discovery costs are dominated by CDR/dialer log production and consent record production. Front-loading the dialer and consent discovery is the single most important strategic choice in a TCPA case.

---

## 9. ESI Considerations

Key categories: CDRs/dialer logs (CSV/proprietary); audio files (WAV/MP3); TrustedForm/Jornaya certificates; web-form HTML snapshots; dialer configuration files. A Rule 26(f) ESI protocol should specify production formats up front.

---

## 10. Privilege and Work Product

TCPA-specific privilege issues: compliance audit reports; DNC complaint logs (not privileged); dialer-vendor communications (generally non-privileged).

---

## 11. Damages Discovery

$500/$1,500 per violation. Number of calls from CDR. Willfulness discovery. Multiple violations per call (§ 227(b) + § 227(c) = $1,000 per call baseline).

---

## 12. Statute of Limitations

Four years under 28 U.S.C. § 1658. *Giovanniello v. ALM Media, LLC*, 726 F.3d 106 (2d Cir. 2013). Discovery on each call's date is necessary to apply the SOL.

---

## 13. Cross-references

- `tcpa_disc_02_TCPA_Initial_Disclosures.md`
- `tcpa_disc_03_Interrogatories_to_Callers_Telemarketers.md`
- `tcpa_disc_04_RFPs_to_Callers_Telemarketers.md`
- `tcpa_03_ATDS_Post_Duguid.md`
- `tcpa_04_Prior_Express_Consent.md`
- `tcpa_05_Prior_Express_Written_Consent.md`
- `tcpa_06_Revocation_of_Consent.md`
- `tcpa_15_TCPA_Remedies_Damages_SOL.md`
