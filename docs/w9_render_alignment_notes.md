# W-9 Rendering Calibration Notes

## Visual comparison performed

A completed W-9 submitted by the user was compared with the bundled IRS Form W-9 (Rev. March 2024) template. The completed file retains the official template geometry, so placement can be corrected deterministically without replacing the form.

## Confirmed issues

- The handwritten/typed signature is oversized relative to the Part II signature line and visually crowds adjacent labels.
- The date is placed too low/right relative to its designated date line.
- Current coordinates place text using individual baseline points rather than constraining each value to the visible field rectangle, which can make entries appear inconsistently aligned across fields.
- Taxpayer ID digits should be vertically centered and horizontally centered in each preprinted TIN cell instead of positioned using a fixed baseline without reference to the specific box dimensions.

## Rendering correction approach

- Define named rectangles for each fillable region on page one of the bundled official template.
- Use a baseline/text-fitting helper that centers each value vertically within the intended field and reduces font size only when required to avoid overflow.
- Fit the signature within a smaller inner rectangle wholly inside the signature line, preserving aspect ratio and trimming transparent/blank margins.
- Position the date inside a dedicated date rectangle aligned to the signature row.
- Draw classification marks centered inside the existing checkbox squares.
- Add image-based regression checks against the generated PDF so coordinate drift is detected without persisting taxpayer data.

Last reviewed: 2026-08-01

## Validation result

A synthetic completed W-9 preview was rendered after calibration. The legal name, business name, combined mailing address, city/state/ZIP line, LLC designation, taxpayer-ID digits, selected classification mark, signature, and date all remained inside their intended printed regions. In particular, the signature now fits within the signature field without overlapping the label or date area, while the date is centered in the dedicated date field. The automated regression suite asserts the same geometry using text, image, and taxpayer-ID-cell boundaries.

The client-provided PDF was used only to identify visual alignment issues. Its signer data is not copied into these notes or into test fixtures.
