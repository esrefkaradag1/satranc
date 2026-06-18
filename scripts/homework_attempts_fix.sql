-- homework_attempts tablosu düzeltmesi (Supabase SQL Editor'da çalıştırın)
-- Canlı şemanız: studentid, homeworkid, puzzleid, movesplayed, finalfen (lowercase)

-- Eksik kolonlar (düşünme süresi / ipucu)
ALTER TABLE public.homework_attempts ADD COLUMN IF NOT EXISTS thinkseconds integer;
ALTER TABLE public.homework_attempts ADD COLUMN IF NOT EXISTS hintused boolean DEFAULT false;

-- Performans indeksleri
CREATE INDEX IF NOT EXISTS idx_homework_attempts_student ON public.homework_attempts (studentid);
CREATE INDEX IF NOT EXISTS idx_homework_attempts_homework ON public.homework_attempts (homeworkid);
CREATE INDEX IF NOT EXISTS idx_homework_attempts_puzzle ON public.homework_attempts (puzzleid);

-- RLS: anon okuyabilir; yazma service role veya API üzerinden yapılır
ALTER TABLE public.homework_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read homework_attempts" ON public.homework_attempts;
CREATE POLICY "Public read homework_attempts"
  ON public.homework_attempts FOR SELECT USING (true);

-- Kolon adlarını kontrol etmek için:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'homework_attempts'
-- ORDER BY ordinal_position;
