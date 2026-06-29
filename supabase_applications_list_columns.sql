-- =============================================================================
-- Başvuru listesi performansı: data jsonb (foto/imza) okumadan liste kolonları
-- Supabase SQL Editor'da çalıştırın, sonra sayfayı yenileyin.
-- =============================================================================

ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_name text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_tc_no text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_branch_office text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_group text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_club_id text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_student_id text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_birth_date text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_father_phone text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS app_mother_phone text;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS has_photo boolean DEFAULT false;
ALTER TABLE public.student_applications ADD COLUMN IF NOT EXISTS has_signature boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_student_applications_app_club_id
  ON public.student_applications (app_club_id);

CREATE INDEX IF NOT EXISTS idx_student_applications_app_student_id
  ON public.student_applications (app_student_id);

-- Geri doldurma (data jsonb'den bir kez — has_photo imza/foto içeriğini okumaz)
UPDATE public.student_applications
SET
  app_name = coalesce(app_name, nullif(trim(data->>'name'), '')),
  app_tc_no = coalesce(app_tc_no, nullif(trim(data->>'tcNo'), '')),
  app_branch_office = coalesce(app_branch_office, nullif(trim(data->>'branchOffice'), '')),
  app_group = coalesce(app_group, nullif(trim(data->>'group'), '')),
  app_club_id = coalesce(app_club_id, nullif(trim(data->>'clubId'), '')),
  app_student_id = coalesce(app_student_id, nullif(trim(data->>'studentId'), '')),
  app_birth_date = coalesce(app_birth_date, nullif(trim(data->>'birthDate'), '')),
  app_father_phone = coalesce(app_father_phone, nullif(trim(data->>'fatherPhone'), '')),
  app_mother_phone = coalesce(app_mother_phone, nullif(trim(data->>'motherPhone'), '')),
  has_photo = coalesce(has_photo, (data ? 'photoDataUrl')),
  has_signature = coalesce(has_signature, (data ? 'signatureDataUrl'))
WHERE app_name IS NULL OR app_club_id IS NULL;

CREATE OR REPLACE FUNCTION public.netchess_applications_sync_list_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.app_name := coalesce(nullif(trim(NEW.app_name), ''), nullif(trim(NEW.data->>'name'), ''));
  NEW.app_tc_no := coalesce(nullif(trim(NEW.app_tc_no), ''), nullif(trim(NEW.data->>'tcNo'), ''));
  NEW.app_branch_office := coalesce(nullif(trim(NEW.app_branch_office), ''), nullif(trim(NEW.data->>'branchOffice'), ''));
  NEW.app_group := coalesce(nullif(trim(NEW.app_group), ''), nullif(trim(NEW.data->>'group'), ''));
  NEW.app_club_id := coalesce(nullif(trim(NEW.app_club_id), ''), nullif(trim(NEW.data->>'clubId'), ''));
  NEW.app_student_id := coalesce(nullif(trim(NEW.app_student_id), ''), nullif(trim(NEW.data->>'studentId'), ''));
  NEW.app_birth_date := coalesce(nullif(trim(NEW.app_birth_date), ''), nullif(trim(NEW.data->>'birthDate'), ''));
  NEW.app_father_phone := coalesce(nullif(trim(NEW.app_father_phone), ''), nullif(trim(NEW.data->>'fatherPhone'), ''));
  NEW.app_mother_phone := coalesce(nullif(trim(NEW.app_mother_phone), ''), nullif(trim(NEW.data->>'motherPhone'), ''));
  IF NEW.has_photo IS NULL THEN
    NEW.has_photo := (NEW.data ? 'photoDataUrl');
  END IF;
  IF NEW.has_signature IS NULL THEN
    NEW.has_signature := (NEW.data ? 'signatureDataUrl');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_applications_sync_list_cols ON public.student_applications;
CREATE TRIGGER trg_student_applications_sync_list_cols
  BEFORE INSERT OR UPDATE ON public.student_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.netchess_applications_sync_list_cols();

-- Hızlı liste RPC — data jsonb kolonuna dokunmaz
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
