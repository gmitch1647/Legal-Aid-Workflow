-- Violation Pattern Database — structured lookup of every actionable violation
-- under FCRA, FDCPA, TCPA with elements, defenses, damages, and case law citations.

CREATE TABLE IF NOT EXISTS violation_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statute TEXT NOT NULL,            -- 'FCRA', 'FDCPA', 'TCPA', 'GA_FBPA'
    section TEXT NOT NULL,            -- e.g. '1681e(b)', '1692e(2)(A)'
    short_name TEXT NOT NULL,         -- e.g. 'Failure to Follow Reasonable Procedures'
    description TEXT NOT NULL,        -- Full description of the violation
    defendant_type TEXT NOT NULL,     -- 'CRA', 'furnisher', 'debt_collector', 'caller', 'any'
    elements JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Array of strings: what must be proven
    common_evidence JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array: typical evidence needed
    defenses JSONB NOT NULL DEFAULT '[]'::jsonb,        -- Array: common defenses raised
    damages_statutory TEXT,           -- Statutory damages range
    damages_actual TEXT,              -- Typical actual damages
    damages_punitive TEXT,            -- Punitive damages availability
    attorney_fees BOOLEAN DEFAULT true,
    scienter TEXT,                    -- 'willful', 'negligent', 'strict', 'knowing'
    sol_years NUMERIC,               -- Statute of limitations in years
    sol_notes TEXT,                   -- SOL details (discovery rule, etc.)
    case_citations JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of {case, cite, holding, court, year}
    practice_tips JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of strings
    related_sections JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of related statute sections
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,            -- Search tags
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vp_statute ON violation_patterns(statute);
CREATE INDEX IF NOT EXISTS idx_vp_section ON violation_patterns(section);
CREATE INDEX IF NOT EXISTS idx_vp_defendant_type ON violation_patterns(defendant_type);
CREATE INDEX IF NOT EXISTS idx_vp_tags ON violation_patterns USING GIN (tags);

-- Case Law library — stores indexed judicial opinions for RAG retrieval
CREATE TABLE IF NOT EXISTS case_law (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_name TEXT NOT NULL,          -- e.g. 'Henson v. Santander Consumer USA'
    citation TEXT,                    -- e.g. '817 F.3d 131 (4th Cir. 2016)'
    court TEXT,                       -- e.g. 'N.D. Ga.', '11th Cir.', 'S.Ct.'
    year INTEGER,
    statutes JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Which statutes it interprets
    holding TEXT,                     -- Key holding
    full_text TEXT,                   -- Full opinion text (for RAG chunking)
    summary TEXT,                     -- AI-generated summary
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_file TEXT,                 -- Original filename
    indexed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_court ON case_law(court);
CREATE INDEX IF NOT EXISTS idx_cl_year ON case_law(year);
CREATE INDEX IF NOT EXISTS idx_cl_statutes ON case_law USING GIN (statutes);
CREATE INDEX IF NOT EXISTS idx_cl_indexed ON case_law(indexed);

-- Case law chunks for vector search (like reference_chunks but for opinions)
CREATE TABLE IF NOT EXISTS case_law_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_law_id UUID REFERENCES case_law(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clc_case_law ON case_law_chunks(case_law_id);
CREATE INDEX IF NOT EXISTS idx_clc_embedding ON case_law_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- RLS
ALTER TABLE violation_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_law ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_law_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY vp_attorney_all ON violation_patterns
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );

CREATE POLICY cl_attorney_all ON case_law
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );

CREATE POLICY clc_attorney_all ON case_law_chunks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'attorney')
    );
