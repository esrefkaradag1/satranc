-- Antrenör giriş şifresi sütunu
-- Supabase SQL Editor'da çalıştırın.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS password text;

COMMENT ON COLUMN public.coaches.password IS 'Antrenör paneli giriş şifresi';

-- Mevcut antrenörlere varsayılan şifre atamak isterseniz (isteğe bağlı):
-- UPDATE public.coaches SET password = 'antrenor' WHERE password IS NULL OR password = '';
