-- ============================================================================
-- FAZ 2 — Veritabanı yetkileri (Row Level Security)
-- ============================================================================
-- Ön koşul: Faz 1 + Faz 2 istemci kodu canlıda (giriş /api/login, tarayıcı oturum belirteciyle
-- istek atıyor). Belirteç sunucudaki JWT_SECRET (Supabase JWT gizli anahtarı) ile imzalı;
-- iddialar: app_role (admin|club|coach|student|parent), student_id, club_id.
--
-- Etki:
--   * Ziyaretçi (anon, giriş yok): hiçbir kişisel veriye erişemez. Yalnızca başvuru formu ve
--     tanıtım sitesi için referans tablolar + kulüplerin ŞİFRESİZ sütunları okunur.
--   * Personel (admin/club/coach): tüm tablolar (bugünkü davranış).
--   * Öğrenci/veli: kendi kayıtları + paylaşılan içerik (bulmaca, ödev, turnuva, çalışma,
--     lider tablosu, canlı ders). Diğer öğrencilerin yalnızca güvenli alanları (students_public).
--   * Sunucu (service_role) RLS'ten etkilenmez.
--
-- Tek işlem: hata olursa hiçbir değişiklik uygulanmaz. Geri almak için supabase_rls_phase2_rollback.sql
-- Uyguladıktan sonra: node scripts/verify-rls.mjs (beklenen erişimleri doğrular, yalnızca okur).
-- ============================================================================

BEGIN;

-- ── 1. Yardımcılar (belirteç iddiaları) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_claims() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.app_role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT public.app_claims() ->> 'app_role' $$;

CREATE OR REPLACE FUNCTION public.app_student_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(public.app_claims() ->> 'student_id', '') $$;

CREATE OR REPLACE FUNCTION public.app_is_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(public.app_role() IN ('admin', 'club', 'coach'), false) $$;

CREATE OR REPLACE FUNCTION public.app_is_member() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(public.app_role() IN ('student', 'parent'), false) AND public.app_student_id() IS NOT NULL
$$;

-- ── 2. Tüm tablolarda RLS aç, eski kuralları kaldır, personele tam yetki ────
DO $$
DECLARE
  t record;
  p record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.tablename);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY staff_all ON public.%I FOR ALL TO authenticated USING (public.app_is_staff()) WITH CHECK (public.app_is_staff())',
      t.tablename
    );
  END LOOP;
END $$;

-- Görünümler sahibinin yetkisiyle çalışır ve RLS'i atlar → çağıranın yetkisiyle çalıştır.
DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname <> 'students_public' LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.viewname);
  END LOOP;
END $$;

-- ── 3. Öğrenci / veli kuralları ─────────────────────────────────────────────
-- 3a. Kendi kaydı
CREATE POLICY member_own_select ON public.students FOR SELECT TO authenticated
  USING (public.app_is_member() AND id::text = public.app_student_id());
CREATE POLICY member_own_update ON public.students FOR UPDATE TO authenticated
  USING (public.app_is_member() AND id::text = public.app_student_id())
  WITH CHECK (public.app_is_member() AND id::text = public.app_student_id());

-- 3b. Yalnızca kendi satırlarını okur
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('attendance_records', 'student_id'),
    ('homework_attempts', 'studentid'),
    ('homework_submissions', 'studentid'),
    ('homework_stats', 'student_id'),
    ('homework_assignees', 'student_id'),
    ('performance_analyses', 'student_id'),
    ('coach_ai_reports', 'student_id'),
    ('transactions', 'student_id'),
    ('payments', 'student_id'),
    ('parent_panel_notifications', 'student_id'),
    ('student_contacts', 'student_id'),
    ('mobile_push_tokens', 'student_id')
  ) AS x(tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col) THEN
      EXECUTE format(
        'CREATE POLICY member_own_select ON public.%I FOR SELECT TO authenticated USING (public.app_is_member() AND %I::text = public.app_student_id())',
        r.tbl, r.col
      );
    END IF;
  END LOOP;
END $$;

-- 3c. Paylaşılan içerik — öğrenci/veli okur
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clubs', 'coaches', 'branch_offices', 'branches', 'discipline_branches', 'training_groups', 'groups',
    'lesson_packages', 'homeworks', 'homework_assignments', 'homework_puzzles', 'puzzles', 'gallery',
    'schedule_entries', 'lessons', 'group_lesson_logs', 'tournaments', 'tournament_games',
    'leaderboard_period_stats', 'leaderboard_snapshots', 'chess_platform_day_stats',
    'chess_platform_day_activity', 'chess_com_tactics_lifetime', 'chess_studies', 'chess_study_actions',
    'chess_study_snapshots', 'chess_study_presence', 'chess_study_events', 'chess_study_categories',
    'live_lesson_state', 'app_roles', 'app_role_permissions', 'app_permissions'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY member_read ON public.%I FOR SELECT TO authenticated USING (public.app_is_member())', tbl);
    END IF;
  END LOOP;
END $$;

-- 3d. Öğrenci/veli yazmaları (envanter: öğrenci paneli, canlı ders, turnuva, çalışma, lider tablosu)
CREATE POLICY member_insert_own ON public.homework_attempts FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND studentid = public.app_student_id());
CREATE POLICY member_insert_own ON public.homework_submissions FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND COALESCE(studentid, student_id) = public.app_student_id());
CREATE POLICY member_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member());
CREATE POLICY member_update_own ON public.parent_panel_notifications FOR UPDATE TO authenticated
  USING (public.app_is_member() AND student_id = public.app_student_id())
  WITH CHECK (public.app_is_member() AND student_id = public.app_student_id());

-- Platform istatistikleri ve lider tablosu: kendi satırı; paylaşılan tablo görüntüsü herkes
CREATE POLICY member_write_own ON public.chess_platform_day_stats FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND student_id = public.app_student_id());
CREATE POLICY member_update_own ON public.chess_platform_day_stats FOR UPDATE TO authenticated
  USING (public.app_is_member() AND student_id = public.app_student_id())
  WITH CHECK (public.app_is_member() AND student_id = public.app_student_id());
CREATE POLICY member_write_own ON public.leaderboard_period_stats FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND student_id = public.app_student_id());
CREATE POLICY member_update_own ON public.leaderboard_period_stats FOR UPDATE TO authenticated
  USING (public.app_is_member() AND student_id = public.app_student_id())
  WITH CHECK (public.app_is_member() AND student_id = public.app_student_id());
CREATE POLICY member_write ON public.leaderboard_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member());
CREATE POLICY member_update ON public.leaderboard_snapshots FOR UPDATE TO authenticated
  USING (public.app_is_member()) WITH CHECK (public.app_is_member());

-- Turnuva: katılımcı öğrencinin paneli Arena/İsviçre yöneticisi olarak tur/sıralama ve maç yazar
CREATE POLICY member_update_participant ON public.tournaments FOR UPDATE TO authenticated
  USING (public.app_is_member() AND COALESCE(participant_ids, '[]'::jsonb) ? public.app_student_id())
  WITH CHECK (public.app_is_member() AND COALESCE(participant_ids, '[]'::jsonb) ? public.app_student_id());
CREATE POLICY member_insert_participant ON public.tournament_games FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_id AND COALESCE(t.participant_ids, '[]'::jsonb) ? public.app_student_id()));
CREATE POLICY member_update_participant ON public.tournament_games FOR UPDATE TO authenticated
  USING (public.app_is_member() AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_id AND COALESCE(t.participant_ids, '[]'::jsonb) ? public.app_student_id()))
  WITH CHECK (public.app_is_member());

-- Canlı ders: sohbet, el kaldırma, izin verilen tahtada hamle
CREATE POLICY member_update ON public.live_lesson_state FOR UPDATE TO authenticated
  USING (public.app_is_member()) WITH CHECK (public.app_is_member());

-- Çalışmalar (study): kendi çalışmasını açar/siler; paylaşılan çalışmalara sohbet/ilerleme yazar
CREATE POLICY member_insert_own ON public.chess_studies FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member() AND created_by_student_id = public.app_student_id());
CREATE POLICY member_update ON public.chess_studies FOR UPDATE TO authenticated
  USING (public.app_is_member()) WITH CHECK (public.app_is_member());
CREATE POLICY member_delete_own ON public.chess_studies FOR DELETE TO authenticated
  USING (public.app_is_member() AND created_by_student_id = public.app_student_id());
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['chess_study_actions', 'chess_study_snapshots', 'chess_study_presence', 'chess_study_events']
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY member_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_is_member())', tbl);
      EXECUTE format('CREATE POLICY member_update ON public.%I FOR UPDATE TO authenticated USING (public.app_is_member()) WITH CHECK (public.app_is_member())', tbl);
    END IF;
  END LOOP;
END $$;

-- Mesajlar: kendi konuşmaları (veli:/öğrenci:) ve grup duyuruları
CREATE POLICY member_select ON public.site_messages FOR SELECT TO authenticated
  USING (public.app_is_member() AND (
    conversation_id IN ('parent:' || public.app_student_id(), 'student:' || public.app_student_id())
    OR target_student_id = public.app_student_id()
    OR conversation_id LIKE 'group:%'));
CREATE POLICY member_insert ON public.site_messages FOR INSERT TO authenticated
  WITH CHECK (public.app_is_member()
    AND conversation_id IN ('parent:' || public.app_student_id(), 'student:' || public.app_student_id())
    AND sender_role IN ('student', 'parent'));

-- ── 4. Diğer öğrencilerin güvenli alanları ──────────────────────────────────
-- Sahibin yetkisiyle çalışır (RLS'i atlar) ama YALNIZCA bu sütunları verir: TC, telefon, veli,
-- adres, sağlık, aidat, şifre/PIN ve Lichess belirteci yoktur.
CREATE OR REPLACE VIEW public.students_public AS
  SELECT id, name, level, elo, ukd, status, registration_type, branch_id, group_id, branch, branch_group,
         branch_office, group_name, training_group_id, club_id, coach_id, photo_url, lichess_username,
         chesscom_username, chess_com_username, fide_id, chess_duello_username, chess_duello_member_id,
         created_at, updated_at
  FROM public.students;
REVOKE ALL ON public.students_public FROM PUBLIC, anon;
GRANT SELECT ON public.students_public TO authenticated;

-- ── 5. Ziyaretçi (anon) ─────────────────────────────────────────────────────
-- Başvuru formu ve tanıtım sitesi: referans tablolar + galeri
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['branch_offices', 'discipline_branches', 'training_groups', 'lesson_packages', 'gallery']
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY public_read ON public.%I FOR SELECT TO anon USING (true)', tbl);
    END IF;
  END LOOP;
END $$;
-- Kulüpler: satır herkese açık, ama şifre/kullanıcı adı sütunları ziyaretçiye kapalı
CREATE POLICY public_read ON public.clubs FOR SELECT TO anon USING (true);
REVOKE SELECT ON public.clubs FROM anon;
GRANT SELECT (id, name, address, active_days, role_id, leaderboard_points, profile) ON public.clubs TO anon;

-- ── 6. Fonksiyonlar ─────────────────────────────────────────────────────────
-- Turnuvaya katılma: öğrenci YALNIZCA kendisini ekleyebilir (personel herkesi)
CREATE OR REPLACE FUNCTION public.tournament_self_join(p_tournament_id text, p_student_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.app_is_staff() OR (public.app_is_member() AND p_student_id = public.app_student_id())) THEN
    RAISE EXCEPTION 'Bu turnuvaya yalnızca kendinizi ekleyebilirsiniz' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tournaments
  SET participant_ids = COALESCE(participant_ids, '[]'::jsonb) || to_jsonb(p_student_id)
  WHERE id = p_tournament_id
    AND NOT (COALESCE(participant_ids, '[]'::jsonb) @> to_jsonb(p_student_id));
END;
$$;

-- Turnuva yöneticisi kirası: personel ya da o turnuvanın katılımcısı
CREATE OR REPLACE FUNCTION public.tournament_director_lease(
  p_tournament_id text,
  p_holder text,
  p_ttl_ms integer DEFAULT 10000
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_is_staff() AND NOT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = p_tournament_id
      AND public.app_is_member()
      AND COALESCE(t.participant_ids, '[]'::jsonb) ? public.app_student_id()
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.tournaments
  SET director_lease_until = now() + make_interval(secs => GREATEST(1000, LEAST(p_ttl_ms, 60000)) / 1000.0),
      director_lease_holder = p_holder
  WHERE id = p_tournament_id
    AND (director_lease_until IS NULL OR director_lease_until < now() OR director_lease_holder = p_holder);
  RETURN FOUND;
END;
$$;

-- Ziyaretçi hiçbir fonksiyonu çağıramaz (RLS'i atlayan SECURITY DEFINER olanlar dahil)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

COMMIT;
