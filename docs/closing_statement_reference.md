# Settlement Closing Statement Reference Layout

The user-provided sample is a one-page, letter-size settlement-closing statement with the following visual and content structure.

1. Centered firm identity block at the top: firm name in bold uppercase; address; telephone and email; followed by a horizontal rule.
2. Centered, underlined uppercase heading: `SETTLEMENT CLOSING STATEMENT`.
3. Four left-aligned matter lines in this exact order: `Date:`, `Client:`, `Adverse Party:`, and `Re:`. The date line includes an underscored blank followed by a year.
4. Introductory paragraph stating that the gross settlement proceeds were received into the firm IOLTA trust account and will be disbursed as follows. The gross settlement is expressed in both words and a parenthetical dollar amount.
5. A narrow two-column distribution table with text descriptions aligned left and currency amounts aligned right. The final `TOTAL` row is bold and separated from the rows above by a horizontal rule.
6. A following paragraph states the non-monetary settlement consideration and confirms client approval of the stated disbursement.
7. An uppercase bold `APPROVED AND ACCEPTED:` heading, followed by an approximately 3-inch signature line, printed client name followed by `, Client`, and a shorter date line.

The generated workflow should preserve this one-page hierarchy and use the user’s active firm identity where available. It must not retain the sample client name, debtor, amounts, or account-ending data in any test fixture or production template.

## Requested calculation behavior

After a settlement document is uploaded, the attorney should provide the payment to the client. The generated distribution should calculate the remainder of the settlement as firm-side compensation using the selected/entered line-item allocation. The amount in all distribution lines must sum exactly to the gross settlement amount, and the document must visibly include the matter’s case number and signature/date section.

## Visual calibration comparison (2026-08-02)

The generated preview was compared against the uploaded one-page reference. The final renderer must retain the reference’s centered letterhead; full-width divider below the letterhead; centered, underlined `SETTLEMENT CLOSING STATEMENT` heading; compact left-aligned metadata block; indented three-line distribution table with amounts right aligned; rule directly above the bold `TOTAL` row; explanatory closing paragraph; and the `APPROVED AND ACCEPTED:` block with signature line, client name label, and separate date line. The preview revealed that the divider, title underline, and the reference table/signature offsets must be explicitly rendered rather than inferred from surrounding text.

## Final visual QA

A synthetic one-page PDF using non-sensitive test data was rendered and visually checked after calibration. The finalized layout includes the reference-style divider, underlined centered title, compact metadata area with the additional requested case-number line, indented right-aligned distribution rows, a clean total rule above the total row, and a lower-page signature/date block. The template remains one page for the tested distribution and standard non-monetary terms.
