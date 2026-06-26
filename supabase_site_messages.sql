-- Site içi mesajlaşma tablosu
-- Supabase Dashboard → SQL Editor → bu dosyanın tamamını yapıştırıp Run

CREATE TABLE IF NOT EXISTS public.site_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('parent', 'group', 'student')),
  target_student_id text,
  target_group text,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'coach', 'parent', 'student')),
  sender_name text NOT NULL DEFAULT 'Kullanıcı',
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_messages_conversation ON public.site_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_messages_created ON public.site_messages (created_at DESC);

ALTER TABLE public.site_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read site messages" ON public.site_messages;
CREATE POLICY "Public read site messages" ON public.site_messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert site messages" ON public.site_messages;
CREATE POLICY "Authenticated insert site messages" ON public.site_messages
  FOR INSERT WITH CHECK (true);

GRANT SELECT, INSERT ON public.site_messages TO anon, authenticated;

-- Eski kurulumda kind kısıtı güncelle
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'site_messages'
  ) THEN
    ALTER TABLE public.site_messages DROP CONSTRAINT IF EXISTS site_messages_kind_check;
    ALTER TABLE public.site_messages ADD CONSTRAINT site_messages_kind_check
      CHECK (kind IN ('parent', 'group', 'student'));
  END IF;
END $$;
