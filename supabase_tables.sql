-- Bu SQL dosyasını Supabase Dashboard -> SQL Editor kısmına yapıştırıp RUN (Çalıştır) butonuna basın.

CREATE TABLE IF NOT EXISTS public.homeworks (
  id text PRIMARY KEY,
  title text,
  puzzles jsonb,
  dueDate text,
  assignedTo jsonb,
  daily_game_target integer,
  daily_puzzle_target integer,
  min_puzzle_accuracy_pct integer,
  student_daily_targets jsonb
);
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS daily_game_target integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS daily_puzzle_target integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS min_puzzle_accuracy_pct integer;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS student_daily_targets jsonb;

CREATE TABLE IF NOT EXISTS public.homework_attempts (
  id text PRIMARY KEY,
  studentId text,
  homeworkId text,
  puzzleId text,
  puzzleTitle text,
  correct boolean,
  movesPlayed jsonb,
  solutionMoves jsonb,
  finalFen text,
  timestamp text
);

CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id text PRIMARY KEY,
  studentId text,
  homeworkId text,
  submittedAt text
);

-- Puzzles tablosu (zaten varsa hata vermez)
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
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS game_pgn text;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS lichess_themes text;

-- Öğrenciler: eksik kolonlar (PGRST204 "column not found" alıyorsanız SQL Editor'da çalıştırın)
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
-- Antrenör ders günlüğü (tarih, konu, bilgi) — öğrenci listesi «Ders günlüğü»
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lesson_log jsonb DEFAULT '[]'::jsonb;
-- Branş–grup: ders programı, ay bazlı aidat, grup bağlantısı
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS training_group_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lesson_schedule jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dues_overrides jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dues_override_notes jsonb DEFAULT '{}'::jsonb;

-- Canlı ders: tek paylaşılan tahta (antrenör + öğrenci aynı konum)
-- coach_side: 'w' = antrenör beyaz, 'b' = antrenör siyah, 'both' = her iki renk (işbirlik); öğrenci diğer tek renk ya da both ile sırada uyumlu
-- arrows: antrenörün tahtada çizdiği oklar (öğrenci tahtasında da görünür)
CREATE TABLE IF NOT EXISTS public.live_lesson_state (
  id text PRIMARY KEY,
  room_name text,
  fen text NOT NULL,
  moves jsonb NOT NULL DEFAULT '[]',
  coach_side text,
  arrows jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS room_name text;
-- ÖNEMLİ: live_lesson_state tablosu daha önce oluşturulduysa (coach_side/arrows yoksa)
-- aşağıdaki 2 satırı SQL Editor'da çalıştırın; 400 hatası böyle düzelir:
-- ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS coach_side text;
-- ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS arrows jsonb DEFAULT '[]';

-- Canlı ders: mikrofon söz hakkı + sohbet (JSON)
-- Bu iki kolon yoksa REST isteği session_media/chat_messages ile PATCH yapınca 400 verir; mutlaka çalıştırın.
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS session_media jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS chat_messages jsonb DEFAULT '[]'::jsonb;
-- Kare vurguları (tahta üzeri markup); kolon yokken istemci marks göndermez; varsa tam senkron olur:
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS marks jsonb DEFAULT '{}'::jsonb;
-- Varyasyon dalları: ana hat indeksine göre alternatif hamle satırları
ALTER TABLE public.live_lesson_state ADD COLUMN IF NOT EXISTS variations jsonb DEFAULT '{}'::jsonb;
-- session_media JSON içinde bağımsız öğrenci tahtaları: independentBoardStudentIds, studentBoards (ek kolon gerekmez)

-- Galeri: student_id null ise herkese açık; doluysa sadece o öğrenci ve velisi görür (group yerine group_name; group ayrılmış kelime)
CREATE TABLE IF NOT EXISTS public.gallery (
  id text PRIMARY KEY,
  url text NOT NULL,
  title text,
  group_name text,
  date text,
  student_id text
);
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS group_name text;

-- İşlemler (gelir/gider); öğrenciye ait ödemeler student_id ile ilişkilidir
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
  student_id text
);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS processed_by text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS total_amount numeric;

-- Kurumsal yapı: kulüp giriş ve şube bilgileri
CREATE TABLE IF NOT EXISTS public.clubs (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text,
  active_days jsonb NOT NULL DEFAULT '[true,true,true,true,false,false,false]'::jsonb,
  login_password text
);
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS active_days jsonb DEFAULT '[true,true,true,true,false,false,false]'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS login_password text;

-- Yoklama kayıtları (kolonlar snake_case: student_id, teacher_name, lesson_summary, notified_parent)
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

-- Grup ders konuları (yoklama — grup adı → konu listesi jsonb)
CREATE TABLE IF NOT EXISTS public.group_lesson_logs (
  group_name text PRIMARY KEY,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Turnuvalar (admin + kulüp ortak)
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
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS participant_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS rounds jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS standings jsonb DEFAULT '{}'::jsonb;

-- Çalışma (Study) analiz: öğrenci hamle kayıtları
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
ALTER TABLE public.chess_study_events ADD COLUMN IF NOT EXISTS think_ms integer DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_study_events_study ON public.chess_study_events(study_id);
CREATE INDEX IF NOT EXISTS idx_study_events_student ON public.chess_study_events(student_id);

-- chess_studies: bölüm/chapter kaydı için (supabase_studies.sql ile oluşturulmuş olmalı)
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS category_id text;

-- Online başvuru formları (public form + admin panel)
CREATE TABLE IF NOT EXISTS public.student_applications (
  id text PRIMARY KEY,
  application_no text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'approved', 'rejected')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_applications_status ON public.student_applications(status);
CREATE INDEX IF NOT EXISTS idx_student_applications_created ON public.student_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_applications_invite_token ON public.student_applications ((data->>'inviteToken'));

-- Mevcut veritabanları için status kısıtını güncelle (signed durumu)
ALTER TABLE public.student_applications DROP CONSTRAINT IF EXISTS student_applications_status_check;
ALTER TABLE public.student_applications ADD CONSTRAINT student_applications_status_check
  CHECK (status IN ('pending', 'signed', 'approved', 'rejected'));

-- Antrenör AI kapsamlı analiz raporları (öğrenci/veli paneli)
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

-- Storage: student-photos bucket → supabase_migration_complete.sql (bölüm 13)

-- =============================================================================
-- Tüm şema için tek dosya: supabase_migration_complete.sql (önerilen)
-- Çalışma event sourcing trigger'ları: supabase_study_actions.sql (opsiyonel 2. adım)
-- =============================================================================
