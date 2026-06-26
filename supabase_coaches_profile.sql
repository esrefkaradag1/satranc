-- Antrenör profil alanları + fotoğraf depolama
-- Supabase SQL Editor'da çalıştırın.

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS specialization text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS birth_date text,
  ADD COLUMN IF NOT EXISTS fide_id text,
  ADD COLUMN IF NOT EXISTS lichess_username text;

COMMENT ON COLUMN public.coaches.photo_url IS 'Profil fotoğrafı public URL';
COMMENT ON COLUMN public.coaches.title IS 'Ünvan (FIDE Usta, Kıdemli Antrenör vb.)';
COMMENT ON COLUMN public.coaches.specialization IS 'Uzmanlık alanı';
COMMENT ON COLUMN public.coaches.bio IS 'Kısa özgeçmiş';
COMMENT ON COLUMN public.coaches.birth_date IS 'Doğum tarihi (YYYY-MM-DD)';
COMMENT ON COLUMN public.coaches.fide_id IS 'FIDE oyuncu ID';
COMMENT ON COLUMN public.coaches.lichess_username IS 'Lichess kullanıcı adı';

-- Antrenör fotoğrafları için storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coach-photos',
  'coach-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read coach photos" ON storage.objects;
CREATE POLICY "Public read coach photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'coach-photos');

DROP POLICY IF EXISTS "Authenticated upload coach photos" ON storage.objects;
CREATE POLICY "Authenticated upload coach photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'coach-photos');

DROP POLICY IF EXISTS "Authenticated update coach photos" ON storage.objects;
CREATE POLICY "Authenticated update coach photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'coach-photos');
