-- Öğrenci bazlı lider tablosu dönem istatistiği (Lichess 429'e düşmesin).
-- Öğrenci kendi oturumunda 1 istek atar, antrenör tablosu buradan okur.

CREATE TABLE IF NOT EXISTS public.leaderboard_period_stats (
  student_id            text NOT NULL,
  period                text NOT NULL,
  period_start_ms       bigint NOT NULL,
  puzzles               integer NOT NULL DEFAULT 0,
  puzzle_wrong          integer NOT NULL DEFAULT 0,
  games                 integer NOT NULL DEFAULT 0,
  internal_puzzles      integer NOT NULL DEFAULT 0,
  wins                  integer NOT NULL DEFAULT 0,
  draws                 integer NOT NULL DEFAULT 0,
  losses                integer NOT NULL DEFAULT 0,
  game_results_by_mode  jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, period, period_start_ms)
);

CREATE INDEX IF NOT EXISTS leaderboard_period_stats_lookup_idx
  ON public.leaderboard_period_stats (period, period_start_ms);

ALTER TABLE public.leaderboard_period_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_period_stats_select ON public.leaderboard_period_stats;
CREATE POLICY leaderboard_period_stats_select
  ON public.leaderboard_period_stats
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS leaderboard_period_stats_write ON public.leaderboard_period_stats;
CREATE POLICY leaderboard_period_stats_write
  ON public.leaderboard_period_stats
  FOR ALL
  USING (true)
  WITH CHECK (true);
