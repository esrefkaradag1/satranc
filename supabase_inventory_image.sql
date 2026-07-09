-- Depo & Envanter: ürün küçük görseli için sütun
-- Küçültülmüş data URL veya yüklenmiş görsel URL'si saklanır.
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS "imageUrl" text;
