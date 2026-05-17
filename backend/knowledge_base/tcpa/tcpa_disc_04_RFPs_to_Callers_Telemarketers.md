# TCPA Discovery — Requests for Production to Callers and Telemarketers

**Primary authority:** Fed. R. Civ. P. 34; 47 U.S.C. § 227; 47 C.F.R. § 64.1200
**Key cases:** *Facebook, Inc. v. Duguid*, 141 S. Ct. 1163 (2021); *Krakauer v. Dish Network, LLC*, 925 F.3d 643 (4th Cir. 2019)

---

This file contains ~100 RFPs grouped into 10 categories for use by plaintiffs against callers/telemarketers in TCPA litigation. Each is a template to adapt.

## B. Corporate documents (RFPs 1-7)
- Organizational documents, org charts, parent/subsidiary identification
- FCC filings and state telemarketing registrations
- Board minutes addressing TCPA compliance
- Financial statements showing telemarketing revenue

## C. Call detail records (RFPs 8-17)
- CDRs for plaintiff's number (native format with field dictionary)
- Complete dialer log for each campaign
- Call recordings and voicemail recordings
- Text messages with metadata
- Campaign-level call files for class
- Calling lists / load files
- Carrier records and data dictionaries
- STIR/SHAKEN attestation data

## D. Dialer system and ATDS documentation (RFPs 18-32)
- Vendor contracts and technical manuals
- Configuration files, campaign profiles, pacing settings
- Change-management records and release notes
- Vendor declarations on ATDS/RSNG status
- Training materials for system administrators
- Source code (subject to protective order)
- Dialing mode documentation
- Human intervention documentation
- Prerecorded message audio files
- Scripts and call-flow diagrams
- AI-voice identification documents
- Caller-ID display and STIR/SHAKEN policies

## E. Consent records (RFPs 33-48)
- All consent records for plaintiff's number
- Metadata (date, IP, session ID, lead source)
- TrustedForm/Jornaya certificate playbacks
- Web form versions with HTML/CSS/JS
- Terms of service and consent disclosures
- Inbound call recordings capturing consent
- Double opt-in confirmations
- Consent-vendor agreements and reports
- Consent audit reports
- Revocation logs and STOP keyword reports
- Revocation processing policies
- One-to-one consent workflows (2023 Lead-Gen R&O)

## F. National DNC and internal DNC (RFPs 49-63)
- DNC registry subscriber profile
- DNC scrubbing vendor contracts and reports
- Scrub logs showing plaintiff's number status
- Written DNC procedures (§ 64.1200(d)(1))
- Internal DNC list (native format)
- Training materials and attendance records
- Internal audit reports on DNC compliance
- Time-of-day policies
- Reassigned Numbers Database usage
- EBR documentation
- Wireless identification policies

## G. Vicarious-liability documents (RFPs 64-76)
- Marketing Services Agreements with sellers
- Scripts/training provided by sellers
- Compliance certifications to/from sellers
- Communications about TCPA compliance
- Branding guidelines and trademark licenses
- Sub-agent/downstream marketer agreements
- Lead-purchase agreements
- Payment records
- Notice of TCPA complaints to sellers
- Seller's continued engagement after notice (ratification)

## H. Prior litigation, complaints, and regulator interactions (RFPs 77-86)
- Prior TCPA lawsuit pleadings and dispositions
- Settlement agreements and consent decrees
- FCC/FTC/state AG correspondence
- Consumer complaint responses
- Internal complaint logs
- Investigation documents
- Policy changes made in response to complaints
- Insurance policies and reservation-of-rights letters

## I. Junk fax (if applicable) (RFPs 87-91)
- Transmission logs, broadcaster agreements
- Fax advertisement versions
- Opt-out notice compliance documents
- EBR documentation for fax recipients

## J. Recordkeeping and ESI (RFPs 92-100)
- Document retention policies and litigation holds
- Preservation notices to third parties
- Data maps identifying relevant systems
- Deletion logs and auto-purge documentation
- Backup tapes and recovery records
- Custodian identification
- Documents supporting affirmative defenses

---

## K. Common defense objections and counter-positions

| Defense objection | Plaintiff response |
|---|---|
| "Burden — class-wide call data is millions of rows." | A single SQL query returns the call file. CDRs are core evidence. |
| "Trade secret — dialer configs are proprietary." | Standard protective order. |
| "Third-party PII — internal DNC list has other consumers' numbers." | Produce with partial redaction preserving field structure. |
| "Vendor contracts contain confidentiality clauses." | Confidentiality clauses do not override Rule 34. Produce under protective order. |
| "Source code — proprietary and not relevant." | Source code may be the only definitive *Duguid* RSNG answer. Protective order is routine. |
| "Lead-source documentation is from a third party." | Defendant has "control" under Rule 34 if contract includes audit rights. |

---

## L. Cross-references

- `tcpa_disc_03_Interrogatories_to_Callers_Telemarketers.md`
- `tcpa_disc_06_RFPs_to_Sellers_Lead_Generators.md`
- `tcpa_03_ATDS_Post_Duguid.md`
- `tcpa_05_Prior_Express_Written_Consent.md`
- `tcpa_06_Revocation_of_Consent.md`
- `tcpa_09_DNC_Registry_and_Solicitation.md`
- `tcpa_14_FCC_Guidance_and_Orders.md`
