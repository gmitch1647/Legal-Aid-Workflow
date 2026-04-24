-- ============================================================================
-- Migration 009: Calendar Events for case deadline tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         uuid REFERENCES cases(id) ON DELETE CASCADE,
    title           text NOT NULL,
    description     text,
    event_date      date NOT NULL,
    event_time      time,
    event_type      text DEFAULT 'deadline' CHECK (event_type IN (
        'deadline', 'hearing', 'filing', 'discovery_cutoff',
        'deposition', 'mediation', 'trial', 'conference',
        'statute_of_limitations', 'reminder', 'other'
    )),
    color           text DEFAULT 'blue',
    is_completed    boolean DEFAULT false,
    remind_days     integer DEFAULT 3,  -- remind N days before
    created_by      uuid REFERENCES profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_date ON calendar_events (event_date);
CREATE INDEX idx_calendar_events_case ON calendar_events (case_id);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_select ON calendar_events
    FOR SELECT USING (public.is_attorney());

CREATE POLICY calendar_events_modify ON calendar_events
    FOR ALL USING (public.is_attorney());
