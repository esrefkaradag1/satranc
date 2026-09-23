-- Öğrenci dondurma (pasif) başlangıç tarihi.
-- Aktife alırken pasif dönemde kalan aylar borç sayılmasın diye kullanılır.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS dues_freeze_started_at text;
