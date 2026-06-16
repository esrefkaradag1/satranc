-- ============================================================================
-- Haftalık ders programı + öğrenciye özel ders (Müfredat & Öğrenci paneli)
-- Manuel çalıştırın: psql -f schedule_entries_sql.sql
-- ============================================================================

BEGIN;

-- Durum enum (frontend ile uyumlu)
DO $$ BEGIN
  CREATE TYPE schedule_entry_status AS ENUM (
    'yapildi', 'yapilmadi', 'deneme', 'iptal',
    'konu_calismasi', 'tatil', 'mola', 'zayif', 'ai_analiz'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tablo: Haftalık program hücreleri (grup veya öğrenciye özel)
CREATE TABLE IF NOT EXISTS schedule_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week           INT NOT NULL CHECK (week >= 1 AND week <= 53),
  year           INT NOT NULL,
  day_of_week    INT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  slot_index     INT NOT NULL CHECK (slot_index >= 1 AND slot_index <= 6),
  group_name     VARCHAR(150) NOT NULL,
  topic          VARCHAR(300) NOT NULL DEFAULT 'Ders',
  status         schedule_entry_status NOT NULL DEFAULT 'yapilmadi',
  student_id     UUID REFERENCES students(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Öğrenci/veli panelinden ders notu eklemek için (isteğe bağlı):
-- ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_entries_week_year_group
  ON schedule_entries (week, year, group_name);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_student
  ON schedule_entries (student_id) WHERE student_id IS NOT NULL;

COMMENT ON COLUMN schedule_entries.student_id IS 'NULL = tüm grup için; dolu = sadece bu öğrenciye özel ders';

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION trg_schedule_entries_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_entries_updated ON schedule_entries;
CREATE TRIGGER trg_schedule_entries_updated
  BEFORE UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE PROCEDURE trg_schedule_entries_updated();


-- ════════════════════════════════════════════════════════════════════════════
-- FONKSİYONLAR
-- ════════════════════════════════════════════════════════════════════════════

-- Ders ekle (grup veya öğrenciye özel)
CREATE OR REPLACE FUNCTION fn_schedule_entry_create(
  p_week        INT,
  p_year        INT,
  p_day_of_week INT,
  p_slot_index  INT,
  p_group_name  VARCHAR,
  p_topic       VARCHAR,
  p_status      schedule_entry_status DEFAULT 'yapilmadi',
  p_student_id  UUID DEFAULT NULL
) RETURNS SETOF schedule_entries AS $$
  INSERT INTO schedule_entries (week, year, day_of_week, slot_index, group_name, topic, status, student_id)
  VALUES (p_week, p_year, p_day_of_week, p_slot_index, p_group_name, p_topic, p_status, p_student_id)
  RETURNING *;
$$ LANGUAGE sql;

-- Ders güncelle
CREATE OR REPLACE FUNCTION fn_schedule_entry_update(
  p_id     UUID,
  p_topic  VARCHAR DEFAULT NULL,
  p_status schedule_entry_status DEFAULT NULL
) RETURNS SETOF schedule_entries AS $$
  UPDATE schedule_entries
  SET topic  = COALESCE(p_topic, topic),
      status = COALESCE(p_status, status)
  WHERE id = p_id
  RETURNING *;
$$ LANGUAGE sql;

-- Ders sil
CREATE OR REPLACE FUNCTION fn_schedule_entry_delete(p_id UUID)
RETURNS VOID AS $$
  DELETE FROM schedule_entries WHERE id = p_id;
$$ LANGUAGE sql;

-- Müfredat ekranı: Hafta + grup (+ isteğe bağlı öğrenci) için listele
CREATE OR REPLACE FUNCTION fn_schedule_entries_list(
  p_week        INT,
  p_year       INT,
  p_group_name VARCHAR,
  p_student_id UUID DEFAULT NULL
) RETURNS SETOF schedule_entries AS $$
  SELECT * FROM schedule_entries
  WHERE week = p_week AND year = p_year AND group_name = p_group_name
    AND (p_student_id IS NULL AND student_id IS NULL
         OR student_id = p_student_id)
  ORDER BY day_of_week, slot_index;
$$ LANGUAGE sql;

-- Öğrenci paneli: Bir öğrencinin gördüğü program (grup dersleri + kendine özel dersler; aynı hücrede özel öncelikli)
CREATE OR REPLACE FUNCTION fn_schedule_entries_for_student(
  p_student_id UUID,
  p_week       INT,
  p_year       INT
) RETURNS TABLE (
  id UUID,
  week INT,
  year INT,
  day_of_week INT,
  slot_index INT,
  group_name VARCHAR,
  topic VARCHAR,
  status schedule_entry_status,
  student_id UUID,
  is_private BOOLEAN
) AS $$
  WITH grp AS (
    SELECT COALESCE(g.name, s.branch_group, '') AS group_name
    FROM students s
    LEFT JOIN groups g ON g.id = s.group_id
    WHERE s.id = p_student_id
  ),
  group_entries AS (
    SELECT se.id, se.week, se.year, se.day_of_week, se.slot_index, se.group_name, se.topic, se.status, se.student_id, FALSE AS is_private
    FROM schedule_entries se
    CROSS JOIN grp g
    WHERE se.week = p_week AND se.year = p_year AND se.group_name = g.group_name AND se.student_id IS NULL
  ),
  student_entries AS (
    SELECT se.id, se.week, se.year, se.day_of_week, se.slot_index, se.group_name, se.topic, se.status, se.student_id, TRUE AS is_private
    FROM schedule_entries se
    WHERE se.week = p_week AND se.year = p_year AND se.student_id = p_student_id
  )
  SELECT * FROM group_entries
  UNION ALL
  SELECT * FROM student_entries
  ORDER BY day_of_week, slot_index;
$$ LANGUAGE sql;

COMMIT;
