-- Kulüp lider tablosu paylaşılan önbellek.
-- Antrenör/admin tarar; öğrenci ve veli aynı tabloyu okur (kendi tarayıcıları taramaz).

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  snapshot_key     text PRIMARY KEY,
  club_scope       text NOT NULL,
  period           text NOT NULL,
  rank_mode        text NOT NULL,
  period_start_ms  bigint NOT NULL,
  entries          jsonb NOT NULL DEFAULT '[]'::jsonb,
  peer_count       integer NOT NULL DEFAULT 0,
  cached_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_lookup_idx
  ON public.leaderboard_snapshots (club_scope, period, rank_mode, period_start_ms);

ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_snapshots_select ON public.leaderboard_snapshots;
CREATE POLICY leaderboard_snapshots_select
  ON public.leaderboard_snapshots
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS leaderboard_snapshots_write ON public.leaderboard_snapshots;
CREATE POLICY leaderboard_snapshots_write
  ON public.leaderboard_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);
