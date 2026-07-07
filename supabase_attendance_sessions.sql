ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS attendance_type text,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS branch_office text,
  ADD COLUMN IF NOT EXISTS session_time text;
