-- Bulmaca toplu import: anon/authenticated yazma izni (RLS)
-- "Toplu bulmaca import DB'ye kaydedilemedi" hatası için Supabase SQL editöründe çalıştırın.

ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read puzzles" ON public.puzzles;
CREATE POLICY "Public read puzzles" ON public.puzzles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert puzzles" ON public.puzzles;
CREATE POLICY "Public insert puzzles" ON public.puzzles
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update puzzles" ON public.puzzles;
CREATE POLICY "Public update puzzles" ON public.puzzles
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete puzzles" ON public.puzzles;
CREATE POLICY "Public delete puzzles" ON public.puzzles
  FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.puzzles TO anon, authenticated;
