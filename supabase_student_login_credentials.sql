-- Öğrenci / veli paneli giriş bilgileri
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_pin text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS club_id text;

COMMENT ON COLUMN public.students.username IS 'Öğrenci paneli giriş kullanıcı adı';
COMMENT ON COLUMN public.students.password IS 'Öğrenci paneli giriş şifresi';
COMMENT ON COLUMN public.students.parent_pin IS 'Veli paneli PIN (opsiyonel)';
COMMENT ON COLUMN public.students.club_id IS 'Bağlı kulüp (clubs.id) — supabase_students_club_id.sql ile tam kurulum';

-- Kulüp başına benzersiz kullanıcı adı (supabase_students_club_id.sql ile uyumlu)
DROP INDEX IF EXISTS public.idx_students_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_club_unique
  ON public.students (club_id, lower(trim(username)))
  WHERE username IS NOT NULL AND trim(username) <> '';
