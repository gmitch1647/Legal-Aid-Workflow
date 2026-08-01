-- Create signing_sessions table for in-app e-signatures
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS signing_sessions (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT 'Document for Signature',
    document_type TEXT DEFAULT 'settlement',
    original_path TEXT NOT NULL,
    signed_path TEXT,
    signer_name TEXT NOT NULL,
    signer_email TEXT NOT NULL,
    case_id UUID REFERENCES cases(id),
    client_id UUID REFERENCES profiles(id),
    sent_by UUID REFERENCES profiles(id),
    attorney_name TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_signature',
    audit_trail JSONB,
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signing_sessions_token ON signing_sessions(token);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_status ON signing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_signing_sessions_client ON signing_sessions(client_id);
