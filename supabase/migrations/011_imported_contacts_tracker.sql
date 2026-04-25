-- ============================================================================
-- Migration 011: Track imported SuiteDash contacts
-- Prevents re-importing contacts that were already imported and deleted
-- ============================================================================

CREATE TABLE IF NOT EXISTS imported_contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source          text NOT NULL DEFAULT 'suitedash',
    source_uid      text NOT NULL,
    email           text,
    imported_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE(source, source_uid)
);

CREATE INDEX idx_imported_contacts_source ON imported_contacts (source, source_uid);
CREATE INDEX idx_imported_contacts_email ON imported_contacts (email);

ALTER TABLE imported_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY imported_contacts_all ON imported_contacts
    FOR ALL USING (public.is_attorney());
