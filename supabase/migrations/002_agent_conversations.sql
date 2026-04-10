-- ============================================================================
-- Migration 002: Interactive Agent Conversations
-- Adds tables for attorney ↔ AI agent chat sessions
-- ============================================================================

-- Conversations table — one per chat session with an agent
CREATE TABLE conversations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    case_id         uuid REFERENCES cases(id) ON DELETE SET NULL,
    agent_type      text NOT NULL CHECK (agent_type IN (
        'general',
        'legal_researcher',
        'case_analyst',
        'complaint_drafter',
        'damages_calculator',
        'strategy_advisor'
    )),
    title           text NOT NULL DEFAULT 'New Conversation',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Conversation messages — the actual chat messages
CREATE TABLE conversation_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    metadata        jsonb,  -- agent can attach structured data (citations, case refs, etc.)
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_case_id ON conversations(case_id);
CREATE INDEX idx_conversation_messages_convo_id ON conversation_messages(conversation_id);

-- Updated_at trigger
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: users can only see their own
CREATE POLICY conversations_select ON conversations
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY conversations_insert ON conversations
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY conversations_update ON conversations
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY conversations_delete ON conversations
    FOR DELETE USING (user_id = auth.uid());

-- Messages: users can see messages in their own conversations
CREATE POLICY conv_messages_select ON conversation_messages
    FOR SELECT USING (
        conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
    );
CREATE POLICY conv_messages_insert ON conversation_messages
    FOR INSERT WITH CHECK (
        conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
    );
