-- Birden fazla kişisel kasa: her kişisel kasa işlemi bir kasa adına bağlanır.
-- Boş (NULL) ad = varsayılan "Kişisel Kasa".
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS personal_cash_name text;
