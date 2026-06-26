-- Öğrenci–antrenör bağlantısı (kurum kendi antrenörünü atar; antrenör yalnızca kendi öğrencilerini görür)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS coach_id text;

COMMENT ON COLUMN public.students.coach_id IS 'Birincil antrenör (coaches.id); grup antrenörleri training_groups.coach_ids ile tamamlanır';

CREATE INDEX IF NOT EXISTS idx_students_coach_id ON public.students (coach_id);
CREATE INDEX IF NOT EXISTS idx_students_branch_office ON public.students (branch_office);
