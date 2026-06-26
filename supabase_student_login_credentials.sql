-- Öğrenci / veli paneli giriş bilgileri
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_pin text;

COMMENT ON COLUMN public.students.username IS 'Öğrenci paneli giriş kullanıcı adı';
COMMENT ON COLUMN public.students.password IS 'Öğrenci paneli giriş şifresi';
COMMENT ON COLUMN public.students.parent_pin IS 'Veli paneli PIN (opsiyonel)';

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_unique
  ON public.students (lower(trim(username)))
  WHERE username IS NOT NULL AND trim(username) <> '';
