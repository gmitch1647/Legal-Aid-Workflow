# Official IRS Form W-9 Reference

## Sources

- [About Form W-9, Request for Taxpayer Identification Number and Certification](https://www.irs.gov/forms-pubs/about-form-w-9)
- [Form W-9 (Rev. March 2024) PDF](https://www.irs.gov/pub/irs-pdf/fw9.pdf)
- [Instructions for the Requester of Form W-9 (03/2024)](https://www.irs.gov/instructions/iw9)

## Design facts used in LegalFlow

The IRS states that Form W-9 is used to provide a correct taxpayer identification number (TIN) to a requester that may need to file an information return for income paid and other reportable transactions.

The current official Form W-9 layout includes: taxpayer name; business/disregarded-entity name; a federal tax classification selection; address (number, street, and apartment/suite); city, state, and ZIP code; optional account numbers; a TIN field for either Social Security Number or Employer Identification Number; and a Part II certification signature and date.

The March 2024 requester instructions clarify that a disregarded LLC should use the owner’s tax classification, while a non-disregarded LLC indicates its C, S, or P classification. The instructions also describe the newer line 3b foreign-partner/owner/beneficiary statement for certain partnerships, trusts, and estates.

The official form says to give Form W-9 to the requester, not the IRS. LegalFlow will therefore store the completed W-9 as a private, attorney-accessible record rather than submitting it to any government service.

## Implementation safeguards selected

- Store the taxpayer identification number encrypted at rest and never in application logs, URLs, client-side state after submission, or list/detail responses.
- Show only a masked TIN suffix to authorized attorneys.
- Store the completed W-9 PDF in a separate private bucket/path, not the general document bucket.
- Restrict each W-9 request and submission to the attorney who created it; enforce that boundary in both Supabase row-level security and the service-role backend, which bypasses row-level security by design.
- Retain signer IP, user agent, timestamp, and token use in an audit record only; do not print them on the W-9 PDF.
- Use a one-time, expiring signing token for W-9 collection.

Last reviewed: 2026-08-01
