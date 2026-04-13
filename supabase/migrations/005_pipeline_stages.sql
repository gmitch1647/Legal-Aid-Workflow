-- ============================================================================
-- Migration 005: Customizable Pipeline Stages
--
-- Moves pipeline stages from a hardcoded CHECK constraint into a
-- configurable table. Attorneys can add, remove, and reorder stages
-- from the Settings page.
-- ============================================================================

-- Create pipeline_stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,       -- internal key used in cases.status
    name        text NOT NULL,              -- display name shown in UI
    position    integer NOT NULL DEFAULT 0, -- sort order (0 = leftmost column)
    color       text DEFAULT 'slate',       -- tailwind color name for the column header
    description text,                       -- optional tooltip text
    is_system   boolean DEFAULT false,      -- true = cannot be deleted (core stages)
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Remove the old CHECK constraint on cases.status so custom stages work
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;

-- Pre-populate with the default pipeline stages
INSERT INTO pipeline_stages (slug, name, position, color, description, is_system) VALUES
    ('submitted',               'Submitted',              0, 'blue',    'Client submitted, awaiting attorney review', true),
    ('approved_for_processing', 'Approved for Processing', 1, 'indigo',  'Attorney approved, agents will run', true),
    ('agents_processing',       'Agents Processing',      2, 'cyan',    'Pipeline is running', true),
    ('draft_ready',             'Draft Ready',             3, 'amber',   'Agents completed, complaint awaiting review', true),
    ('attorney_review',         'Attorney Review',         4, 'purple',  'Attorney is reviewing/editing', false),
    ('approved',                'Approved',                5, 'green',   'Attorney approved the complaint', false),
    ('filed',                   'Filed',                   6, 'emerald', 'Complaint has been filed with court', false),
    ('closed',                  'Closed',                  7, 'slate',   'Case resolved or closed', false)
ON CONFLICT (slug) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_position ON pipeline_stages (position);

-- RLS — everyone can read, only attorneys can write
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_stages_select_all ON pipeline_stages
    FOR SELECT USING (true);

CREATE POLICY pipeline_stages_modify_attorney ON pipeline_stages
    FOR ALL USING (public.is_attorney());
