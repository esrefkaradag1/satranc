-- NetChess canlı turnuva maçları (Arena ve İsviçre).
-- Bu dosyayı Supabase SQL Editor'de NETCHESS_SUPABASE.sql'dan sonra çalıştırın.

-- Arena/İsviçre tur sayısı sınırı, seri bonusu ve takım savaşı ayarları
-- (lib/tournamentPairing.ts: Tournament.roundLimit/streakBonus/teamBattle).
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS round_limit integer,
  ADD COLUMN IF NOT EXISTS streak_bonus boolean,
  ADD COLUMN IF NOT EXISTS team_battle jsonb;

-- Eşleştirilen her gerçek (bay olmayan) çift için bir canlı maç satırı.
-- white_student_id/black_student_id, public.students.id (text) tipindedir — uuid değil.
CREATE TABLE IF NOT EXISTS public.tournament_games (
  id text PRIMARY KEY,
  tournament_id text NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_no integer NOT NULL DEFAULT 1,
  white_student_id text NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  black_student_id text NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'finished', 'cancelled')),
  result text CHECK (result IN ('1-0', '0-1', '1/2-1/2')),
  fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves jsonb NOT NULL DEFAULT '[]'::jsonb,
  white_time_ms integer NOT NULL DEFAULT 0,
  black_time_ms integer NOT NULL DEFAULT 0,
  turn_started_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (white_student_id <> black_student_id)
);

CREATE INDEX IF NOT EXISTS tournament_games_tournament_idx ON public.tournament_games(tournament_id, round_no);
CREATE INDEX IF NOT EXISTS tournament_games_white_idx ON public.tournament_games(white_student_id, status);
CREATE INDEX IF NOT EXISTS tournament_games_black_idx ON public.tournament_games(black_student_id, status);

CREATE OR REPLACE FUNCTION public.set_tournament_game_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_games_set_updated_at ON public.tournament_games;
CREATE TRIGGER tournament_games_set_updated_at
BEFORE UPDATE ON public.tournament_games
FOR EACH ROW EXECUTE FUNCTION public.set_tournament_game_updated_at();

ALTER TABLE public.tournament_games ENABLE ROW LEVEL SECURITY;

-- Okuma canlı tahta ve sıralama için açıktır. Yazma, bu projenin diğer tüm
-- realtime tabloları (chess_study_actions vb.) ile aynı modeli izler: istemci
-- service-role anahtarıyla yazar (RLS atlanır), anon anahtarla public policy ile değil.
DROP POLICY IF EXISTS "Public read tournament games" ON public.tournament_games;
CREATE POLICY "Public read tournament games"
  ON public.tournament_games FOR SELECT USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_games;
  END IF;
END $$;

-- Öğrencinin kendi kendine turnuvaya katılması: participant_ids (jsonb dizi,
-- bkz. NETCHESS_SUPABASE.sql) alanına yarış koşulu olmadan (atomik) ekler,
-- zaten varsa tekrar eklemez.
CREATE OR REPLACE FUNCTION public.tournament_self_join(p_tournament_id text, p_student_id text)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.tournaments
  SET participant_ids = COALESCE(participant_ids, '[]'::jsonb) || to_jsonb(p_student_id)
  WHERE id = p_tournament_id
    AND NOT (COALESCE(participant_ids, '[]'::jsonb) @> to_jsonb(p_student_id));
$$;
