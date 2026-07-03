-- Ders paketleri (özel ders vb.) — Branş & Grup sayfası
CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  branch_office text NOT NULL,
  discipline text NOT NULL,
  lesson_count integer NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 0,
  package_fee numeric NOT NULL DEFAULT 0,
  capacity integer NOT NULL DEFAULT 0,
  coach_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  club_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_packages_office ON public.lesson_packages (branch_office);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_discipline ON public.lesson_packages (discipline);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_club ON public.lesson_packages (club_id);

ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all lesson_packages" ON public.lesson_packages;
CREATE POLICY "Allow all lesson_packages" ON public.lesson_packages FOR ALL USING (true) WITH CHECK (true);
