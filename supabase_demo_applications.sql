-- Demo talepleri (public site → admin onay → kulüp + antrenör hesabı)
CREATE TABLE IF NOT EXISTS public.demo_applications (
  id text PRIMARY KEY,
  application_no text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  club_name text,
  contact_person text,
  phone text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_applications DROP CONSTRAINT IF EXISTS demo_applications_status_check;
ALTER TABLE public.demo_applications ADD CONSTRAINT demo_applications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_applications_no ON public.demo_applications(application_no);
CREATE INDEX IF NOT EXISTS idx_demo_applications_status ON public.demo_applications(status);
CREATE INDEX IF NOT EXISTS idx_demo_applications_created ON public.demo_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_applications_phone ON public.demo_applications(phone);

ALTER TABLE public.demo_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read demo_applications" ON public.demo_applications;
CREATE POLICY "Public read demo_applications" ON public.demo_applications
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert pending demo_applications" ON public.demo_applications;
CREATE POLICY "Public insert pending demo_applications" ON public.demo_applications
  FOR INSERT WITH CHECK (status = 'pending');
