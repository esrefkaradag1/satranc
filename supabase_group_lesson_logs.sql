-- Grup ders konuları (yoklama ekranı)
-- Supabase Dashboard → SQL Editor → bu dosyanın tamamını yapıştırıp Run

CREATE TABLE IF NOT EXISTS public.group_lesson_logs (
  group_name text PRIMARY KEY,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_lesson_logs_updated ON public.group_lesson_logs (updated_at DESC);

ALTER TABLE public.group_lesson_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read group lesson logs" ON public.group_lesson_logs;
CREATE POLICY "Public read group lesson logs" ON public.group_lesson_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated upsert group lesson logs" ON public.group_lesson_logs;
CREATE POLICY "Authenticated upsert group lesson logs" ON public.group_lesson_logs
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_lesson_logs TO anon, authenticated;
