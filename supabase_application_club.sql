-- Başvuru formlarında kulüp izolasyonu (data->>'clubId' indeksi)
CREATE INDEX IF NOT EXISTS idx_student_applications_club_id
  ON public.student_applications ((data->>'clubId'));

COMMENT ON INDEX idx_student_applications_club_id IS 'Kulüp bazlı başvuru filtreleme';
