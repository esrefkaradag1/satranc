-- Günlük antrenman WhatsApp bildirimi — aynı gün/öğrenci/tür için tekrar gönderimi engeller
CREATE TABLE IF NOT EXISTS public.whatsapp_training_notifications (
  student_id text NOT NULL,
  day_iso date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('completed', 'incomplete')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, day_iso, kind)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_training_notify_day
  ON public.whatsapp_training_notifications (day_iso DESC);

ALTER TABLE public.whatsapp_training_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all whatsapp_training_notifications" ON public.whatsapp_training_notifications;
CREATE POLICY "Allow all whatsapp_training_notifications" ON public.whatsapp_training_notifications
  FOR ALL USING (true) WITH CHECK (true);
