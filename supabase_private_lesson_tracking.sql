ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sale_kind text,
  ADD COLUMN IF NOT EXISTS lesson_package_id text,
  ADD COLUMN IF NOT EXISTS lesson_package_name text,
  ADD COLUMN IF NOT EXISTS lesson_discipline text,
  ADD COLUMN IF NOT EXISTS lesson_branch_office text,
  ADD COLUMN IF NOT EXISTS lesson_count integer,
  ADD COLUMN IF NOT EXISTS validity_days integer;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS lesson_id text;

CREATE INDEX IF NOT EXISTS idx_transactions_student_private_lesson
  ON public.transactions (student_id, category, lesson_package_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_student_lesson_date
  ON public.attendance_records (student_id, lesson_id, date DESC);
