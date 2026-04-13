-- ============================================================================
-- Migration 006: Multiple Pipelines by Case Type
--
-- Adds a pipelines table so attorneys can have separate Kanban boards
-- for FCRA, FDCPA, TCPA cases etc. Each pipeline has its own stages.
-- Stages with pipeline_id = NULL are shared across all pipelines.
-- ============================================================================

-- Pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    description text,
    color       text DEFAULT 'blue',
    is_default  boolean DEFAULT false,
    position    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Add pipeline_id to pipeline_stages (nullable = shared stage)
ALTER TABLE pipeline_stages
    ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL;

-- Add pipeline_id to cases so each case belongs to a pipeline
ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL;

-- Pre-populate default pipelines
INSERT INTO pipelines (name, slug, description, color, is_default, position) VALUES
    ('All Cases',  'all',   'Default pipeline showing all case types',  'slate',  true,  0),
    ('FCRA',       'fcra',  'Fair Credit Reporting Act cases',          'blue',   false, 1),
    ('FDCPA',      'fdcpa', 'Fair Debt Collection Practices Act cases', 'purple', false, 2),
    ('TCPA',       'tcpa',  'Telephone Consumer Protection Act cases',  'amber',  false, 3)
ON CONFLICT (slug) DO NOTHING;

-- Existing stages stay shared (pipeline_id = NULL means visible in all pipelines)
-- No update needed — they already have NULL pipeline_id

-- Index
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON pipeline_stages (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_cases_pipeline_id ON cases (pipeline_id);

-- RLS
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipelines_select_all ON pipelines
    FOR SELECT USING (true);

CREATE POLICY pipelines_modify_attorney ON pipelines
    FOR ALL USING (public.is_attorney());
