-- Kulüp girişi: kullanıcı adı + parola
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS login_username text;

COMMENT ON COLUMN public.clubs.login_username IS 'Kulüp paneli giriş kullanıcı adı';

-- Mevcut kulüplere otomatik kullanıcı adı (küçük harf, tireli)
UPDATE public.clubs
SET login_username = lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]+', '-', 'g'), '(^-|-$)', '', 'g'))
WHERE login_username IS NULL OR trim(login_username) = '';
