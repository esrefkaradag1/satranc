-- =============================================================================
-- Bu dosya yerine güncel tek dosya kullanın: NETCHESS_SUPABASE.sql
-- (study snapshots/presence, trigger'lar ve realtime dahil tam sürüm)
-- =============================================================================
-- NetChess — TEK SEFERDE TÜM ŞEMA (Supabase SQL Editor → RUN)
-- Mevcut tablolar korunur; eksik tablo/kolon eklenir (IF NOT EXISTS).
-- Sonrasında: Vercel env → VITE_SUPABASE_* + SUPABASE_SERVICE_ROLE_KEY
-- =============================================================================

-- ── 1. ÖĞRENCİLER ───────────────────────────────────────────────────────────
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
  sibling_discount_type text,
  sibling_discount_percent numeric,
  sibling_discount_amount numeric,
  parent_pin text,
  fide_id text,
  username text,
  password text,
  photo_url text,
  lesson_log jsonb DEFAULT '[]'::jsonb,
  training_group_id text,
  lesson_schedule jsonb DEFAULT '[]'::jsonb,
  dues_overrides jsonb DEFAULT '{}'::jsonb,
  dues_override_notes jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS contact_numbers jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_job text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_name text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_phone text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_job text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS health_info text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lichess_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS chess_com_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS tc_no text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS branch_office text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS branch_group text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lesson_log jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS training_group_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lesson_schedule jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dues_overrides jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dues_override_notes jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS sibling_discount_type text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS sibling_discount_percent numeric;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS sibling_discount_amount numeric;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS fide_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_pin text;

-- ── 2. BULMACALAR ───────────────────────────────────────────────────────────
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
  game_pgn text,
  lichess_themes text,
  source text
);

ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS image_data text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS imageData text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS game_pgn text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS lichess_themes text;

-- ── 3. ÖDEVLER ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homeworks (
  id text PRIMARY KEY,
  title text,
  puzzles jsonb,
  duedate text,
  assignedto jsonb,
  daily_game_target integer,
  daily_puzzle_target integer,
  min_puzzle_accuracy_pct integer,
  student_daily_targets jsonb
);

ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS daily_game_target integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS daily_puzzle_target integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS min_puzzle_accuracy_pct integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS student_daily_targets jsonb;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS duedate text;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS assignedto jsonb;

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

CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id text PRIMARY KEY,
  "studentId" text,
  "homeworkId" text,
  "submittedAt" text
);

-- ── 4. CANLI DERS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_lesson_state (
  id text PRIMARY KEY,
  room_name text,
  fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  coach_side text,
  arrows jsonb NOT NULL DEFAULT '[]'::jsonb,
  session_media jsonb DEFAULT '{}'::jsonb,
  chat_messages jsonb DEFAULT '[]'::jsonb,
  marks jsonb DEFAULT '{}'::jsonb,
  variations jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS room_name text;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS coach_side text;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS arrows jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS session_media jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS chat_messages jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS marks jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS variations jsonb DEFAULT '{}'::jsonb;

-- session_media JSON alanları (ek kolon gerekmez):
-- floorStudentId, handRaisedStudentIds, independentBoardStudentIds, studentBoards,
-- pendingStudentIds, admittedStudentIds, kickedStudentIds, openParticipation, ...

-- ── 5. YOKLAMA ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id text PRIMARY KEY,
  date text,
  student_id text,
  lesson_id text,
  status text,
  notified_parent boolean,
  teacher_name text,
  lesson_summary text
);

-- ── 6. DERS PROGRAMI / DERSLER / ANTRENÖR ───────────────────────────────────
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

CREATE TABLE IF NOT EXISTS public.coaches (
  id text PRIMARY KEY,
  name text,
  branch text,
  phone text,
  email text
);

-- ── 7. KASA / GALERİ / ENVANTER / LOG ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id text PRIMARY KEY,
  date text NOT NULL,
  type text NOT NULL,
  category text,
  description text,
  payment_type text,
  amount numeric NOT NULL,
  branch text,
  processed_by text,
  student_id text,
  total_amount numeric
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS processed_by text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS total_amount numeric;

CREATE TABLE IF NOT EXISTS public.gallery (
  id text PRIMARY KEY,
  url text NOT NULL,
  title text,
  group_name text,
  date text,
  student_id text
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id text PRIMARY KEY,
  name text,
  category text,
  stock integer,
  unit text,
  status text,
  "minStock" integer
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id text PRIMARY KEY,
  "user" text,
  action text,
  target text,
  timestamp text,
  type text
);

-- ── 8. PERFORMANS / TURNUVA / KULÜP ─────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS public.tournaments (
  id text PRIMARY KEY,
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('arena', 'swiss')),
  duration_minutes integer NOT NULL DEFAULT 45,
  time_control text NOT NULL DEFAULT '2+0',
  start_at timestamptz NOT NULL DEFAULT now(),
  description text,
  is_rated boolean NOT NULL DEFAULT true,
  created_by_role text NOT NULL CHECK (created_by_role IN ('admin', 'club')),
  created_by text NOT NULL,
  branch text,
  participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  standings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clubs (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text,
  active_days jsonb NOT NULL DEFAULT '[true,true,true,true,false,false,false]'::jsonb,
  login_password text
);

-- ── 9. VELİ İMZA / BAŞVURU ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_applications (
  id text PRIMARY KEY,
  application_no text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_applications DROP CONSTRAINT IF EXISTS student_applications_status_check;
ALTER TABLE public.student_applications ADD CONSTRAINT student_applications_status_check
  CHECK (status IN ('pending', 'signed', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_student_applications_status ON public.student_applications(status);
CREATE INDEX IF NOT EXISTS idx_student_applications_created ON public.student_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_applications_invite_token ON public.student_applications ((data->>'inviteToken'));

-- ── 10. AI RAPORLARI ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_ai_reports (
  id text PRIMARY KEY,
  student_id text NOT NULL,
  created_at text NOT NULL,
  title text,
  summary text,
  eksiklikler text,
  hamleler text,
  skill_snapshot jsonb,
  published_to_student boolean DEFAULT false,
  published_to_parent boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_coach_ai_reports_student ON public.coach_ai_reports(student_id);

-- ── 11. ÇALIŞMA (Study) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chess_studies (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '♟️',
  description text NOT NULL DEFAULT '',
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  member_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  chat_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility text NOT NULL DEFAULT 'public',
  chat text NOT NULL DEFAULT 'members',
  computer_analysis text NOT NULL DEFAULT 'everyone',
  opening_explorer text NOT NULL DEFAULT 'everyone',
  clone_permission text NOT NULL DEFAULT 'everyone',
  share_export text NOT NULL DEFAULT 'everyone',
  sync_enabled boolean NOT NULL DEFAULT true,
  study_comments text NOT NULL DEFAULT 'none',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  liked boolean NOT NULL DEFAULT false,
  likes integer NOT NULL DEFAULT 0,
  student_plays_color text NOT NULL DEFAULT 'both',
  student_created boolean NOT NULL DEFAULT false,
  created_by_student_id text,
  category_id text,
  created_at text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS category_id text;
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS student_plays_color text NOT NULL DEFAULT 'both';

CREATE TABLE IF NOT EXISTS public.chess_study_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id text NOT NULL,
  chapter_id text NOT NULL,
  student_id text NOT NULL,
  move_index integer NOT NULL DEFAULT 0,
  expected_move text,
  played_move text,
  result text NOT NULL CHECK (result IN ('correct', 'wrong', 'solution')),
  think_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_events_study ON public.chess_study_events(study_id);
CREATE INDEX IF NOT EXISTS idx_study_events_student ON public.chess_study_events(student_id);

-- Study event sourcing (Lichess-like) — ayrıntılı trigger'lar için supabase_study_actions.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.chess_study_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id text NOT NULL,
  chapter_id text NOT NULL,
  seq bigint NOT NULL,
  actor_id text,
  actor_role text,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chess_study_actions_study_chapter_seq
  ON public.chess_study_actions (study_id, chapter_id, seq);

-- ── 12. RLS (anon okuma; yazma service role ile) ─────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'students','puzzles','homeworks','homework_attempts','homework_submissions',
    'live_lesson_state','attendance_records','schedule_entries','lessons','coaches',
    'transactions','gallery','inventory','activity_logs','performance_analyses',
    'tournaments','clubs','student_applications','coach_ai_reports',
    'chess_studies','chess_study_events','chess_study_actions'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Public read %s" ON public.%I FOR SELECT USING (true)',
      t, t
    );
  END LOOP;
END $$;

-- ── 13. Storage: öğrenci fotoğrafları ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-photos',
  'student-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read student photos" ON storage.objects;
CREATE POLICY "Public read student photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Authenticated upload student photos" ON storage.objects;
CREATE POLICY "Authenticated upload student photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Authenticated update student photos" ON storage.objects;
CREATE POLICY "Authenticated update student photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'student-photos');

-- Not: Service role key RLS'i bypass eder (admin yazma). Veli imza API de service role kullanır.
