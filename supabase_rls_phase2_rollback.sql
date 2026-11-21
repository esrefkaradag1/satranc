-- ============================================================================
-- FAZ 2 GERİ ALMA — supabase_rls_phase2.sql öncesi davranışa döner
-- ============================================================================
-- Faz 2 sonrası bir ekran bozulursa: bu dosyayı çalıştırın, site hemen eski (herkese açık)
-- davranışına döner. Sonra sorunu bildirin; kural düzeltilip Faz 2 yeniden uygulanır.
-- Not: Bu, güvenlik açığını geri getirir — yalnızca geçici çözümdür.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t record;
  p record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.tablename);
    END LOOP;
    EXECUTE format('CREATE POLICY legacy_open ON public.%I FOR ALL USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $$;

GRANT SELECT ON public.clubs TO anon;

DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname <> 'students_public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = false)', v.viewname);
  END LOOP;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tournament_self_join(p_tournament_id text, p_student_id text)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.tournaments
  SET participant_ids = COALESCE(participant_ids, '[]'::jsonb) || to_jsonb(p_student_id)
  WHERE id = p_tournament_id
    AND NOT (COALESCE(participant_ids, '[]'::jsonb) @> to_jsonb(p_student_id));
$$;

CREATE OR REPLACE FUNCTION public.tournament_director_lease(
  p_tournament_id text,
  p_holder text,
  p_ttl_ms integer DEFAULT 10000
)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.tournaments
  SET director_lease_until = now() + make_interval(secs => GREATEST(1000, LEAST(p_ttl_ms, 60000)) / 1000.0),
      director_lease_holder = p_holder
  WHERE id = p_tournament_id
    AND (director_lease_until IS NULL OR director_lease_until < now() OR director_lease_holder = p_holder);
  RETURN FOUND;
END;
$$;

COMMIT;
