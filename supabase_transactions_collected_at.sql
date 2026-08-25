-- Aidat/paket kayıtlarında date = dönem (ayın 1’i); collected_at = fiili tahsilat tarihi
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS collected_at text;
