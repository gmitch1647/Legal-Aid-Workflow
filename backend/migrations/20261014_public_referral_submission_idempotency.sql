-- Preserve one logical public referral submission across a dropped browser
-- connection or a safe retry. The backend service role is the only writer.
CREATE TABLE IF NOT EXISTS public.public_referral_submissions (
    submission_id UUID PRIMARY KEY,
    case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    result JSONB,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_referral_submissions_case_id_idx
    ON public.public_referral_submissions (case_id)
    WHERE case_id IS NOT NULL;
