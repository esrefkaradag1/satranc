-- Öğrenci çalışmalarının antrenör/admin listesinde görünürlüğü.
-- Varsayılan false: öğrenci «Antrenör ile paylaş» seçeneğini açana kadar listede görünmez.

ALTER TABLE public.chess_studies
  ADD COLUMN IF NOT EXISTS shared_with_coach boolean NOT NULL DEFAULT false;
