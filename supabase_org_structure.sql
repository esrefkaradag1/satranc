-- Şube, branş ve eğitim grubu tanımları (Branş & Grup + başvuru formu)
CREATE TABLE IF NOT EXISTS public.branch_offices (
  id text PRIMARY KEY,
  name text NOT NULL,
  club_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_offices_name_club
  ON public.branch_offices (lower(trim(name)), coalesce(club_id, ''));

CREATE TABLE IF NOT EXISTS public.discipline_branches (
  id text PRIMARY KEY,
  name text NOT NULL,
  branch_office text NOT NULL,
  monthly_fee numeric NOT NULL DEFAULT 0,
  club_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discipline_branches_office ON public.discipline_branches (branch_office);
CREATE INDEX IF NOT EXISTS idx_discipline_branches_club ON public.discipline_branches (club_id);

CREATE TABLE IF NOT EXISTS public.training_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  branch_office text NOT NULL,
  discipline text NOT NULL,
  monthly_fee numeric,
  capacity integer NOT NULL DEFAULT 0,
  lesson_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  coach_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  club_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_groups_office ON public.training_groups (branch_office);
CREATE INDEX IF NOT EXISTS idx_training_groups_club ON public.training_groups (club_id);

ALTER TABLE public.branch_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discipline_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all branch_offices" ON public.branch_offices;
CREATE POLICY "Allow all branch_offices" ON public.branch_offices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all discipline_branches" ON public.discipline_branches;
CREATE POLICY "Allow all discipline_branches" ON public.discipline_branches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all training_groups" ON public.training_groups;
CREATE POLICY "Allow all training_groups" ON public.training_groups FOR ALL USING (true) WITH CHECK (true);
