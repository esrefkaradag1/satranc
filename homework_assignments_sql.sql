-- ============================================================================
-- Ödev atamaları (Bulmaca) — veritabanı şeması ve sorgular
-- database.sql içinde homework_assignments, homework_assignees, homework_puzzles
-- zaten var. Bu dosya: (1) Eksik sütunları ekler, (2) Öğrenciye göre ödev listesi
-- ve ödev oluşturma fonksiyonlarını tanımlar.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. database.sql'deki homework_assignments'ta olmayan sütunları ekle
--    (assigned_to / puzzle_ids kullanacaksak; yoksa 2. bölüm homework_assignees ile çalışır)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'assigned_to') THEN
    ALTER TABLE homework_assignments ADD COLUMN assigned_to JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'puzzle_ids') THEN
    ALTER TABLE homework_assignments ADD COLUMN puzzle_ids JSONB NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'time_limit_minutes') THEN
    ALTER TABLE homework_assignments ADD COLUMN time_limit_minutes INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'group_name') THEN
    ALTER TABLE homework_assignments ADD COLUMN group_name VARCHAR(150);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'updated_at') THEN
    ALTER TABLE homework_assignments ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homework_due_date ON homework_assignments (due_date);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'homework_assignments' AND column_name = 'assigned_to') THEN
    CREATE INDEX IF NOT EXISTS idx_homework_assigned_to ON homework_assignments USING GIN (assigned_to);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Öğrenci paneli: Bu öğrenciye atanmış ödevleri getir
--    Önce homework_assignees (student_id / group_id) ile eşleşenleri döndür;
--    assigned_to sütunu varsa ve doluysa onu da kullan.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_homework_list_for_student(
    p_student_id   UUID,
    p_student_group VARCHAR(150)
) RETURNS SETOF homework_assignments AS $$
DECLARE
    v_student_group_id UUID;
    v_group_norm       VARCHAR(150);
    v_id_text          TEXT;
BEGIN
    v_id_text := TRIM(p_student_id::TEXT);
    v_group_norm := LOWER(TRIM(COALESCE(p_student_group, '')));

    -- Öğrencinin group_id'si (database.sql'deki groups tablosuna göre)
    SELECT s.group_id INTO v_student_group_id FROM students s WHERE s.id = p_student_id LIMIT 1;

    RETURN QUERY
    SELECT DISTINCT h.*
    FROM homework_assignments h
    WHERE (
        -- Yöntem A: homework_assignees ile atanmış (student_id veya group_id)
        EXISTS (
            SELECT 1 FROM homework_assignees he
            WHERE he.homework_id = h.id
              AND (he.student_id = p_student_id OR he.group_id = v_student_group_id)
        )
        OR
        -- Yöntem B: assigned_to JSONB sütunu varsa ve kullanılıyorsa (sütun yoksa bu koşul atlanır)
        (
            EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = 'homework_assignments' AND c.column_name = 'assigned_to')
            AND h.assigned_to IS NOT NULL
            AND (
                (h.assigned_to @> to_jsonb(ARRAY[v_id_text]))
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(h.assigned_to) AS elem(val)
                    WHERE elem.val LIKE 'group:%'
                      AND LOWER(TRIM(REPLACE(elem.val, 'group:', ''))) = v_group_norm
                )
                OR (h.group_name IS NOT NULL AND LOWER(TRIM(h.group_name)) = v_group_norm)
            )
        )
    )
    ORDER BY h.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- Kullanım (öğrenci paneli):
-- SELECT * FROM fn_homework_list_for_student('öğrenci-uuid'::UUID, 'Alt Yapı A');


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Ödev oluştur (admin panelinden kayıt)
--    assigned_to ve puzzle_ids sütunları varsa kullanır; yoksa sadece
--    homework_assignments + homework_assignees + homework_puzzles ile çalışır.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_homework_create(
    p_title              VARCHAR(300),
    p_due_date           DATE,
    p_assigned_to        JSONB DEFAULT NULL,
    p_puzzle_ids         JSONB DEFAULT NULL,
    p_time_limit_minutes INT DEFAULT NULL,
    p_group_name         VARCHAR(150) DEFAULT NULL,
    p_branch             VARCHAR(100) DEFAULT NULL,
    p_description        TEXT DEFAULT NULL
) RETURNS SETOF homework_assignments AS $$
DECLARE
    v_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name = 'homework_assignments' AND c.column_name = 'assigned_to') THEN
        INSERT INTO homework_assignments (title, due_date, assigned_to, puzzle_ids, time_limit_minutes, group_name, branch, description, updated_at)
        VALUES (p_title, p_due_date, COALESCE(p_assigned_to, '[]'::jsonb), COALESCE(p_puzzle_ids, '[]'::jsonb), p_time_limit_minutes, p_group_name, p_branch, p_description, NOW())
        RETURNING id INTO v_id;
    ELSE
        INSERT INTO homework_assignments (title, due_date)
        VALUES (p_title, p_due_date)
        RETURNING id INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM homework_assignments WHERE id = v_id;
END;
$$ LANGUAGE plpgsql;

-- Örnek (assigned_to / puzzle_ids sütunları eklendiyse):
-- SELECT * FROM fn_homework_create(
--     'deneme', '2026-03-12'::DATE,
--     '["group:Alt Yapı A"]'::JSONB, '["puzzle-id-1"]'::JSONB,
--     60, 'Alt Yapı A', NULL, NULL
-- );


COMMIT;
