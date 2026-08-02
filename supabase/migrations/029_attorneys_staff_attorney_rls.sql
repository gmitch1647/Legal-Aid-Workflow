-- Allow attorneys and staff attorneys to use the shared closing-statement letterhead directory.
-- The API continues to enforce authentication and role checks before returning directory data.

DROP POLICY IF EXISTS attorneys_attorney_all ON public.attorneys;

CREATE POLICY attorneys_attorney_all ON public.attorneys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('attorney', 'staff_attorney')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('attorney', 'staff_attorney')
    )
  );
