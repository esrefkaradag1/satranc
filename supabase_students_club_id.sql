-- =============================================================================
-- Kulüp izolasyonu: students ve ilişkili tablolara club_id
-- Supabase SQL Editor'da çalıştırın (önce clubs tablosu dolu olmalı).
-- =============================================================================

-- ── 1. Öğrenciler ───────────────────────────────────────────────────────────
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS club_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_club_id_fkey' AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_club_id_fkey
      FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'students_club_id_fkey atlandı: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_club_id ON public.students (club_id);

COMMENT ON COLUMN public.students.club_id IS 'Öğrencinin bağlı olduğu kulüp (clubs.id)';

-- ── 2. Geri doldurma (backfill) ─────────────────────────────────────────────

-- 2a) branch_office = kulüp adı
UPDATE public.students s
SET club_id = c.id::text
FROM public.clubs c
WHERE s.club_id IS NULL
  AND s.branch_office IS NOT NULL
  AND trim(s.branch_office) <> ''
  AND lower(trim(s.branch_office)) = lower(trim(c.name));

-- 2b) antrenör şubesi üzerinden
UPDATE public.students s
SET club_id = c.id::text
FROM public.coaches ch
JOIN public.clubs c ON lower(trim(ch.branch)) = lower(trim(c.name))
WHERE s.club_id IS NULL
  AND s.coach_id IS NOT NULL
  AND trim(s.coach_id::text) = trim(ch.id::text);

-- 2c) eğitim grubu üzerinden
UPDATE public.students s
SET club_id = tg.club_id
FROM public.training_groups tg
WHERE s.club_id IS NULL
  AND s.training_group_id IS NOT NULL
  AND trim(s.training_group_id::text) = trim(tg.id::text)
  AND tg.club_id IS NOT NULL;

-- 2d) branch_offices kaydı üzerinden (şube adı eşleşmesi)
UPDATE public.students s
SET club_id = bo.club_id
FROM public.branch_offices bo
WHERE s.club_id IS NULL
  AND s.branch_office IS NOT NULL
  AND lower(trim(s.branch_office)) = lower(trim(bo.name))
  AND bo.club_id IS NOT NULL;

-- ── 3. Kullanıcı adı: kulüp başına benzersiz ────────────────────────────────
DROP INDEX IF EXISTS public.idx_students_username_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_club_unique
  ON public.students (club_id, lower(trim(username)))
  WHERE username IS NOT NULL AND trim(username) <> '';

-- Global benzersizlik (kulüpsüz kayıtlar / admin)
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username_global_unique
  ON public.students (lower(trim(username)))
  WHERE club_id IS NULL AND username IS NOT NULL AND trim(username) <> '';

-- ── 4. İlişkili tablolar ────────────────────────────────────────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.performance_analyses ADD COLUMN IF NOT EXISTS club_id text;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS club_id text;

CREATE INDEX IF NOT EXISTS idx_transactions_club_id ON public.transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_club_id ON public.attendance_records (club_id);
CREATE INDEX IF NOT EXISTS idx_gallery_club_id ON public.gallery (club_id);
CREATE INDEX IF NOT EXISTS idx_homeworks_club_id ON public.homeworks (club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id ON public.tournaments (club_id);
CREATE INDEX IF NOT EXISTS idx_performance_analyses_club_id ON public.performance_analyses (club_id);
CREATE INDEX IF NOT EXISTS idx_coaches_club_id ON public.coaches (club_id);

-- Öğrenci üzerinden (student_id text, students.id uuid olabilir — text karşılaştırma)
UPDATE public.transactions t
SET club_id = s.club_id
FROM public.students s
WHERE t.club_id IS NULL
  AND t.student_id IS NOT NULL
  AND trim(t.student_id::text) = trim(s.id::text)
  AND s.club_id IS NOT NULL;

UPDATE public.attendance_records a
SET club_id = s.club_id
FROM public.students s
WHERE a.club_id IS NULL
  AND a.student_id IS NOT NULL
  AND trim(a.student_id::text) = trim(s.id::text)
  AND s.club_id IS NOT NULL;

UPDATE public.gallery g
SET club_id = s.club_id
FROM public.students s
WHERE g.club_id IS NULL
  AND g.student_id IS NOT NULL
  AND trim(g.student_id::text) = trim(s.id::text)
  AND s.club_id IS NOT NULL;

UPDATE public.performance_analyses p
SET club_id = s.club_id
FROM public.students s
WHERE p.club_id IS NULL
  AND p.student_id IS NOT NULL
  AND trim(p.student_id::text) = trim(s.id::text)
  AND s.club_id IS NOT NULL;

-- Şube adı üzerinden
UPDATE public.transactions t
SET club_id = c.id::text
FROM public.clubs c
WHERE t.club_id IS NULL AND t.branch IS NOT NULL
  AND lower(trim(t.branch)) = lower(trim(c.name));

UPDATE public.tournaments t
SET club_id = c.id::text
FROM public.clubs c
WHERE t.club_id IS NULL AND t.branch IS NOT NULL
  AND lower(trim(t.branch)) = lower(trim(c.name));

UPDATE public.coaches ch
SET club_id = c.id::text
FROM public.clubs c
WHERE ch.club_id IS NULL AND ch.branch IS NOT NULL
  AND lower(trim(ch.branch)) = lower(trim(c.name));

-- ── 5. Özet (kontrol sorgusu) ───────────────────────────────────────────────
-- SELECT club_id, count(*) FROM public.students GROUP BY 1 ORDER BY 2 DESC;
-- SELECT count(*) AS club_id_yok FROM public.students WHERE club_id IS NULL;
