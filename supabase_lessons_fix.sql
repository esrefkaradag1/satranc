-- lessons tablosu: "startTime" -> start_time, "endTime" -> end_time (tek seferlik)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'startTime') THEN
    ALTER TABLE public.lessons RENAME COLUMN "startTime" TO start_time;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'endTime') THEN
    ALTER TABLE public.lessons RENAME COLUMN "endTime" TO end_time;
  END IF;
END $$;
