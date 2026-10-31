-- Veli paneli bildirim kutusu (antrenör yoklama/antrenman → veli paneli).
-- Hostinger statik sitede /api/whatsapp yok; tarayıcı doğrudan bu tabloyu okur/yazar.

CREATE TABLE IF NOT EXISTS public.parent_panel_notifications (
  id            text        PRIMARY KEY,
  student_id    text        NOT NULL,
  event         text        NOT NULL,
  title         text        NOT NULL,
  body          text        NOT NULL,
  branch_office text,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parent_panel_notifications_student_idx
  ON public.parent_panel_notifications (student_id, created_at DESC);

ALTER TABLE public.parent_panel_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_panel_notifications_select ON public.parent_panel_notifications;
CREATE POLICY parent_panel_notifications_select
  ON public.parent_panel_notifications
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS parent_panel_notifications_write ON public.parent_panel_notifications;
CREATE POLICY parent_panel_notifications_write
  ON public.parent_panel_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Kanal ayarı (whatsapp | panel | both | off) — yoklama varsayılanı panel.
CREATE TABLE IF NOT EXISTS public.notification_delivery_rules (
  event       text        PRIMARY KEY,
  channel     text        NOT NULL DEFAULT 'whatsapp',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_delivery_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_rules_select ON public.notification_delivery_rules;
CREATE POLICY notification_delivery_rules_select
  ON public.notification_delivery_rules
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS notification_delivery_rules_write ON public.notification_delivery_rules;
CREATE POLICY notification_delivery_rules_write
  ON public.notification_delivery_rules
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.notification_delivery_rules (event, channel) VALUES
  ('parent_login', 'whatsapp'),
  ('parent_consent', 'whatsapp'),
  ('lesson_start', 'both'),
  ('lesson_present', 'panel'),
  ('lesson_absent', 'panel'),
  ('training_completed', 'both'),
  ('training_partial', 'both'),
  ('training_incomplete', 'both')
ON CONFLICT (event) DO NOTHING;
