-- Kulüp logosu + antrenör fotoğrafı depoları.
-- student-photos zaten NETCHESS_SUPABASE.sql içinde; bu dosya eksik bucket'ları ekler.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'club-logos',
    'club-logos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
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

DROP POLICY IF EXISTS "Public read club logos" ON storage.objects;
CREATE POLICY "Public read club logos" ON storage.objects
  FOR SELECT USING (bucket_id IN ('club-logos', 'coach-photos'));

DROP POLICY IF EXISTS "Authenticated upload club logos" ON storage.objects;
CREATE POLICY "Authenticated upload club logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('club-logos', 'coach-photos'));

DROP POLICY IF EXISTS "Authenticated update club logos" ON storage.objects;
CREATE POLICY "Authenticated update club logos" ON storage.objects
  FOR UPDATE USING (bucket_id IN ('club-logos', 'coach-photos'));
