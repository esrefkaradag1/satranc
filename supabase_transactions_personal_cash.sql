-- Kişisel kasa alanları (genel kasa toplamlarından ayrı tutulabilir)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS personal_cash boolean DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS include_in_general_cash boolean DEFAULT false;
