-- Kulüp lider tablosu puan ayarları (mod bazlı galibiyet/beraberlik/mağlubiyet)
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS leaderboard_points jsonb;
