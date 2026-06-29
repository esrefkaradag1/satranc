-- =============================================================================
-- Kulüp izolasyonu — RLS ve filtreli okuma RPC'leri
--
-- ÖNEMLİ:
-- - Service role anahtarı RLS'i bypass eder (sunucu API / güvenli backend).
-- - Tarayıcıdaki anon key ile doğrudan SELECT * hâlâ risklidir; aşağıdaki
--   "Katı mod" bölümünü yalnızca uygulama filtreli RPC kullanacak şekilde
--   güncelledikten sonra etkinleştirin.
-- =============================================================================

-- ── 1. Oturum bağlamı (RPC ile kulüp kimliği) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.netchess_set_club_context(p_club_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_club_id', coalesce(trim(p_club_id), ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.netchess_clear_club_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_club_id', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.netchess_current_club_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_club_id', true), '');
$$;

REVOKE ALL ON FUNCTION public.netchess_set_club_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.netchess_clear_club_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.netchess_set_club_context(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.netchess_clear_club_context() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.netchess_current_club_id() TO anon, authenticated, service_role;

-- ── 2. Filtreli okuma RPC'leri (kulüp paneli için) ───────────────────────────

CREATE OR REPLACE FUNCTION public.netchess_list_students(p_club_id text)
RETURNS SETOF public.students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_club_id IS NULL OR trim(p_club_id) = '' THEN
    RETURN QUERY SELECT * FROM public.students ORDER BY name;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.students
    WHERE club_id = trim(p_club_id)
    ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.netchess_list_transactions(p_club_id text)
RETURNS SETOF public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_club_id IS NULL OR trim(p_club_id) = '' THEN
    RETURN QUERY SELECT * FROM public.transactions ORDER BY date DESC;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.transactions
    WHERE club_id = trim(p_club_id)
       OR (club_id IS NULL AND trim(student_id::text) IN (
            SELECT trim(id::text) FROM public.students WHERE club_id = trim(p_club_id)
          ))
    ORDER BY date DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.netchess_list_attendance(p_club_id text)
RETURNS SETOF public.attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_club_id IS NULL OR trim(p_club_id) = '' THEN
    RETURN QUERY SELECT * FROM public.attendance_records ORDER BY date DESC;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.attendance_records
    WHERE club_id = trim(p_club_id)
       OR trim(student_id::text) IN (
            SELECT trim(id::text) FROM public.students WHERE club_id = trim(p_club_id)
          )
    ORDER BY date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.netchess_list_students(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.netchess_list_transactions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.netchess_list_attendance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.netchess_list_students(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.netchess_list_transactions(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.netchess_list_attendance(text) TO anon, authenticated, service_role;

-- Başvuru formu özeti (öğrenci listesi — büyük imza jsonb çekmeden)
CREATE OR REPLACE FUNCTION public.netchess_application_list_meta(p_club_id text DEFAULT NULL)
RETURNS TABLE(student_id text, signed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    nullif(trim(data->>'studentId'), '') AS student_id,
    (status IN ('signed', 'approved')) AS signed
  FROM public.student_applications
  WHERE nullif(trim(data->>'studentId'), '') IS NOT NULL
    AND (
      p_club_id IS NULL
      OR trim(p_club_id) = ''
      OR data->>'clubId' = trim(p_club_id)
    );
$$;

REVOKE ALL ON FUNCTION public.netchess_application_list_meta(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.netchess_application_list_meta(text) TO anon, authenticated, service_role;

-- Başvuru fotoğrafları (öğrenci listesi — yalnızca photoDataUrl anahtarı)
CREATE OR REPLACE FUNCTION public.netchess_application_student_photos(p_club_id text DEFAULT NULL)
RETURNS TABLE(student_id text, photo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    nullif(trim(data->>'studentId'), '') AS student_id,
    nullif(trim(data->>'photoDataUrl'), '') AS photo_url
  FROM public.student_applications
  WHERE nullif(trim(data->>'studentId'), '') IS NOT NULL
    AND nullif(trim(data->>'photoDataUrl'), '') IS NOT NULL
    AND (
      p_club_id IS NULL
      OR trim(p_club_id) = ''
      OR data->>'clubId' = trim(p_club_id)
    );
$$;

REVOKE ALL ON FUNCTION public.netchess_application_student_photos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.netchess_application_student_photos(text) TO anon, authenticated, service_role;

-- Başvuru listesi (imza/foto jsonb göndermeden — app_* kolonları gerekli, bkz. supabase_applications_list_columns.sql)
CREATE OR REPLACE FUNCTION public.netchess_list_applications(p_club_id text DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'application_no', application_no,
    'status', status,
    'created_at', created_at,
    'updated_at', updated_at,
    'data', jsonb_strip_nulls(jsonb_build_object(
      'name', app_name,
      'tcNo', app_tc_no,
      'branchOffice', app_branch_office,
      'group', app_group,
      'birthDate', app_birth_date,
      'clubId', app_club_id,
      'studentId', app_student_id,
      'fatherPhone', app_father_phone,
      'motherPhone', app_mother_phone,
      'hasPhoto', has_photo,
      'hasSignature', has_signature
    ))
  )
  FROM public.student_applications
  WHERE (
    p_club_id IS NULL
    OR trim(p_club_id) = ''
    OR app_club_id = trim(p_club_id)
  )
  ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.netchess_list_applications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.netchess_list_applications(text) TO anon, authenticated, service_role;

-- ── 3. RLS yardımcı: satır kulüp kapsamında mı? ────────────────────────────
CREATE OR REPLACE FUNCTION public.netchess_row_visible_for_club(p_row_club_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(nullif(current_setting('app.current_club_id', true), ''), '') = ''
    OR p_row_club_id = current_setting('app.current_club_id', true)
    OR (p_row_club_id IS NULL AND current_setting('app.current_club_id', true) = '');
$$;

-- ── 4. Katı mod (isteğe bağlı — uygulama hazır olunca çalıştırın) ───────────
-- Aşağıdaki bloğu etkinleştirmeden önce:
--   1) supabase_students_club_id.sql backfill tamamlanmış olmalı
--   2) Uygulama giriş sonrası netchess_set_club_context RPC çağırmalı
--      veya netchess_list_* RPC kullanmalı
--
-- BEGIN katı mod;

/*
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'students','transactions','attendance_records','gallery','homeworks',
    'homework_attempts','homework_submissions','performance_analyses',
    'tournaments','coaches','discipline_branches','training_groups','branch_offices'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public read %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "netchess_club_read_%s" ON public.%I', t, t);
  END LOOP;
END $$;

-- students
CREATE POLICY "netchess_club_read_students" ON public.students
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- transactions
CREATE POLICY "netchess_club_read_transactions" ON public.transactions
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- attendance
CREATE POLICY "netchess_club_read_attendance_records" ON public.attendance_records
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- gallery
CREATE POLICY "netchess_club_read_gallery" ON public.gallery
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- homeworks
CREATE POLICY "netchess_club_read_homeworks" ON public.homeworks
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- tournaments
CREATE POLICY "netchess_club_read_tournaments" ON public.tournaments
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- coaches
CREATE POLICY "netchess_club_read_coaches" ON public.coaches
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- org structure
CREATE POLICY "netchess_club_read_discipline_branches" ON public.discipline_branches
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

CREATE POLICY "netchess_club_read_training_groups" ON public.training_groups
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

CREATE POLICY "netchess_club_read_branch_offices" ON public.branch_offices
  FOR SELECT TO anon, authenticated
  USING (public.netchess_row_visible_for_club(club_id));

-- Admin (boş context) tüm satırları görür; kulüp oturumu yalnızca kendi club_id'sini görür.
*/

-- ── 5. Yazma: club_id zorunlu kılma (trigger — isteğe bağlı) ─────────────────
CREATE OR REPLACE FUNCTION public.netchess_students_set_club_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.club_id IS NULL AND NEW.branch_office IS NOT NULL THEN
    SELECT c.id INTO NEW.club_id
    FROM public.clubs c
    WHERE lower(trim(c.name)) = lower(trim(NEW.branch_office))
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_set_club_id ON public.students;
CREATE TRIGGER trg_students_set_club_id
  BEFORE INSERT OR UPDATE OF branch_office, coach_id, training_group_id, club_id
  ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.netchess_students_set_club_id();
