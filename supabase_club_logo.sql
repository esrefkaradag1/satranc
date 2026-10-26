ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS profile jsonb;
