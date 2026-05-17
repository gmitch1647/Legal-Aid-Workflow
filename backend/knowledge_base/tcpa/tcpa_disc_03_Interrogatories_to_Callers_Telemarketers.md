# TCPA Discovery — Interrogatories to Callers and Telemarketers

**Primary authority:** Fed. R. Civ. P. 33; 47 U.S.C. § 227; 47 C.F.R. § 64.1200
**Key cases:** *Facebook, Inc. v. Duguid*, 141 S. Ct. 1163 (2021); *Krakauer v. Dish Network, LLC*, 925 F.3d 643 (4th Cir. 2019)

---

This file contains ~60 interrogatories organized into 9 topical sections for use by plaintiffs against callers/telemarketers in TCPA litigation. Each is a template to adapt. See `tcpa_disc_01` for strategic context and `tcpa_disc_04` for companion RFPs.

## B. Corporate structure and party identification (Interrogatories 1-6)
- Corporate identity, d/b/a's, EIN, FCC registration
- Parents, subsidiaries, affiliates participating in calls
- Officers, directors, key personnel
- TCPA compliance program ownership
- Defendant's role in each call
- Other parties in the call chain (seller, lead gen, dialer vendor, list provider)

## C. Calls to plaintiff and class (Interrogatories 7-12)
- Identification of each call (date, time, duration, disposition, campaign ID, caller ID)
- Calling number / spoofing analysis
- Campaign identification
- Number of calls to class
- Multiple lines / sequential dialing
- Text message platform details

## D. Dialer system and ATDS issues (Interrogatories 13-22)
- Dialer identification (manufacturer, brand, version)
- Vendor relationship details
- RSNG capacity (the central *Duguid* question)
- Dialing modes (preview, progressive, predictive, power, manual)
- List loading procedures
- Source of numbers
- Configuration files
- Human intervention analysis
- Artificial / prerecorded voice identification
- Prerecorded message identification disclosure compliance

## E. Consent acquisition (Interrogatories 23-33)
- Consent for plaintiff's number
- Form of consent (web, call recording, paper, double opt-in)
- Consent disclosures (verbatim text)
- One-to-one consent (post-2023 FCC rule)
- Lead source identification
- TrustedForm / Jornaya certificate details
- Web-form consent details (URL, version, IP)
- Inbound call consent
- Revocation tracking procedures
- Stop / opt-out keyword handling
- Plaintiff's revocation

## F. DNC compliance (Interrogatories 34-43)
- DNC subscriber registration
- DNC scrubbing vendor
- Scrub frequency
- Plaintiff's number on DNC
- Internal DNC list
- Plaintiff on internal DNC
- Written DNC procedures
- Training
- Time of day compliance
- Established business relationship

## G. Vicarious liability / seller identification (Interrogatories 44-49)
- Identification of seller
- Seller compensation
- Seller control (script approval, branding, QA)
- Branding authorization
- Sub-agent / downstream marketing
- Notice of TCPA complaints

## H. Prior litigation and complaints (Interrogatories 50-53)
- Prior TCPA lawsuits
- FCC, FTC, state AG, CFPB matters
- Consumer complaint volume
- Internal complaint log

## I. Time, place, and message content (Interrogatories 54-58)
- Geographic scope of calls
- Wireless identification procedures
- Reassigned-number database usage
- Message content
- Caller-ID display compliance

## J. Vendor and technical (Interrogatories 59-60)
- Dialer vendor declarations on ATDS/RSNG status
- Document custodians for all categories

## K. Common defense objections and counter-positions

| Defense objection | Plaintiff response |
|---|---|
| "Trade secret — dialer's RSNG capacity is confidential." | Offer protective order. |
| "Vendor contracts are confidential." | Protective order covers; basic terms must be disclosed. |
| "Burden — class period records would be voluminous." | Call counts are aggregate SQL queries. |
| "Consent records for non-plaintiff consumers are irrelevant." | Central to Rule 23 predominance. *Krakauer*, 925 F.3d at 658-60. |
| "We don't know whether the platform uses an RSNG." | Defendant's license rights include access to technical documentation. |
| "Prior lawsuits are inadmissible character evidence." | Discovery is broader than admissibility. Relevant to willfulness and ratification. |

---

## L. Cross-references

- `tcpa_disc_04_RFPs_to_Callers_Telemarketers.md`
- `tcpa_disc_05_Interrogatories_to_Sellers_Lead_Generators.md`
- `tcpa_03_ATDS_Post_Duguid.md`
- `tcpa_04_Prior_Express_Consent.md`
- `tcpa_06_Revocation_of_Consent.md`
- `tcpa_09_DNC_Registry_and_Solicitation.md`
- `tcpa_14_FCC_Guidance_and_Orders.md`
