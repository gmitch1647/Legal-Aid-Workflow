CREATE TABLE IF NOT EXISTS public.profile_separation_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  replacement_client_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_separation_backups_owner
  ON public.profile_separation_backups(owner_profile_id, created_at DESC);
