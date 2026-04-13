-- ============================================================================
-- Migration 008: Add revision_history to cases for multi-turn revision chat
-- ============================================================================

ALTER TABLE cases
    ADD COLUMN IF NOT EXISTS revision_history jsonb DEFAULT '[]'::jsonb;
