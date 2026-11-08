-- Turnuvalara planlanan tur sayısı (İsviçre sistemi için) eklenmesi.
-- Bu dosyayı Supabase SQL Editor'de NETCHESS_SUPABASE.sql'dan sonra çalıştırın.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS round_limit integer;
