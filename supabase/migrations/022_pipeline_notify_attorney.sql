-- Add attorney notification to pipeline stages
ALTER TABLE pipeline_stages
    ADD COLUMN IF NOT EXISTS notify_attorney boolean DEFAULT false;
