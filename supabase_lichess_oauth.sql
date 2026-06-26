-- Lichess OAuth — students tablosuna gerekli sütunlar
-- Supabase Dashboard → SQL Editor → yapıştırıp Run

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lichess_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lichess_access_token text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS lichess_oauth_connected_at timestamptz;

-- Token hassas veri; RLS ile yalnızca service role yazabilir (mevcut students politikalarınız geçerli kalır)
COMMENT ON COLUMN public.students.lichess_access_token IS 'Lichess OAuth access token (PKCE); service role ile yazılır';
