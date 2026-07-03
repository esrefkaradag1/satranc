-- WhatsApp mesaj logları ve yapılandırma
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id text PRIMARY KEY DEFAULT 'default',
  api_base_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT 'netchess',
  enabled boolean NOT NULL DEFAULT false,
  branch_office text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id text PRIMARY KEY,
  phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  template_key text,
  student_id text,
  student_name text,
  branch_office text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created ON public.whatsapp_message_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_branch ON public.whatsapp_message_logs (branch_office);

CREATE TABLE IF NOT EXISTS public.whatsapp_auto_rules (
  event text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  template_key text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_contact_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  branch_office text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_auto_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contact_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all whatsapp_config" ON public.whatsapp_config;
CREATE POLICY "Allow all whatsapp_config" ON public.whatsapp_config FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Allow all whatsapp_templates" ON public.whatsapp_templates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all whatsapp_message_logs" ON public.whatsapp_message_logs;
CREATE POLICY "Allow all whatsapp_message_logs" ON public.whatsapp_message_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all whatsapp_auto_rules" ON public.whatsapp_auto_rules;
CREATE POLICY "Allow all whatsapp_auto_rules" ON public.whatsapp_auto_rules FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all whatsapp_contact_groups" ON public.whatsapp_contact_groups;
CREATE POLICY "Allow all whatsapp_contact_groups" ON public.whatsapp_contact_groups FOR ALL USING (true) WITH CHECK (true);
