-- ============================================================================
-- NetChess Academy — Veritabanı Şeması
-- PostgreSQL 15+
-- Doğrudan çalıştırılabilir: psql -f database.sql
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. ENUM Tipleri
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE user_role         AS ENUM ('ADMIN', 'COACH', 'STUDENT', 'PARENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE student_level     AS ENUM ('Başlangıç', 'Orta', 'İleri');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status    AS ENUM ('Paid', 'Unpaid', 'Partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE registration_type AS ENUM ('monthly', 'package');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE student_status    AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type  AS ENUM ('income', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method    AS ENUM ('Nakit', 'Havale/EFT', 'Kredi Kartı');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_type_en   AS ENUM ('Cash', 'Transfer', 'Card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE puzzle_difficulty AS ENUM ('Kolay', 'Orta', 'Zor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE day_of_week       AS ENUM ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABLOLAR
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(200) NOT NULL,
    role          user_role    NOT NULL DEFAULT 'COACH',
    phone         VARCHAR(20),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(150) NOT NULL UNIQUE,
    address    TEXT,
    phone      VARCHAR(20),
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(150) NOT NULL,
    branch_id  UUID REFERENCES branches(id) ON DELETE SET NULL,
    coach_id   UUID REFERENCES users(id)    ON DELETE SET NULL,
    capacity   INT DEFAULT 20,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, branch_id)
);

CREATE TABLE IF NOT EXISTS students (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      VARCHAR(200) NOT NULL,
    tc_no                     VARCHAR(11) UNIQUE,
    level                     student_level    NOT NULL DEFAULT 'Başlangıç',
    elo                       INT              NOT NULL DEFAULT 0,
    ukd                       INT              NOT NULL DEFAULT 0,
    payment_status            payment_status   NOT NULL DEFAULT 'Unpaid',
    registration_type         registration_type DEFAULT 'monthly',
    status                    student_status   NOT NULL DEFAULT 'active',
    branch_id                 UUID REFERENCES branches(id) ON DELETE SET NULL,
    group_id                  UUID REFERENCES groups(id)   ON DELETE SET NULL,
    branch                    VARCHAR(100),
    branch_group              VARCHAR(100),
    branch_office             VARCHAR(100),
    birth_date                DATE,
    registration_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    last_attendance           DATE,
    photo_url                 TEXT,
    school                    VARCHAR(200),
    teacher                   VARCHAR(200),
    address                   TEXT,
    notes                     TEXT,
    health_info               TEXT,
    lichess_username          VARCHAR(100),
    chesscom_username         VARCHAR(100),
    monthly_fee               NUMERIC(10,2) DEFAULT 0,
    payment_reminder_day      VARCHAR(10),
    late_payment_reminder_day VARCHAR(10),
    has_sibling_discount      BOOLEAN DEFAULT FALSE,
    sibling_discount_type     VARCHAR(10),
    sibling_discount_percent  NUMERIC(5,2),
    sibling_discount_amount   NUMERIC(10,2),
    is_scholarship_student    BOOLEAN DEFAULT FALSE,
    father_name               VARCHAR(200),
    father_phone              VARCHAR(20),
    father_job                VARCHAR(200),
    mother_name               VARCHAR(200),
    mother_phone              VARCHAR(20),
    mother_job                VARCHAR(200),
    parent_name               VARCHAR(200),
    parent_phone              VARCHAR(20),
    parent_job                VARCHAR(200),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_contacts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    phone      VARCHAR(20) NOT NULL,
    label      VARCHAR(50) DEFAULT 'WhatsApp',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date           DATE             NOT NULL DEFAULT CURRENT_DATE,
    type           transaction_type NOT NULL,
    category       VARCHAR(100)     NOT NULL,
    description    TEXT,
    payment_method payment_method   NOT NULL DEFAULT 'Nakit',
    amount         NUMERIC(12,2)    NOT NULL,
    branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
    processed_by   UUID REFERENCES users(id)    ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount      NUMERIC(10,2) NOT NULL,
    date        DATE          NOT NULL DEFAULT CURRENT_DATE,
    type        payment_type_en NOT NULL DEFAULT 'Cash',
    description TEXT,
    month       VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day        day_of_week  NOT NULL,
    start_time TIME         NOT NULL,
    end_time   TIME         NOT NULL,
    group_id   UUID REFERENCES groups(id) ON DELETE SET NULL,
    group_name VARCHAR(100),
    topic      VARCHAR(300) NOT NULL,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    branch_id  UUID REFERENCES branches(id) ON DELETE SET NULL,
    coach_id   UUID REFERENCES users(id)    ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    lesson_id       UUID REFERENCES lessons(id) ON DELETE SET NULL,
    status          attendance_status NOT NULL DEFAULT 'present',
    notified_parent BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (date, student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS puzzles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      VARCHAR(300) NOT NULL,
    fen        TEXT         NOT NULL,
    solution   TEXT[]       NOT NULL,
    difficulty puzzle_difficulty NOT NULL DEFAULT 'Kolay',
    points     INT          NOT NULL DEFAULT 10,
    category   VARCHAR(100) NOT NULL DEFAULT 'Genel',
    theme      VARCHAR(100),
    hint       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(300) NOT NULL,
    due_date    DATE         NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homework_puzzles (
    homework_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
    puzzle_id   UUID NOT NULL REFERENCES puzzles(id)              ON DELETE CASCADE,
    sort_order  INT DEFAULT 0,
    PRIMARY KEY (homework_id, puzzle_id)
);

CREATE TABLE IF NOT EXISTS homework_assignees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
    student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
    group_id    UUID REFERENCES groups(id)   ON DELETE CASCADE,
    CHECK (student_id IS NOT NULL OR group_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS homework_stats (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID NOT NULL REFERENCES students(id)              ON DELETE CASCADE,
    homework_id  UUID NOT NULL REFERENCES homework_assignments(id)  ON DELETE CASCADE,
    completed    BOOLEAN DEFAULT FALSE,
    accuracy     NUMERIC(5,2) DEFAULT 0,
    time_spent   INT DEFAULT 0,
    moves        TEXT[],
    last_attempt TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, homework_id)
);

CREATE TABLE IF NOT EXISTS gallery (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url         TEXT         NOT NULL,
    title       VARCHAR(300),
    group_name  VARCHAR(100),
    group_id    UUID REFERENCES groups(id) ON DELETE SET NULL,
    date        DATE DEFAULT CURRENT_DATE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. İNDEXLER
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_students_status     ON students (status);
CREATE INDEX IF NOT EXISTS idx_students_branch     ON students (branch_id);
CREATE INDEX IF NOT EXISTS idx_students_group      ON students (group_id);
CREATE INDEX IF NOT EXISTS idx_students_level      ON students (level);
CREATE INDEX IF NOT EXISTS idx_students_payment    ON students (payment_status);
CREATE INDEX IF NOT EXISTS idx_students_name       ON students (name);
CREATE INDEX IF NOT EXISTS idx_students_tc         ON students (tc_no);

CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_branch ON transactions (branch_id);

CREATE INDEX IF NOT EXISTS idx_payments_student    ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date       ON payments (date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_month      ON payments (month);

CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance_records (date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_student  ON attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_lesson   ON attendance_records (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lessons_day         ON lessons (day);
CREATE INDEX IF NOT EXISTS idx_lessons_group       ON lessons (group_id);

CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty  ON puzzles (difficulty);
CREATE INDEX IF NOT EXISTS idx_puzzles_category    ON puzzles (category);

CREATE INDEX IF NOT EXISTS idx_hw_stats_student    ON homework_stats (student_id);
CREATE INDEX IF NOT EXISTS idx_hw_stats_homework   ON homework_stats (homework_id);

CREATE INDEX IF NOT EXISTS idx_gallery_date        ON gallery (date DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_group       ON gallery (group_id);

CREATE INDEX IF NOT EXISTS idx_student_contacts    ON student_contacts (student_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. UPDATED_AT OTOMATİK GÜNCELLEME TRİGGER
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_updated       ON students;
DROP TRIGGER IF EXISTS trg_users_updated          ON users;
DROP TRIGGER IF EXISTS trg_homework_stats_updated ON homework_stats;

CREATE TRIGGER trg_students_updated
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_homework_stats_updated
    BEFORE UPDATE ON homework_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. VIEWS (Yardımcı Görünümler)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_student_summary AS
SELECT
    COUNT(*)                                           AS total_students,
    COUNT(*) FILTER (WHERE level = 'Başlangıç')       AS beginner_count,
    COUNT(*) FILTER (WHERE level = 'Orta')             AS intermediate_count,
    COUNT(*) FILTER (WHERE level = 'İleri')            AS advanced_count,
    COUNT(*) FILTER (WHERE payment_status = 'Paid')    AS paid_count,
    COUNT(*) FILTER (WHERE payment_status = 'Unpaid')  AS unpaid_count,
    COUNT(*) FILTER (WHERE payment_status = 'Partial') AS partial_count,
    ROUND(AVG(elo), 0)                                 AS avg_elo,
    ROUND(AVG(ukd), 0)                                 AS avg_ukd
FROM students
WHERE status = 'active';

CREATE OR REPLACE VIEW v_monthly_finance AS
SELECT
    TO_CHAR(date, 'YYYY-MM') AS month,
    SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
    SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END) AS net
FROM transactions
GROUP BY TO_CHAR(date, 'YYYY-MM')
ORDER BY month DESC;

CREATE OR REPLACE VIEW v_attendance_last30 AS
SELECT
    s.id AS student_id, s.name,
    COUNT(*) FILTER (WHERE ar.status = 'present') AS present,
    COUNT(*) FILTER (WHERE ar.status = 'absent')  AS absent,
    COUNT(*) FILTER (WHERE ar.status = 'late')    AS late,
    COUNT(*)                                       AS total
FROM students s
LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.date >= CURRENT_DATE - 30
WHERE s.status = 'active'
GROUP BY s.id, s.name
ORDER BY s.name;

CREATE OR REPLACE VIEW v_homework_completion AS
SELECT
    ha.id AS homework_id, ha.title, ha.due_date,
    COUNT(hs.id)                                AS total_submissions,
    COUNT(*) FILTER (WHERE hs.completed = TRUE) AS completed,
    ROUND(AVG(hs.accuracy), 1)                  AS avg_accuracy,
    ROUND(AVG(hs.time_spent) / 60.0, 1)        AS avg_minutes
FROM homework_assignments ha
LEFT JOIN homework_stats hs ON hs.homework_id = ha.id
GROUP BY ha.id
ORDER BY ha.due_date DESC;


COMMIT;
