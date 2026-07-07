ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS starting_used_lessons integer;
