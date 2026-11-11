-- Arena turnuva yöneticisi kilidi (lib/arenaDirector.ts).
-- Antrenör ekranı açık olmasa da turnuva akar: katılan öğrencilerin panelleri ve
-- antrenör ekranı birkaç saniyede bir "yönetici adımı" dener (sonuçları işle,
-- süresi biten maçları bitir, boştakileri eşleştir). Aynı anda yalnızca BİR
-- istemcinin bu adımı çalıştırması için kısa süreli kira (lease) kullanılır.
-- supabase_live_tournaments.sql'dan sonra Supabase SQL Editor'de çalıştırın.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS director_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS director_lease_holder text;

-- Kira boştaysa, süresi dolmuşsa veya zaten bu istemcideyse alır/yeniler ve true döner.
-- Tek UPDATE ifadesi satır kilidiyle atomiktir: iki istemci aynı anda deneyse de yalnızca biri kazanır.
CREATE OR REPLACE FUNCTION public.tournament_director_lease(
  p_tournament_id text,
  p_holder text,
  p_ttl_ms integer DEFAULT 10000
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.tournaments
  SET director_lease_until = now() + make_interval(secs => GREATEST(1000, LEAST(p_ttl_ms, 60000)) / 1000.0),
      director_lease_holder = p_holder
  WHERE id = p_tournament_id
    AND (
      director_lease_until IS NULL
      OR director_lease_until < now()
      OR director_lease_holder = p_holder
    );
  RETURN FOUND;
END;
$$;
