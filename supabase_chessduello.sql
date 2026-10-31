-- ChessDuello Coach API anahtarı (sunucu tarafı). Tarayıcı bu tabloyu sorgulamaz.
-- Anahtar yalnızca /api/chessduello üzerinden okunur.

CREATE TABLE IF NOT EXISTS public.chessduello_coach_settings (
  club_id     text        PRIMARY KEY,
  api_key     text        NOT NULL,
  key_last4   text,
  clan_id     text,
  clan_name   text,
  last_ok_at  timestamptz,
  last_error  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chessduello_coach_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS chess_duello_username text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS chess_duello_member_id text;

CREATE INDEX IF NOT EXISTS students_chess_duello_member_idx
  ON public.students (chess_duello_member_id)
  WHERE chess_duello_member_id IS NOT NULL;
