-- ============================================================================
-- 001_initial_schema.sql
-- Initial database schema for Legal-Aid-Workflow CRM platform
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- profiles -----------------------------------------------------------------
CREATE TABLE profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('attorney', 'client')),
    full_name   text NOT NULL,
    email       text NOT NULL,
    phone       text,
    address     text,
    county      text,
    state       text,
    firm_name   text,   -- attorney only
    bar_number  text,   -- attorney only
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- cases --------------------------------------------------------------------
CREATE TABLE cases (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
    status               text NOT NULL DEFAULT 'submitted'
                         CHECK (status IN (
                             'submitted',
                             'approved_for_processing',
                             'agents_processing',
                             'draft_ready',
                             'attorney_review',
                             'approved',
                             'filed',
                             'closed'
                         )),
    court                text,
    jury_demand          boolean NOT NULL DEFAULT true,
    case_facts           text,
    damages_description  text,
    statutes_identified  jsonb,
    denial_reason        text,
    revision_notes       text,
    revision_count       integer NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- defendants ---------------------------------------------------------------
CREATE TABLE defendants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    principal_address   text,
    ga_registered_agent text,
    entity_type         text CHECK (entity_type IN ('CRA', 'Debt Collector', 'Furnisher', 'Bank')),
    is_custom           boolean NOT NULL DEFAULT false
);

-- case_defendants (join table) ---------------------------------------------
CREATE TABLE case_defendants (
    case_id      uuid NOT NULL REFERENCES cases ON DELETE CASCADE,
    defendant_id uuid NOT NULL REFERENCES defendants ON DELETE CASCADE,
    PRIMARY KEY (case_id, defendant_id)
);

-- case_documents -----------------------------------------------------------
CREATE TABLE case_documents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id            uuid NOT NULL REFERENCES cases ON DELETE CASCADE,
    file_name          text NOT NULL,
    file_type          text,
    file_size          bigint,
    storage_path       text NOT NULL,
    document_category  text CHECK (document_category IN (
                           'credit_report',
                           'dispute_letter',
                           'bureau_response',
                           'collection_notice',
                           'call_log',
                           'other'
                       )),
    uploaded_by        uuid REFERENCES profiles,
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- agent_outputs ------------------------------------------------------------
CREATE TABLE agent_outputs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       uuid NOT NULL REFERENCES cases ON DELETE CASCADE,
    agent_name    text NOT NULL CHECK (agent_name IN (
                      'intake_analyst',
                      'case_classifier',
                      'legal_researcher',
                      'damages_analyst',
                      'complaint_drafter',
                      'qa_reviewer'
                  )),
    status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'complete', 'error')),
    input_data    jsonb,
    output_data   jsonb,
    error_message text,
    started_at    timestamptz,
    completed_at  timestamptz
);

-- complaints ---------------------------------------------------------------
CREATE TABLE complaints (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             uuid NOT NULL REFERENCES cases ON DELETE CASCADE,
    complaint_text      text,
    complaint_docx_url  text,
    strategy_memo_url   text,
    version             integer NOT NULL DEFAULT 1,
    approved_by         uuid REFERENCES profiles,
    approved_at         timestamptz,
    is_current          boolean NOT NULL DEFAULT true
);

-- messages -----------------------------------------------------------------
CREATE TABLE messages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    uuid NOT NULL REFERENCES cases ON DELETE CASCADE,
    sender_id  uuid REFERENCES profiles,
    body       text NOT NULL,
    read       boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications ------------------------------------------------------------
CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid REFERENCES profiles,
    type       text NOT NULL CHECK (type IN (
                   'new_submission',
                   'draft_ready',
                   'revision_requested',
                   'case_approved',
                   'message_received'
               )),
    message    text NOT NULL,
    case_id    uuid,
    read       boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Trigger: auto-update updated_at on cases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_cases_client_id       ON cases (client_id);
CREATE INDEX idx_cases_status          ON cases (status);
CREATE INDEX idx_case_documents_case   ON case_documents (case_id);
CREATE INDEX idx_agent_outputs_case    ON agent_outputs (case_id);
CREATE INDEX idx_complaints_case       ON complaints (case_id);
CREATE INDEX idx_messages_case         ON messages (case_id);
CREATE INDEX idx_notifications_user    ON notifications (user_id);

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security
-- ---------------------------------------------------------------------------

-- profiles -----------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY profiles_select_attorney ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- cases --------------------------------------------------------------------
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY cases_select_client ON cases
    FOR SELECT USING (client_id = auth.uid());

CREATE POLICY cases_select_attorney ON cases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY cases_insert_client ON cases
    FOR INSERT WITH CHECK (client_id = auth.uid());

CREATE POLICY cases_update_attorney ON cases
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

-- case_documents -----------------------------------------------------------
ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_documents_select_client ON case_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = case_documents.case_id AND c.client_id = auth.uid()
        )
    );

CREATE POLICY case_documents_select_attorney ON case_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY case_documents_insert_own ON case_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = case_documents.case_id AND c.client_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

-- agent_outputs ------------------------------------------------------------
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_outputs_select_attorney ON agent_outputs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

-- complaints ---------------------------------------------------------------
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY complaints_select_attorney ON complaints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY complaints_select_client ON complaints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = complaints.case_id
              AND c.client_id = auth.uid()
              AND c.status IN ('approved', 'filed', 'closed')
        )
    );

-- messages -----------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select_party ON messages
    FOR SELECT USING (
        sender_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = messages.case_id AND c.client_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY messages_insert_party ON messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM cases AS c
                WHERE c.id = messages.case_id AND c.client_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM profiles AS p
                WHERE p.id = auth.uid() AND p.role = 'attorney'
            )
        )
    );

-- notifications ------------------------------------------------------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- defendants ---------------------------------------------------------------
ALTER TABLE defendants ENABLE ROW LEVEL SECURITY;

CREATE POLICY defendants_select_all ON defendants
    FOR SELECT USING (true);

CREATE POLICY defendants_insert_attorney ON defendants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY defendants_update_attorney ON defendants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

-- case_defendants ----------------------------------------------------------
ALTER TABLE case_defendants ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_defendants_select_client ON case_defendants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = case_defendants.case_id AND c.client_id = auth.uid()
        )
    );

CREATE POLICY case_defendants_select_attorney ON case_defendants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY case_defendants_insert_client ON case_defendants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM cases AS c
            WHERE c.id = case_defendants.case_id AND c.client_id = auth.uid()
        )
    );

CREATE POLICY case_defendants_insert_attorney ON case_defendants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

CREATE POLICY case_defendants_delete_attorney ON case_defendants
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'attorney'
        )
    );

-- ---------------------------------------------------------------------------
-- 6. Seed data: pre-populated defendants
-- ---------------------------------------------------------------------------
INSERT INTO defendants (name, principal_address, ga_registered_agent, entity_type, is_custom) VALUES
    (
        'Equifax Information Services LLC',
        '1550 Peachtree Street N.W., Atlanta, GA 30309',
        'Corporation Service Company, 2 Sun Court, Suite 400, Peachtree Corners, GA 30092',
        'CRA',
        false
    ),
    (
        'Experian Information Solutions Inc',
        '475 Anton Blvd, Costa Mesa, CA 92626',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'CRA',
        false
    ),
    (
        'TransUnion LLC',
        '555 W. Adams Street, Chicago, IL 60661',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'CRA',
        false
    ),
    (
        'Chex Systems Inc',
        '7805 Hudson Road, Suite 100, Woodbury, MN 55125',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'CRA',
        false
    ),
    (
        'Midland Credit Management Inc',
        '350 Camino de la Reina, Suite 300, San Diego, CA 92108',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Debt Collector',
        false
    ),
    (
        'LVNV Funding LLC',
        'PO Box 10497, Greenville, SC 29603',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Debt Collector',
        false
    ),
    (
        'Resurgent Capital Services LP',
        'PO Box 10497, Greenville, SC 29603',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Debt Collector',
        false
    ),
    (
        'Portfolio Recovery Associates LLC',
        '120 Corporate Blvd, Suite 100, Norfolk, VA 23502',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Debt Collector',
        false
    ),
    (
        'Truist Bank',
        '214 N Tryon St, Charlotte, NC 28202',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Furnisher',
        false
    ),
    (
        'ED Financial Services LLC',
        '120 N. Seven Oaks Drive, Knoxville, TN 37922',
        'C T Corporation System, 289 S Culver St, Lawrenceville, GA 30046-4805',
        'Furnisher',
        false
    );
