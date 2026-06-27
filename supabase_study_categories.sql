-- Çalışma listesi kategorileri (Bölüm Ekle) — tüm cihazlarda aynı görünsün
CREATE TABLE IF NOT EXISTS public.chess_study_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chess_study_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read study categories" ON public.chess_study_categories;
CREATE POLICY "Public read study categories"
  ON public.chess_study_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write study categories" ON public.chess_study_categories;
CREATE POLICY "Service role write study categories"
  ON public.chess_study_categories FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
