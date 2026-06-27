-- lessons tablosunu uygulama ile uyumlu hale getirir (tek seferlik)
-- Hata 1: invalid input syntax for type uuid: "tg-{groupId}-0"
-- Hata 2: start_time / group_name sütun adları

-- Bağımlı foreign key'leri kaldır (eski database.sql kurulumu)
ALTER TABLE IF EXISTS public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_lesson_id_fkey;

-- id: uuid -> text (tg-{uuid}-{slot} formatı için zorunlu)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons'
      AND column_name = 'id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.lessons ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.lessons ALTER COLUMN id TYPE text USING id::text;
  END IF;
END $$;

-- student_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons'
      AND column_name = 'student_id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.lessons ALTER COLUMN student_id TYPE text USING student_id::text;
  END IF;
END $$;

-- attendance_records.lesson_id: uuid -> text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_records'
      AND column_name = 'lesson_id' AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.attendance_records ALTER COLUMN lesson_id TYPE text USING lesson_id::text;
  END IF;
END $$;

-- Sütun adı düzeltmeleri (camelCase -> snake_case)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'startTime'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN "startTime" TO start_time;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'endTime'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN "endTime" TO end_time;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'group'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'group_name'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN "group" TO group_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'studentId'
  ) THEN
    UPDATE public.lessons SET student_id = "studentId"::text WHERE student_id IS NULL;
    ALTER TABLE public.lessons DROP COLUMN IF EXISTS "studentId";
  END IF;
END $$;

-- Eksik sütunları ekle
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS day text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS end_time text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS student_id text;

-- Primary key yoksa ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.lessons ADD PRIMARY KEY (id);
  END IF;
END $$;

COMMENT ON TABLE public.lessons IS 'Haftalık ders programı; eğitim gruplarından otomatik senkron (tg-{groupId}-{slot})';
