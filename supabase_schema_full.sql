-- =============================================================================
-- TÜM SİSTEM İÇİN SUPABASE TABLOLARI
-- Supabase Dashboard → SQL Editor'a yapıştırıp RUN ile çalıştırın.
-- Mevcut tablolar varsa CREATE TABLE IF NOT EXISTS ile atlanır; eksik kolonlar
-- için aşağıdaki ALTER örneklerini kullanın.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ÖĞRENCİLER (students) — AppContext studentToDb: snake_case, group → group_name
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id text PRIMARY KEY,
  name text,
  level text,
  elo integer,
  ukd integer,
  last_attendance text,
  payment_status text,
  group_name text,
  parent_name text,
  parent_phone text,
  birth_date text,
  registration_date text,
  branch text,
  branch_group text,
  branch_office text,
  tc_no text,
  notes text,
  status text,
  lichess_username text,
  chess_com_username text,
  school text,
  teacher text,
  health_info text,
  registration_type text,
  monthly_fee numeric,
  payment_reminder_day text,
  late_payment_reminder_day text,
  is_scholarship_student boolean,
  parent_job text,
  father_name text,
  father_phone text,
  father_job text,
  mother_name text,
  mother_phone text,
  mother_job text,
  address text,
  contact_numbers jsonb,
  has_sibling_discount boolean,
  parent_pin text,
  fide_id text,
  username text,
  password text,
  photo_url text
);

-- Mevcut tabloda eksik kolon varsa (400 "column not found" alıyorsanız) aşağıdaki bloğu SQL Editor'da çalıştırın:
/*
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lichess_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS chess_com_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fide_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_pin text;
*/

-- -----------------------------------------------------------------------------
-- 2. YOKLAMA (attendance_records) — AppContext: id, date, student_id, status
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id text PRIMARY KEY,
  date text NOT NULL,
  student_id text NOT NULL,
  status text NOT NULL,
  lesson_id text,
  teacher_name text,
  lesson_summary text,
  notified_parent boolean
);

-- -----------------------------------------------------------------------------
-- 3. BULMACALAR (puzzles)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.puzzles (
  id text PRIMARY KEY,
  title text,
  fen text,
  difficulty text,
  points integer,
  category text,
  theme text,
  hint text,
  solution jsonb,
  image_data text,
  source text
);

-- Eksik kolon hatası (PGRST204 image_data) alıyorsanız çalıştırın:
-- ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS image_data text;

-- -----------------------------------------------------------------------------
-- 4. ÖDEVLER (homeworks) — homeworkToDb: duedate, assignedto
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homeworks (
  id text PRIMARY KEY,
  title text,
  puzzles jsonb,
  duedate text,
  assignedto jsonb
);

-- -----------------------------------------------------------------------------
-- 5. ÖDEV DENEMELERİ (homework_attempts) — uygulama camelCase gönderiyor
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework_attempts (
  id text PRIMARY KEY,
  "studentId" text,
  "homeworkId" text,
  "puzzleId" text,
  "puzzleTitle" text,
  correct boolean,
  "movesPlayed" jsonb,
  "solutionMoves" jsonb,
  "finalFen" text,
  timestamp text
);

-- -----------------------------------------------------------------------------
-- 6. ÖDEV TESLİMLERİ (homework_submissions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id text PRIMARY KEY,
  "studentId" text,
  "homeworkId" text,
  "submittedAt" text
);

-- -----------------------------------------------------------------------------
-- 7. DERS PROGRAMI (schedule_entries) — scheduleEntryToDb: snake_case
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_entries (
  id text PRIMARY KEY,
  week integer,
  year integer,
  day_of_week integer,
  slot_index integer,
  group_name text,
  topic text,
  status text,
  student_id text,
  note text
);

-- -----------------------------------------------------------------------------
-- 8. AKTİVİTE LOG (activity_logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id text PRIMARY KEY,
  "user" text,
  action text,
  target text,
  timestamp text,
  type text
);

-- -----------------------------------------------------------------------------
-- 9. ANTRENÖRLER (coaches)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coaches (
  id text PRIMARY KEY,
  name text,
  branch text,
  phone text,
  email text
);

-- -----------------------------------------------------------------------------
-- 10. İŞLEMLER / KASA (transactions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id text PRIMARY KEY,
  date text,
  type text,
  category text,
  description text,
  "paymentType" text,
  amount numeric,
  branch text,
  "processedBy" text,
  "studentId" text
);

-- -----------------------------------------------------------------------------
-- 11. DERSLER (lessons) — sütunlar snake_case: start_time, end_time
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lessons (
  id text PRIMARY KEY,
  day text,
  start_time text,
  end_time text,
  group_name text,
  topic text,
  branch text,
  student_id text
);

-- Eski kurulumda startTime/endTime varsa snake_case'e çevir (tek seferlik)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'startTime') THEN
    ALTER TABLE public.lessons RENAME COLUMN "startTime" TO start_time;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'endTime') THEN
    ALTER TABLE public.lessons RENAME COLUMN "endTime" TO end_time;
  END IF;
END $$;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS student_id text;

-- -----------------------------------------------------------------------------
-- 12. ENVANTER (inventory)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
  id text PRIMARY KEY,
  name text,
  category text,
  stock integer,
  unit text,
  status text,
  "minStock" integer
);

-- -----------------------------------------------------------------------------
-- 13. GALERİ (gallery)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gallery (
  id text PRIMARY KEY,
  url text,
  title text,
  "group" text,
  date text
);

-- -----------------------------------------------------------------------------
-- 14. PERFORMANS ANALİZLERİ (performance_analyses)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance_analyses (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  branch text NOT NULL,
  analysis_date text NOT NULL,
  technical_skills integer NOT NULL,
  technical_notes text,
  physical_condition integer NOT NULL,
  physical_notes text,
  tactical_understanding integer NOT NULL,
  tactical_notes text,
  mental_state integer NOT NULL,
  mental_notes text,
  discipline_attitude integer NOT NULL,
  discipline_notes text,
  teamwork integer NOT NULL,
  teamwork_notes text,
  general_evaluation text,
  recommendations text,
  short_term_goal text,
  long_term_goal text,
  categories jsonb DEFAULT '[]'::jsonb
);

-- =============================================================================
-- MEVCUT TABLOLARA EKSİK KOLON EKLEME (tablo zaten varsa)
-- =============================================================================
-- Aşağıdaki satırları tek tek veya toplu çalıştırabilirsiniz.

-- lessons: "column startTime does not exist" hatası alıyorsanız tabloda eski adlar
-- kalmış olabilir. Yukarıdaki DO $$ bloğu "startTime"->start_time, "endTime"->end_time
-- dönüşümünü yapar. Hata view/trigger kaynaklıysa o nesnelerde startTime yerine start_time kullanın.

-- ALTER TABLE public.students ADD COLUMN IF NOT EXISTS group_name text;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS student_id text;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS lesson_summary text;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS teacher_name text;
-- ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS notified_parent boolean;
-- ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS source text;
-- ALTER TABLE public.schedule_entries ADD COLUMN IF NOT EXISTS note text;
-- ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS duedate text;
-- ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS assignedto jsonb;
