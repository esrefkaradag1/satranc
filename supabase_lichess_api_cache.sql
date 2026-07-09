-- Lichess public API proxy önbelleği (sunucu tarafı, tüm instance'lar paylaşır).
-- Supabase SQL Editor'de bir kez çalıştırın.

CREATE TABLE IF NOT EXISTS public.lichess_api_cache (
  cache_key text PRIMARY KEY,
  status integer NOT NULL DEFAULT 200,
  body text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'application/json',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS lichess_api_cache_expires_at_idx
  ON public.lichess_api_cache (expires_at);

ALTER TABLE public.lichess_api_cache ENABLE ROW LEVEL SECURITY;

-- Sadece service role erişir (istemci tarafından okunmaz).
DROP POLICY IF EXISTS lichess_api_cache_service_only ON public.lichess_api_cache;
CREATE POLICY lichess_api_cache_service_only ON public.lichess_api_cache
  FOR ALL USING (false);
