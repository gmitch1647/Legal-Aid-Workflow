-- Case memory system — stores extracted knowledge from conversations and drafts
-- so the AI gets smarter about each case and attorney preferences over time.

-- Per-case memories (facts, decisions, strategies learned from conversations)
CREATE TABLE IF NOT EXISTS case_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'fact',  -- fact, decision, strategy, preference, instruction
    content TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'conversation',  -- conversation, draft, manual
    source_id TEXT,  -- conversation_id or draft_session_id
    importance INTEGER NOT NULL DEFAULT 5,  -- 1-10, higher = more important
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_mem_case ON case_memories(case_id);
CREATE INDEX IF NOT EXISTS idx_case_mem_category ON case_memories(category);

-- Global attorney preferences (style, formatting, legal strategies that apply across all cases)
CREATE TABLE IF NOT EXISTS attorney_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attorney_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'preference',  -- preference, style, strategy, instruction
    content TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'conversation',
    source_id TEXT,
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atty_mem_attorney ON attorney_memories(attorney_id);
CREATE INDEX IF NOT EXISTS idx_atty_mem_category ON attorney_memories(category);

-- RLS
ALTER TABLE case_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE attorney_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_mem_attorney_all ON case_memories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );

CREATE POLICY atty_mem_owner ON attorney_memories
    FOR ALL USING (
        attorney_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );
