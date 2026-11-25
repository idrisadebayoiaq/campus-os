-- Calendar events: allow owners to update their own rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academic_calendar_events'
      AND policyname = 'Calendar update own'
  ) THEN
    CREATE POLICY "Calendar update own"
      ON public.academic_calendar_events
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Students need listing agent owner_user_id when starting a housing chat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'business_profiles'
      AND policyname = 'Public read business profiles'
  ) THEN
    CREATE POLICY "Public read business profiles"
      ON public.business_profiles
      FOR SELECT
      TO authenticated, anon
      USING (true);
  END IF;
END $$;

GRANT SELECT ON public.business_profiles TO authenticated, anon;
