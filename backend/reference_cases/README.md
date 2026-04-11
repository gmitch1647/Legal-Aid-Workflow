# Reference Cases

Drop `.docx` files of previously-filed complaints here and the Complaint Drafter agent will read them at runtime and use them as style/structure references when drafting new complaints.

## How it works

When the Complaint Drafter agent runs, it scans this directory for `.docx` files, extracts the plain text from each one, and includes a condensed version of the most relevant examples in the system context. This teaches the agent to match the exact voice, numbering conventions, count structure, and damages language used in actual filed complaints.

## Recommended files

To match the LegalFlow drafting style, place these (or similar) filed complaints here:

- `gary_mitchell_v_equifax_1.docx`
- `gary_mitchell_v_equifax_2.docx`
- `gary_mitchell_v_chex_systems.docx`
- `gary_mitchell_v_truist_experian.docx`
- `trevor_kakungu_v_experian.docx`
- `trevor_kakungu_v_equifax.docx`
- `trevor_kakungu_v_midland_1.docx`
- `trevor_kakungu_v_midland_2.docx`
- `alante_pierce_v_experian_equifax.docx`
- `alysha_davis_v_equifax.docx`
- `kevin_jenkins_v_equifax.docx`
- `response_to_lvnv_counterclaim.docx`
- `lvnv_discovery_request.docx`
- `experian_discovery_request.docx`
- `credit_reporting_resource_guide.docx`

## File requirements

- Must be valid `.docx` (Microsoft Word format)
- Any client-confidential information should be redacted or pseudonymized
- Larger files are fine — the agent extracts and truncates text as needed

## Adding new references

Simply drop new `.docx` files into this folder and the agent will automatically pick them up on the next run. No code changes or restarts required.

## Note

This folder is version-controlled but the `.docx` files themselves are **gitignored** by default to avoid committing client data. To include them in your deployment, either:

1. Upload them directly to the Railway filesystem via `railway run`
2. Store them in Supabase Storage under `reference_cases/` and modify `complaint_drafter.py` to read from there
3. Remove `*.docx` from `.gitignore` if you've redacted all client information and want to commit them
