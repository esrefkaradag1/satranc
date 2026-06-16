-- ============================================================
-- Çalışma (Study) + sohbet + görüntülü görüşme — Supabase SQL
-- Supabase Dashboard > SQL Editor'da bu dosyayı çalıştırın.
-- ============================================================
-- • chess_studies: çalışmalar, bölümler, chat_messages (antrenör/öğrenci sohbeti)
-- • chess_study_events: öğrenci hamle sonuçları (doğru/yanlış)
-- • Görüntülü görüşme: Realtime Broadcast kullanır, ek tablo gerekmez.
--   Sadece Supabase URL + anon key ile Realtime kanalları çalışır.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chess_studies (
  id          text PRIMARY KEY,
  title       text NOT NULL DEFAULT '',
  emoji       text NOT NULL DEFAULT '♟️',
  description text NOT NULL DEFAULT '',
  chapters    jsonb NOT NULL DEFAULT '[]'::jsonb,
  member_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  chat_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility  text NOT NULL DEFAULT 'public',
  chat        text NOT NULL DEFAULT 'members',
  computer_analysis  text NOT NULL DEFAULT 'everyone',
  opening_explorer   text NOT NULL DEFAULT 'everyone',
  clone_permission   text NOT NULL DEFAULT 'everyone',
  share_export       text NOT NULL DEFAULT 'everyone',
  sync_enabled       boolean NOT NULL DEFAULT true,
  study_comments     text NOT NULL DEFAULT 'none',
  tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_tags  jsonb NOT NULL DEFAULT '[]'::jsonb,
  liked       boolean NOT NULL DEFAULT false,
  likes       integer NOT NULL DEFAULT 0,
  student_created boolean NOT NULL DEFAULT false,
  created_by_student_id text,
  created_at  text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Mevcut tabloya yeni sütunlar ekle (varsa hata verme)
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS topic_tags  jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS liked       boolean NOT NULL DEFAULT false;
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS likes       integer NOT NULL DEFAULT 0;
-- Öğrenci tarafı: white | black | both (both = tüm hamleler)
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS student_plays_color text NOT NULL DEFAULT 'both';
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS student_created boolean NOT NULL DEFAULT false;
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS created_by_student_id text;

-- Çalışma listesi klasörü (StudyPage yan menü); null = genel
ALTER TABLE public.chess_studies ADD COLUMN IF NOT EXISTS category_id text;

-- Öğrenci hamle kayıtları (event log)
CREATE TABLE IF NOT EXISTS public.chess_study_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     text NOT NULL,
  chapter_id   text NOT NULL,
  student_id   text NOT NULL,
  move_index   integer NOT NULL,
  expected_move text,
  played_move   text,
  result        text NOT NULL CHECK (result IN ('correct','wrong','solution')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security: herkes okuyabilir, service role yazabilir
ALTER TABLE public.chess_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read studies" ON public.chess_studies;
CREATE POLICY "Public read studies"
  ON public.chess_studies FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write studies" ON public.chess_studies;
CREATE POLICY "Service role write studies"
  ON public.chess_studies FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.chess_study_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read study events" ON public.chess_study_events;
CREATE POLICY "Public read study events"
  ON public.chess_study_events FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write study events" ON public.chess_study_events;
CREATE POLICY "Service role write study events"
  ON public.chess_study_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- Realtime aboneliği etkinleştir (zaten ekliyse hata verme)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_studies;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- zaten ekli, geç
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_study_events;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
