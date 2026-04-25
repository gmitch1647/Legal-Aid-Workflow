-- ============================================================================
-- Migration 010: Custom intake forms
-- ============================================================================

CREATE TABLE IF NOT EXISTS intake_forms (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    description text,
    fields      jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active   boolean DEFAULT true,
    is_default  boolean DEFAULT false,
    settings    jsonb DEFAULT '{}'::jsonb,
    created_by  uuid REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Pre-populate with the default Case Referral form
INSERT INTO intake_forms (name, slug, description, is_active, is_default, fields) VALUES (
    'Case Referral',
    'case-referral',
    'Standard intake form for new consumer protection cases',
    true,
    true,
    '[
        {"id": "first_name", "label": "Client First Name", "type": "text", "required": true},
        {"id": "last_name", "label": "Client Last Name", "type": "text", "required": true},
        {"id": "email", "label": "Client Email", "type": "email", "required": true},
        {"id": "phone", "label": "Client Phone", "type": "tel", "required": true},
        {"id": "date_of_birth", "label": "Date of Birth", "type": "date", "required": false},
        {"id": "address", "label": "Address", "type": "text", "required": false},
        {"id": "city", "label": "City", "type": "text", "required": false},
        {"id": "state", "label": "State", "type": "select", "required": false, "options": ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"]},
        {"id": "zip_code", "label": "ZIP Code", "type": "text", "required": false},
        {"id": "case_type", "label": "Case Type", "type": "select", "required": false, "options": ["FCRA", "FDCPA", "TCPA", "FCRA + FDCPA", "Other"]},
        {"id": "violation_type", "label": "Type of Violation", "type": "select", "required": false, "options": ["Inaccurate Reporting", "Failure to Investigate", "Failure to Delete", "Reinsertion", "Harassment", "False Representations", "Autodialer Calls", "Other"]},
        {"id": "specific_violation", "label": "Specific Violation", "type": "text", "required": false},
        {"id": "adverse_party", "label": "Adverse Party", "type": "text", "required": false},
        {"id": "brief_description", "label": "Brief Description", "type": "textarea", "required": false},
        {"id": "affiliate_name", "label": "Affiliate Name", "type": "text", "required": false},
        {"id": "documents", "label": "Supporting Documents", "type": "file", "required": false}
    ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_forms_select_all ON intake_forms
    FOR SELECT USING (true);

CREATE POLICY intake_forms_modify_attorney ON intake_forms
    FOR ALL USING (public.is_attorney());
