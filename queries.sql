-- ============================================================================
-- NetChess Academy — CRUD Fonksiyonları
-- PostgreSQL 15+
-- Doğrudan çalıştırılabilir: psql -f queries.sql
-- Kullanım: SELECT * FROM fn_student_create('Ali Veli', ...);
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
--  USERS (Kullanıcılar)
-- ════════════════════════════════════════════════════════════════════════════

-- Yeni kullanıcı ekle
CREATE OR REPLACE FUNCTION fn_user_create(
    p_email         VARCHAR,
    p_password_hash VARCHAR,
    p_full_name     VARCHAR,
    p_role          user_role DEFAULT 'COACH',
    p_phone         VARCHAR DEFAULT NULL
) RETURNS SETOF users AS $$
    INSERT INTO users (email, password_hash, full_name, role, phone)
    VALUES (p_email, p_password_hash, p_full_name, p_role, p_phone)
    RETURNING *;
$$ LANGUAGE sql;

-- Tüm aktif kullanıcıları listele
CREATE OR REPLACE FUNCTION fn_user_list()
RETURNS SETOF users AS $$
    SELECT * FROM users WHERE is_active = TRUE ORDER BY full_name;
$$ LANGUAGE sql;

-- Tek kullanıcı getir
CREATE OR REPLACE FUNCTION fn_user_get(p_id UUID)
RETURNS SETOF users AS $$
    SELECT * FROM users WHERE id = p_id;
$$ LANGUAGE sql;

-- Email ile kullanıcı bul (login)
CREATE OR REPLACE FUNCTION fn_user_find_by_email(p_email VARCHAR)
RETURNS SETOF users AS $$
    SELECT * FROM users WHERE email = p_email AND is_active = TRUE;
$$ LANGUAGE sql;

-- Kullanıcı güncelle
CREATE OR REPLACE FUNCTION fn_user_update(
    p_id        UUID,
    p_full_name VARCHAR DEFAULT NULL,
    p_email     VARCHAR DEFAULT NULL,
    p_phone     VARCHAR DEFAULT NULL,
    p_role      user_role DEFAULT NULL
) RETURNS SETOF users AS $$
    UPDATE users
    SET full_name = COALESCE(p_full_name, full_name),
        email     = COALESCE(p_email, email),
        phone     = COALESCE(p_phone, phone),
        role      = COALESCE(p_role, role)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- Şifre güncelle
CREATE OR REPLACE FUNCTION fn_user_update_password(p_id UUID, p_hash VARCHAR)
RETURNS VOID AS $$
    UPDATE users SET password_hash = p_hash WHERE id = p_id;
$$ LANGUAGE sql;

-- Kullanıcı pasife al
CREATE OR REPLACE FUNCTION fn_user_deactivate(p_id UUID)
RETURNS VOID AS $$
    UPDATE users SET is_active = FALSE WHERE id = p_id;
$$ LANGUAGE sql;

-- Kullanıcı kalıcı sil
CREATE OR REPLACE FUNCTION fn_user_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM users WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  BRANCHES (Şubeler)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_branch_create(
    p_name    VARCHAR,
    p_address TEXT DEFAULT NULL,
    p_phone   VARCHAR DEFAULT NULL
) RETURNS SETOF branches AS $$
    INSERT INTO branches (name, address, phone)
    VALUES (p_name, p_address, p_phone)
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_branch_list()
RETURNS SETOF branches AS $$
    SELECT * FROM branches WHERE is_active = TRUE ORDER BY name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_branch_get(p_id UUID)
RETURNS SETOF branches AS $$
    SELECT * FROM branches WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_branch_update(
    p_id      UUID,
    p_name    VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_phone   VARCHAR DEFAULT NULL
) RETURNS SETOF branches AS $$
    UPDATE branches
    SET name    = COALESCE(p_name, name),
        address = COALESCE(p_address, address),
        phone   = COALESCE(p_phone, phone)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_branch_deactivate(p_id UUID)
RETURNS VOID AS $$
    UPDATE branches SET is_active = FALSE WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_branch_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM branches WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  GROUPS (Gruplar)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_group_create(
    p_name      VARCHAR,
    p_branch_id UUID DEFAULT NULL,
    p_coach_id  UUID DEFAULT NULL,
    p_capacity  INT DEFAULT 20
) RETURNS SETOF groups AS $$
    INSERT INTO groups (name, branch_id, coach_id, capacity)
    VALUES (p_name, p_branch_id, p_coach_id, p_capacity)
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_group_list(p_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
    id         UUID,
    name       VARCHAR,
    branch_id  UUID,
    coach_id   UUID,
    capacity   INT,
    is_active  BOOLEAN,
    created_at TIMESTAMPTZ,
    branch_name VARCHAR,
    coach_name  VARCHAR
) AS $$
    SELECT g.id, g.name, g.branch_id, g.coach_id, g.capacity, g.is_active, g.created_at,
           b.name, u.full_name
    FROM groups g
    LEFT JOIN branches b ON g.branch_id = b.id
    LEFT JOIN users u    ON g.coach_id  = u.id
    WHERE g.is_active = TRUE
      AND (p_branch_id IS NULL OR g.branch_id = p_branch_id)
    ORDER BY g.name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_group_get(p_id UUID)
RETURNS TABLE (
    id UUID, name VARCHAR, branch_id UUID, coach_id UUID,
    capacity INT, is_active BOOLEAN, created_at TIMESTAMPTZ,
    branch_name VARCHAR, coach_name VARCHAR, student_count BIGINT
) AS $$
    SELECT g.id, g.name, g.branch_id, g.coach_id, g.capacity, g.is_active, g.created_at,
           b.name, u.full_name,
           COUNT(s.id)
    FROM groups g
    LEFT JOIN branches b ON g.branch_id = b.id
    LEFT JOIN users u    ON g.coach_id  = u.id
    LEFT JOIN students s ON s.group_id  = g.id AND s.status = 'active'
    WHERE g.id = p_id
    GROUP BY g.id, b.name, u.full_name;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_group_update(
    p_id        UUID,
    p_name      VARCHAR DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_coach_id  UUID DEFAULT NULL,
    p_capacity  INT DEFAULT NULL
) RETURNS SETOF groups AS $$
    UPDATE groups
    SET name      = COALESCE(p_name, name),
        branch_id = COALESCE(p_branch_id, branch_id),
        coach_id  = COALESCE(p_coach_id, coach_id),
        capacity  = COALESCE(p_capacity, capacity)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_group_deactivate(p_id UUID)
RETURNS VOID AS $$
    UPDATE groups SET is_active = FALSE WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_group_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM groups WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  STUDENTS (Öğrenciler)
-- ════════════════════════════════════════════════════════════════════════════

-- Yeni öğrenci ekle
CREATE OR REPLACE FUNCTION fn_student_create(
    p_name                VARCHAR,
    p_tc_no               VARCHAR        DEFAULT NULL,
    p_level               student_level  DEFAULT 'Başlangıç',
    p_elo                 INT            DEFAULT 0,
    p_ukd                 INT            DEFAULT 0,
    p_payment_status      payment_status DEFAULT 'Unpaid',
    p_registration_type   registration_type DEFAULT 'monthly',
    p_branch_id           UUID           DEFAULT NULL,
    p_group_id            UUID           DEFAULT NULL,
    p_branch              VARCHAR        DEFAULT NULL,
    p_branch_group        VARCHAR        DEFAULT NULL,
    p_branch_office       VARCHAR        DEFAULT NULL,
    p_birth_date          DATE           DEFAULT NULL,
    p_registration_date   DATE           DEFAULT CURRENT_DATE,
    p_photo_url           TEXT           DEFAULT NULL,
    p_school              VARCHAR        DEFAULT NULL,
    p_teacher             VARCHAR        DEFAULT NULL,
    p_address             TEXT           DEFAULT NULL,
    p_notes               TEXT           DEFAULT NULL,
    p_health_info         TEXT           DEFAULT NULL,
    p_lichess_username    VARCHAR        DEFAULT NULL,
    p_chesscom_username   VARCHAR        DEFAULT NULL,
    p_monthly_fee         NUMERIC        DEFAULT 0,
    p_payment_reminder    VARCHAR        DEFAULT NULL,
    p_late_reminder       VARCHAR        DEFAULT NULL,
    p_sibling_discount    BOOLEAN        DEFAULT FALSE,
    p_scholarship         BOOLEAN        DEFAULT FALSE,
    p_father_name         VARCHAR        DEFAULT NULL,
    p_father_phone        VARCHAR        DEFAULT NULL,
    p_father_job          VARCHAR        DEFAULT NULL,
    p_mother_name         VARCHAR        DEFAULT NULL,
    p_mother_phone        VARCHAR        DEFAULT NULL,
    p_mother_job          VARCHAR        DEFAULT NULL,
    p_parent_name         VARCHAR        DEFAULT NULL,
    p_parent_phone        VARCHAR        DEFAULT NULL,
    p_parent_job          VARCHAR        DEFAULT NULL
) RETURNS SETOF students AS $$
    INSERT INTO students (
        name, tc_no, level, elo, ukd, payment_status,
        registration_type, status,
        branch_id, group_id, branch, branch_group, branch_office,
        birth_date, registration_date, photo_url,
        school, teacher, address, notes, health_info,
        lichess_username, chesscom_username,
        monthly_fee, payment_reminder_day, late_payment_reminder_day,
        has_sibling_discount, is_scholarship_student,
        father_name, father_phone, father_job,
        mother_name, mother_phone, mother_job,
        parent_name, parent_phone, parent_job
    ) VALUES (
        p_name, p_tc_no, p_level, p_elo, p_ukd, p_payment_status,
        p_registration_type, 'active',
        p_branch_id, p_group_id, p_branch, p_branch_group, p_branch_office,
        p_birth_date, p_registration_date, p_photo_url,
        p_school, p_teacher, p_address, p_notes, p_health_info,
        p_lichess_username, p_chesscom_username,
        p_monthly_fee, p_payment_reminder, p_late_reminder,
        p_sibling_discount, p_scholarship,
        p_father_name, p_father_phone, p_father_job,
        p_mother_name, p_mother_phone, p_mother_job,
        p_parent_name, p_parent_phone, p_parent_job
    )
    RETURNING *;
$$ LANGUAGE sql;

-- Öğrenci listesi (filtreli, sayfalı)
CREATE OR REPLACE FUNCTION fn_student_list(
    p_search   TEXT           DEFAULT NULL,
    p_level    student_level  DEFAULT NULL,
    p_payment  payment_status DEFAULT NULL,
    p_group_id UUID           DEFAULT NULL,
    p_branch_id UUID          DEFAULT NULL,
    p_limit    INT            DEFAULT 50,
    p_offset   INT            DEFAULT 0
) RETURNS TABLE (
    id               UUID,
    name             VARCHAR,
    tc_no            VARCHAR,
    level            student_level,
    elo              INT,
    ukd              INT,
    payment_status   payment_status,
    status           student_status,
    group_id         UUID,
    branch_id        UUID,
    last_attendance  DATE,
    monthly_fee      NUMERIC,
    parent_phone     VARCHAR,
    registration_date DATE,
    group_name       VARCHAR,
    branch_name      VARCHAR
) AS $$
    SELECT s.id, s.name, s.tc_no, s.level, s.elo, s.ukd,
           s.payment_status, s.status,
           s.group_id, s.branch_id, s.last_attendance,
           s.monthly_fee, s.parent_phone, s.registration_date,
           g.name, b.name
    FROM students s
    LEFT JOIN groups   g ON s.group_id  = g.id
    LEFT JOIN branches b ON s.branch_id = b.id
    WHERE s.status = 'active'
      AND (p_search IS NULL OR s.name ILIKE '%' || p_search || '%')
      AND (p_level IS NULL OR s.level = p_level)
      AND (p_payment IS NULL OR s.payment_status = p_payment)
      AND (p_group_id IS NULL OR s.group_id = p_group_id)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    ORDER BY s.name
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

-- Öğrenci sayısı
CREATE OR REPLACE FUNCTION fn_student_count(
    p_search   TEXT           DEFAULT NULL,
    p_level    student_level  DEFAULT NULL,
    p_payment  payment_status DEFAULT NULL,
    p_group_id UUID           DEFAULT NULL,
    p_branch_id UUID          DEFAULT NULL
) RETURNS BIGINT AS $$
    SELECT COUNT(*)
    FROM students s
    WHERE s.status = 'active'
      AND (p_search IS NULL OR s.name ILIKE '%' || p_search || '%')
      AND (p_level IS NULL OR s.level = p_level)
      AND (p_payment IS NULL OR s.payment_status = p_payment)
      AND (p_group_id IS NULL OR s.group_id = p_group_id)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);
$$ LANGUAGE sql;

-- Tek öğrenci detay
CREATE OR REPLACE FUNCTION fn_student_get(p_id UUID)
RETURNS TABLE (
    student    students,
    group_name VARCHAR,
    branch_name VARCHAR,
    contacts   JSON
) AS $$
    SELECT s,
           g.name,
           b.name,
           COALESCE(
               (SELECT json_agg(json_build_object('id', sc.id, 'phone', sc.phone, 'label', sc.label))
                FROM student_contacts sc WHERE sc.student_id = s.id),
               '[]'::JSON
           )
    FROM students s
    LEFT JOIN groups   g ON s.group_id  = g.id
    LEFT JOIN branches b ON s.branch_id = b.id
    WHERE s.id = p_id;
$$ LANGUAGE sql;

-- Öğrenci güncelle
CREATE OR REPLACE FUNCTION fn_student_update(
    p_id                  UUID,
    p_name                VARCHAR        DEFAULT NULL,
    p_tc_no               VARCHAR        DEFAULT NULL,
    p_level               student_level  DEFAULT NULL,
    p_elo                 INT            DEFAULT NULL,
    p_ukd                 INT            DEFAULT NULL,
    p_payment_status      payment_status DEFAULT NULL,
    p_registration_type   registration_type DEFAULT NULL,
    p_status              student_status DEFAULT NULL,
    p_branch_id           UUID           DEFAULT NULL,
    p_group_id            UUID           DEFAULT NULL,
    p_branch              VARCHAR        DEFAULT NULL,
    p_branch_group        VARCHAR        DEFAULT NULL,
    p_branch_office       VARCHAR        DEFAULT NULL,
    p_birth_date          DATE           DEFAULT NULL,
    p_photo_url           TEXT           DEFAULT NULL,
    p_school              VARCHAR        DEFAULT NULL,
    p_teacher             VARCHAR        DEFAULT NULL,
    p_address             TEXT           DEFAULT NULL,
    p_notes               TEXT           DEFAULT NULL,
    p_health_info         TEXT           DEFAULT NULL,
    p_lichess_username    VARCHAR        DEFAULT NULL,
    p_chesscom_username   VARCHAR        DEFAULT NULL,
    p_monthly_fee         NUMERIC        DEFAULT NULL,
    p_payment_reminder    VARCHAR        DEFAULT NULL,
    p_late_reminder       VARCHAR        DEFAULT NULL,
    p_sibling_discount    BOOLEAN        DEFAULT NULL,
    p_scholarship         BOOLEAN        DEFAULT NULL,
    p_father_name         VARCHAR        DEFAULT NULL,
    p_father_phone        VARCHAR        DEFAULT NULL,
    p_father_job          VARCHAR        DEFAULT NULL,
    p_mother_name         VARCHAR        DEFAULT NULL,
    p_mother_phone        VARCHAR        DEFAULT NULL,
    p_mother_job          VARCHAR        DEFAULT NULL,
    p_parent_name         VARCHAR        DEFAULT NULL,
    p_parent_phone        VARCHAR        DEFAULT NULL,
    p_parent_job          VARCHAR        DEFAULT NULL
) RETURNS SETOF students AS $$
    UPDATE students SET
        name                    = COALESCE(p_name, name),
        tc_no                   = COALESCE(p_tc_no, tc_no),
        level                   = COALESCE(p_level, level),
        elo                     = COALESCE(p_elo, elo),
        ukd                     = COALESCE(p_ukd, ukd),
        payment_status          = COALESCE(p_payment_status, payment_status),
        registration_type       = COALESCE(p_registration_type, registration_type),
        status                  = COALESCE(p_status, status),
        branch_id               = COALESCE(p_branch_id, branch_id),
        group_id                = COALESCE(p_group_id, group_id),
        branch                  = COALESCE(p_branch, branch),
        branch_group            = COALESCE(p_branch_group, branch_group),
        branch_office           = COALESCE(p_branch_office, branch_office),
        birth_date              = COALESCE(p_birth_date, birth_date),
        photo_url               = COALESCE(p_photo_url, photo_url),
        school                  = COALESCE(p_school, school),
        teacher                 = COALESCE(p_teacher, teacher),
        address                 = COALESCE(p_address, address),
        notes                   = COALESCE(p_notes, notes),
        health_info             = COALESCE(p_health_info, health_info),
        lichess_username        = COALESCE(p_lichess_username, lichess_username),
        chesscom_username       = COALESCE(p_chesscom_username, chesscom_username),
        monthly_fee             = COALESCE(p_monthly_fee, monthly_fee),
        payment_reminder_day    = COALESCE(p_payment_reminder, payment_reminder_day),
        late_payment_reminder_day = COALESCE(p_late_reminder, late_payment_reminder_day),
        has_sibling_discount    = COALESCE(p_sibling_discount, has_sibling_discount),
        is_scholarship_student  = COALESCE(p_scholarship, is_scholarship_student),
        father_name             = COALESCE(p_father_name, father_name),
        father_phone            = COALESCE(p_father_phone, father_phone),
        father_job              = COALESCE(p_father_job, father_job),
        mother_name             = COALESCE(p_mother_name, mother_name),
        mother_phone            = COALESCE(p_mother_phone, mother_phone),
        mother_job              = COALESCE(p_mother_job, mother_job),
        parent_name             = COALESCE(p_parent_name, parent_name),
        parent_phone            = COALESCE(p_parent_phone, parent_phone),
        parent_job              = COALESCE(p_parent_job, parent_job)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- ELO güncelle
CREATE OR REPLACE FUNCTION fn_student_update_elo(p_id UUID, p_elo INT, p_ukd INT DEFAULT NULL)
RETURNS VOID AS $$
    UPDATE students SET elo = p_elo, ukd = COALESCE(p_ukd, ukd) WHERE id = p_id;
$$ LANGUAGE sql;

-- Ödeme durumu güncelle
CREATE OR REPLACE FUNCTION fn_student_update_payment(p_id UUID, p_status payment_status)
RETURNS VOID AS $$
    UPDATE students SET payment_status = p_status WHERE id = p_id;
$$ LANGUAGE sql;

-- Son yoklama tarihini güncelle
CREATE OR REPLACE FUNCTION fn_student_update_attendance(p_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
    UPDATE students SET last_attendance = p_date WHERE id = p_id;
$$ LANGUAGE sql;

-- Toplu grup değiştir
CREATE OR REPLACE FUNCTION fn_student_bulk_group(p_ids UUID[], p_group_id UUID)
RETURNS VOID AS $$
    UPDATE students SET group_id = p_group_id WHERE id = ANY(p_ids);
$$ LANGUAGE sql;

-- Toplu şube değiştir
CREATE OR REPLACE FUNCTION fn_student_bulk_branch(p_ids UUID[], p_branch_id UUID)
RETURNS VOID AS $$
    UPDATE students SET branch_id = p_branch_id WHERE id = ANY(p_ids);
$$ LANGUAGE sql;

-- Öğrenci pasife al (soft delete)
CREATE OR REPLACE FUNCTION fn_student_deactivate(p_id UUID)
RETURNS VOID AS $$
    UPDATE students SET status = 'inactive' WHERE id = p_id;
$$ LANGUAGE sql;

-- Toplu pasife al
CREATE OR REPLACE FUNCTION fn_student_bulk_deactivate(p_ids UUID[])
RETURNS VOID AS $$
    UPDATE students SET status = 'inactive' WHERE id = ANY(p_ids);
$$ LANGUAGE sql;

-- Kalıcı sil
CREATE OR REPLACE FUNCTION fn_student_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM students WHERE id = p_id;
$$ LANGUAGE sql;

-- Toplu kalıcı sil
CREATE OR REPLACE FUNCTION fn_student_bulk_delete(p_ids UUID[])
RETURNS VOID AS $$
    DELETE FROM students WHERE id = ANY(p_ids);
$$ LANGUAGE sql;

-- Seviye dağılımı
CREATE OR REPLACE FUNCTION fn_student_level_stats()
RETURNS TABLE (level student_level, count BIGINT) AS $$
    SELECT level, COUNT(*) FROM students WHERE status = 'active' GROUP BY level;
$$ LANGUAGE sql;

-- Ödeme durumu dağılımı
CREATE OR REPLACE FUNCTION fn_student_payment_stats()
RETURNS TABLE (payment_status payment_status, count BIGINT) AS $$
    SELECT payment_status, COUNT(*) FROM students WHERE status = 'active' GROUP BY payment_status;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  STUDENT CONTACTS (İletişim Numaraları)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_contact_create(p_student_id UUID, p_phone VARCHAR, p_label VARCHAR DEFAULT 'WhatsApp')
RETURNS SETOF student_contacts AS $$
    INSERT INTO student_contacts (student_id, phone, label)
    VALUES (p_student_id, p_phone, p_label)
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_contact_list(p_student_id UUID)
RETURNS SETOF student_contacts AS $$
    SELECT * FROM student_contacts WHERE student_id = p_student_id ORDER BY created_at;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_contact_update(p_id UUID, p_phone VARCHAR, p_label VARCHAR DEFAULT NULL)
RETURNS SETOF student_contacts AS $$
    UPDATE student_contacts SET phone = p_phone, label = COALESCE(p_label, label) WHERE id = p_id RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_contact_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM student_contacts WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_contact_delete_all(p_student_id UUID)
RETURNS VOID AS $$
    DELETE FROM student_contacts WHERE student_id = p_student_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  TRANSACTIONS (Kasa / Finans)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_transaction_create(
    p_type           transaction_type,
    p_category       VARCHAR,
    p_amount         NUMERIC,
    p_payment_method payment_method DEFAULT 'Nakit',
    p_description    TEXT DEFAULT NULL,
    p_date           DATE DEFAULT CURRENT_DATE,
    p_branch_id      UUID DEFAULT NULL,
    p_processed_by   UUID DEFAULT NULL
) RETURNS SETOF transactions AS $$
    INSERT INTO transactions (date, type, category, description, payment_method, amount, branch_id, processed_by)
    VALUES (p_date, p_type, p_category, p_description, p_payment_method, p_amount, p_branch_id, p_processed_by)
    RETURNING *;
$$ LANGUAGE sql;

-- İşlemleri listele
CREATE OR REPLACE FUNCTION fn_transaction_list(
    p_date_from  DATE             DEFAULT NULL,
    p_date_to    DATE             DEFAULT NULL,
    p_type       transaction_type DEFAULT NULL,
    p_category   VARCHAR          DEFAULT NULL,
    p_branch_id  UUID             DEFAULT NULL,
    p_limit      INT              DEFAULT 50,
    p_offset     INT              DEFAULT 0
) RETURNS TABLE (
    id             UUID,
    date           DATE,
    type           transaction_type,
    category       VARCHAR,
    description    TEXT,
    payment_method payment_method,
    amount         NUMERIC,
    branch_id      UUID,
    processed_by   UUID,
    created_at     TIMESTAMPTZ,
    branch_name    VARCHAR,
    processed_by_name VARCHAR
) AS $$
    SELECT t.id, t.date, t.type, t.category, t.description, t.payment_method,
           t.amount, t.branch_id, t.processed_by, t.created_at,
           b.name, u.full_name
    FROM transactions t
    LEFT JOIN branches b ON t.branch_id = b.id
    LEFT JOIN users u    ON t.processed_by = u.id
    WHERE (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to IS NULL OR t.date <= p_date_to)
      AND (p_type IS NULL OR t.type = p_type)
      AND (p_category IS NULL OR t.category = p_category)
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

-- Tek işlem
CREATE OR REPLACE FUNCTION fn_transaction_get(p_id UUID)
RETURNS SETOF transactions AS $$
    SELECT * FROM transactions WHERE id = p_id;
$$ LANGUAGE sql;

-- Aylık gelir/gider özeti
CREATE OR REPLACE FUNCTION fn_transaction_monthly_summary(p_date_from DATE, p_date_to DATE)
RETURNS TABLE (month TEXT, total_income NUMERIC, total_expense NUMERIC, balance NUMERIC) AS $$
    SELECT
        TO_CHAR(date, 'YYYY-MM'),
        SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END)
    FROM transactions
    WHERE date >= p_date_from AND date <= p_date_to
    GROUP BY TO_CHAR(date, 'YYYY-MM')
    ORDER BY 1;
$$ LANGUAGE sql;

-- Toplam kasa durumu
CREATE OR REPLACE FUNCTION fn_transaction_totals()
RETURNS TABLE (total_income NUMERIC, total_expense NUMERIC, balance NUMERIC) AS $$
    SELECT
        SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'income'  THEN amount ELSE -amount END)
    FROM transactions;
$$ LANGUAGE sql;

-- İşlem güncelle
CREATE OR REPLACE FUNCTION fn_transaction_update(
    p_id             UUID,
    p_date           DATE             DEFAULT NULL,
    p_type           transaction_type DEFAULT NULL,
    p_category       VARCHAR          DEFAULT NULL,
    p_description    TEXT             DEFAULT NULL,
    p_payment_method payment_method   DEFAULT NULL,
    p_amount         NUMERIC          DEFAULT NULL
) RETURNS SETOF transactions AS $$
    UPDATE transactions SET
        date           = COALESCE(p_date, date),
        type           = COALESCE(p_type, type),
        category       = COALESCE(p_category, category),
        description    = COALESCE(p_description, description),
        payment_method = COALESCE(p_payment_method, payment_method),
        amount         = COALESCE(p_amount, amount)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- İşlem sil
CREATE OR REPLACE FUNCTION fn_transaction_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM transactions WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  PAYMENTS (Öğrenci Ödemeleri)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_payment_create(
    p_student_id UUID,
    p_amount     NUMERIC,
    p_type       payment_type_en DEFAULT 'Cash',
    p_month      VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_date       DATE DEFAULT CURRENT_DATE
) RETURNS SETOF payments AS $$
    INSERT INTO payments (student_id, amount, date, type, description, month)
    VALUES (p_student_id, p_amount, p_date, p_type, p_description, p_month)
    RETURNING *;
$$ LANGUAGE sql;

-- Öğrencinin ödemeleri
CREATE OR REPLACE FUNCTION fn_payment_list_by_student(p_student_id UUID)
RETURNS SETOF payments AS $$
    SELECT * FROM payments WHERE student_id = p_student_id ORDER BY date DESC;
$$ LANGUAGE sql;

-- Aya göre ödemeler
CREATE OR REPLACE FUNCTION fn_payment_list_by_month(p_month VARCHAR)
RETURNS TABLE (
    id UUID, student_id UUID, amount NUMERIC, date DATE,
    type payment_type_en, description TEXT, month VARCHAR,
    created_at TIMESTAMPTZ, student_name VARCHAR
) AS $$
    SELECT p.id, p.student_id, p.amount, p.date, p.type, p.description, p.month, p.created_at,
           s.name
    FROM payments p
    JOIN students s ON p.student_id = s.id
    WHERE p.month = p_month
    ORDER BY p.date DESC;
$$ LANGUAGE sql;

-- Ödenmemiş öğrenciler (belirli ay)
CREATE OR REPLACE FUNCTION fn_payment_unpaid_students(p_month VARCHAR)
RETURNS TABLE (
    student_id UUID, student_name VARCHAR, monthly_fee NUMERIC,
    payment_status payment_status, parent_phone VARCHAR, paid_amount NUMERIC
) AS $$
    SELECT s.id, s.name, s.monthly_fee, s.payment_status,
           s.parent_phone,
           COALESCE(SUM(p.amount), 0)
    FROM students s
    LEFT JOIN payments p ON p.student_id = s.id AND p.month = p_month
    WHERE s.status = 'active' AND s.payment_status != 'Paid'
    GROUP BY s.id
    HAVING COALESCE(SUM(p.amount), 0) < COALESCE(s.monthly_fee, 0)
    ORDER BY s.name;
$$ LANGUAGE sql;

-- Ödeme güncelle
CREATE OR REPLACE FUNCTION fn_payment_update(
    p_id          UUID,
    p_amount      NUMERIC         DEFAULT NULL,
    p_date        DATE            DEFAULT NULL,
    p_type        payment_type_en DEFAULT NULL,
    p_description TEXT            DEFAULT NULL,
    p_month       VARCHAR         DEFAULT NULL
) RETURNS SETOF payments AS $$
    UPDATE payments SET
        amount      = COALESCE(p_amount, amount),
        date        = COALESCE(p_date, date),
        type        = COALESCE(p_type, type),
        description = COALESCE(p_description, description),
        month       = COALESCE(p_month, month)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- Ödeme sil
CREATE OR REPLACE FUNCTION fn_payment_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM payments WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  LESSONS (Ders Programı)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_lesson_create(
    p_day        day_of_week,
    p_start_time TIME,
    p_end_time   TIME,
    p_topic      VARCHAR,
    p_group_id   UUID DEFAULT NULL,
    p_group_name VARCHAR DEFAULT NULL,
    p_branch_id  UUID DEFAULT NULL,
    p_coach_id   UUID DEFAULT NULL
) RETURNS SETOF lessons AS $$
    INSERT INTO lessons (day, start_time, end_time, group_id, group_name, topic, branch_id, coach_id)
    VALUES (p_day, p_start_time, p_end_time, p_group_id, p_group_name, p_topic, p_branch_id, p_coach_id)
    RETURNING *;
$$ LANGUAGE sql;

-- Tüm dersler
CREATE OR REPLACE FUNCTION fn_lesson_list()
RETURNS TABLE (
    id UUID, day day_of_week, start_time TIME, end_time TIME,
    group_id UUID, group_name VARCHAR, topic VARCHAR,
    branch_id UUID, coach_id UUID, created_at TIMESTAMPTZ,
    branch_name VARCHAR, coach_name VARCHAR
) AS $$
    SELECT l.id, l.day, l.start_time, l.end_time, l.group_id, l.group_name,
           l.topic, l.branch_id, l.coach_id, l.created_at,
           b.name, u.full_name
    FROM lessons l
    LEFT JOIN branches b ON l.branch_id = b.id
    LEFT JOIN users u    ON l.coach_id  = u.id
    ORDER BY
        CASE l.day
            WHEN 'Pazartesi' THEN 1 WHEN 'Salı' THEN 2 WHEN 'Çarşamba' THEN 3
            WHEN 'Perşembe' THEN 4 WHEN 'Cuma' THEN 5 WHEN 'Cumartesi' THEN 6 WHEN 'Pazar' THEN 7
        END, l.start_time;
$$ LANGUAGE sql;

-- Güne göre dersler
CREATE OR REPLACE FUNCTION fn_lesson_list_by_day(p_day day_of_week)
RETURNS TABLE (
    id UUID, day day_of_week, start_time TIME, end_time TIME,
    group_id UUID, group_name VARCHAR, topic VARCHAR,
    branch_id UUID, coach_id UUID, created_at TIMESTAMPTZ,
    coach_name VARCHAR
) AS $$
    SELECT l.id, l.day, l.start_time, l.end_time, l.group_id, l.group_name,
           l.topic, l.branch_id, l.coach_id, l.created_at,
           u.full_name
    FROM lessons l
    LEFT JOIN users u ON l.coach_id = u.id
    WHERE l.day = p_day
    ORDER BY l.start_time;
$$ LANGUAGE sql;

-- Tek ders
CREATE OR REPLACE FUNCTION fn_lesson_get(p_id UUID)
RETURNS SETOF lessons AS $$
    SELECT * FROM lessons WHERE id = p_id;
$$ LANGUAGE sql;

-- Ders güncelle
CREATE OR REPLACE FUNCTION fn_lesson_update(
    p_id         UUID,
    p_day        day_of_week DEFAULT NULL,
    p_start_time TIME DEFAULT NULL,
    p_end_time   TIME DEFAULT NULL,
    p_topic      VARCHAR DEFAULT NULL,
    p_group_id   UUID DEFAULT NULL,
    p_group_name VARCHAR DEFAULT NULL,
    p_branch_id  UUID DEFAULT NULL,
    p_coach_id   UUID DEFAULT NULL
) RETURNS SETOF lessons AS $$
    UPDATE lessons SET
        day        = COALESCE(p_day, day),
        start_time = COALESCE(p_start_time, start_time),
        end_time   = COALESCE(p_end_time, end_time),
        topic      = COALESCE(p_topic, topic),
        group_id   = COALESCE(p_group_id, group_id),
        group_name = COALESCE(p_group_name, group_name),
        branch_id  = COALESCE(p_branch_id, branch_id),
        coach_id   = COALESCE(p_coach_id, coach_id)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- Ders sil
CREATE OR REPLACE FUNCTION fn_lesson_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM lessons WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  ATTENDANCE (Yoklama)
-- ════════════════════════════════════════════════════════════════════════════

-- Yoklama kaydet (upsert)
CREATE OR REPLACE FUNCTION fn_attendance_upsert(
    p_student_id UUID,
    p_status     attendance_status,
    p_lesson_id  UUID DEFAULT NULL,
    p_date       DATE DEFAULT CURRENT_DATE,
    p_notified   BOOLEAN DEFAULT FALSE
) RETURNS SETOF attendance_records AS $$
    INSERT INTO attendance_records (date, student_id, lesson_id, status, notified_parent)
    VALUES (p_date, p_student_id, p_lesson_id, p_status, p_notified)
    ON CONFLICT (date, student_id, lesson_id)
    DO UPDATE SET status = EXCLUDED.status, notified_parent = EXCLUDED.notified_parent
    RETURNING *;
$$ LANGUAGE sql;

-- Tarih ve ders için yoklama listesi
CREATE OR REPLACE FUNCTION fn_attendance_list(p_date DATE, p_lesson_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID, date DATE, student_id UUID, lesson_id UUID,
    status attendance_status, notified_parent BOOLEAN,
    created_at TIMESTAMPTZ, student_name VARCHAR, photo_url TEXT
) AS $$
    SELECT ar.id, ar.date, ar.student_id, ar.lesson_id, ar.status,
           ar.notified_parent, ar.created_at, s.name, s.photo_url
    FROM attendance_records ar
    JOIN students s ON ar.student_id = s.id
    WHERE ar.date = p_date
      AND (p_lesson_id IS NULL OR ar.lesson_id = p_lesson_id)
    ORDER BY s.name;
$$ LANGUAGE sql;

-- Öğrencinin yoklama geçmişi
CREATE OR REPLACE FUNCTION fn_attendance_student_history(
    p_student_id UUID,
    p_limit      INT DEFAULT 30,
    p_offset     INT DEFAULT 0
) RETURNS TABLE (
    id UUID, date DATE, lesson_id UUID, status attendance_status,
    notified_parent BOOLEAN, lesson_topic VARCHAR, group_name VARCHAR
) AS $$
    SELECT ar.id, ar.date, ar.lesson_id, ar.status, ar.notified_parent,
           l.topic, l.group_name
    FROM attendance_records ar
    LEFT JOIN lessons l ON ar.lesson_id = l.id
    WHERE ar.student_id = p_student_id
    ORDER BY ar.date DESC
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

-- Öğrenci yoklama özeti (son N gün)
CREATE OR REPLACE FUNCTION fn_attendance_student_summary(p_student_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (present_count BIGINT, absent_count BIGINT, late_count BIGINT, total BIGINT) AS $$
    SELECT
        COUNT(*) FILTER (WHERE status = 'present'),
        COUNT(*) FILTER (WHERE status = 'absent'),
        COUNT(*) FILTER (WHERE status = 'late'),
        COUNT(*)
    FROM attendance_records
    WHERE student_id = p_student_id
      AND date >= CURRENT_DATE - p_days;
$$ LANGUAGE sql;

-- Devamsızlık raporu (tarih aralığı)
CREATE OR REPLACE FUNCTION fn_attendance_absence_report(p_from DATE, p_to DATE)
RETURNS TABLE (student_id UUID, student_name VARCHAR, parent_phone VARCHAR, absent_days BIGINT) AS $$
    SELECT s.id, s.name, s.parent_phone,
           COUNT(*) FILTER (WHERE ar.status = 'absent')
    FROM students s
    JOIN attendance_records ar ON ar.student_id = s.id
    WHERE ar.date BETWEEN p_from AND p_to AND s.status = 'active'
    GROUP BY s.id
    HAVING COUNT(*) FILTER (WHERE ar.status = 'absent') > 0
    ORDER BY 4 DESC;
$$ LANGUAGE sql;

-- Yoklama sil
CREATE OR REPLACE FUNCTION fn_attendance_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM attendance_records WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  PUZZLES (Bulmacalar)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_puzzle_create(
    p_title      VARCHAR,
    p_fen        TEXT,
    p_solution   TEXT[],
    p_difficulty puzzle_difficulty DEFAULT 'Kolay',
    p_points     INT DEFAULT 10,
    p_category   VARCHAR DEFAULT 'Genel',
    p_theme      VARCHAR DEFAULT NULL,
    p_hint       TEXT DEFAULT NULL
) RETURNS SETOF puzzles AS $$
    INSERT INTO puzzles (title, fen, solution, difficulty, points, category, theme, hint)
    VALUES (p_title, p_fen, p_solution, p_difficulty, p_points, p_category, p_theme, p_hint)
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_puzzle_list(
    p_difficulty puzzle_difficulty DEFAULT NULL,
    p_category   VARCHAR DEFAULT NULL,
    p_limit      INT DEFAULT 50,
    p_offset     INT DEFAULT 0
) RETURNS SETOF puzzles AS $$
    SELECT * FROM puzzles
    WHERE (p_difficulty IS NULL OR difficulty = p_difficulty)
      AND (p_category IS NULL OR category = p_category)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_puzzle_get(p_id UUID)
RETURNS SETOF puzzles AS $$
    SELECT * FROM puzzles WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_puzzle_update(
    p_id         UUID,
    p_title      VARCHAR          DEFAULT NULL,
    p_fen        TEXT             DEFAULT NULL,
    p_solution   TEXT[]           DEFAULT NULL,
    p_difficulty puzzle_difficulty DEFAULT NULL,
    p_points     INT              DEFAULT NULL,
    p_category   VARCHAR          DEFAULT NULL,
    p_theme      VARCHAR          DEFAULT NULL,
    p_hint       TEXT             DEFAULT NULL
) RETURNS SETOF puzzles AS $$
    UPDATE puzzles SET
        title      = COALESCE(p_title, title),
        fen        = COALESCE(p_fen, fen),
        solution   = COALESCE(p_solution, solution),
        difficulty = COALESCE(p_difficulty, difficulty),
        points     = COALESCE(p_points, points),
        category   = COALESCE(p_category, category),
        theme      = COALESCE(p_theme, theme),
        hint       = COALESCE(p_hint, hint)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_puzzle_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM puzzles WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  HOMEWORK (Ödev Yönetimi)
-- ════════════════════════════════════════════════════════════════════════════

-- Ödev oluştur
CREATE OR REPLACE FUNCTION fn_homework_create(
    p_title      VARCHAR,
    p_due_date   DATE,
    p_created_by UUID DEFAULT NULL
) RETURNS SETOF homework_assignments AS $$
    INSERT INTO homework_assignments (title, due_date, created_by)
    VALUES (p_title, p_due_date, p_created_by)
    RETURNING *;
$$ LANGUAGE sql;

-- Ödeve bulmaca ekle
CREATE OR REPLACE FUNCTION fn_homework_add_puzzle(p_homework_id UUID, p_puzzle_id UUID, p_sort INT DEFAULT 0)
RETURNS VOID AS $$
    INSERT INTO homework_puzzles (homework_id, puzzle_id, sort_order)
    VALUES (p_homework_id, p_puzzle_id, p_sort)
    ON CONFLICT (homework_id, puzzle_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;
$$ LANGUAGE sql;

-- Ödevi öğrenciye ata
CREATE OR REPLACE FUNCTION fn_homework_assign_student(p_homework_id UUID, p_student_id UUID)
RETURNS SETOF homework_assignees AS $$
    INSERT INTO homework_assignees (homework_id, student_id)
    VALUES (p_homework_id, p_student_id)
    RETURNING *;
$$ LANGUAGE sql;

-- Ödevi gruba ata
CREATE OR REPLACE FUNCTION fn_homework_assign_group(p_homework_id UUID, p_group_id UUID)
RETURNS SETOF homework_assignees AS $$
    INSERT INTO homework_assignees (homework_id, group_id)
    VALUES (p_homework_id, p_group_id)
    RETURNING *;
$$ LANGUAGE sql;

-- Tüm ödevler
CREATE OR REPLACE FUNCTION fn_homework_list()
RETURNS TABLE (
    id UUID, title VARCHAR, due_date DATE, created_by UUID,
    created_at TIMESTAMPTZ, created_by_name VARCHAR,
    puzzle_count BIGINT, assignee_count BIGINT
) AS $$
    SELECT ha.id, ha.title, ha.due_date, ha.created_by, ha.created_at,
           u.full_name,
           COUNT(DISTINCT hp.puzzle_id),
           COUNT(DISTINCT hai.id)
    FROM homework_assignments ha
    LEFT JOIN users u               ON ha.created_by  = u.id
    LEFT JOIN homework_puzzles hp   ON hp.homework_id  = ha.id
    LEFT JOIN homework_assignees hai ON hai.homework_id = ha.id
    GROUP BY ha.id, u.full_name
    ORDER BY ha.due_date DESC;
$$ LANGUAGE sql;

-- Tek ödev detay
CREATE OR REPLACE FUNCTION fn_homework_get(p_id UUID)
RETURNS TABLE (
    id UUID, title VARCHAR, due_date DATE, created_by UUID, created_at TIMESTAMPTZ,
    puzzles JSON
) AS $$
    SELECT ha.id, ha.title, ha.due_date, ha.created_by, ha.created_at,
           COALESCE(
               json_agg(json_build_object(
                   'puzzle_id', p.id, 'title', p.title,
                   'difficulty', p.difficulty, 'points', p.points,
                   'sort_order', hp.sort_order
               ) ORDER BY hp.sort_order) FILTER (WHERE p.id IS NOT NULL),
               '[]'::JSON
           )
    FROM homework_assignments ha
    LEFT JOIN homework_puzzles hp ON hp.homework_id = ha.id
    LEFT JOIN puzzles p           ON p.id = hp.puzzle_id
    WHERE ha.id = p_id
    GROUP BY ha.id;
$$ LANGUAGE sql;

-- Ödev güncelle
CREATE OR REPLACE FUNCTION fn_homework_update(p_id UUID, p_title VARCHAR DEFAULT NULL, p_due_date DATE DEFAULT NULL)
RETURNS SETOF homework_assignments AS $$
    UPDATE homework_assignments SET
        title    = COALESCE(p_title, title),
        due_date = COALESCE(p_due_date, due_date)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

-- Ödev sil
CREATE OR REPLACE FUNCTION fn_homework_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM homework_assignments WHERE id = p_id;
$$ LANGUAGE sql;

-- Ödevden bulmaca çıkar
CREATE OR REPLACE FUNCTION fn_homework_remove_puzzle(p_homework_id UUID, p_puzzle_id UUID)
RETURNS VOID AS $$
    DELETE FROM homework_puzzles WHERE homework_id = p_homework_id AND puzzle_id = p_puzzle_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  HOMEWORK STATS (Ödev İstatistikleri)
-- ════════════════════════════════════════════════════════════════════════════

-- İstatistik kaydet (upsert)
CREATE OR REPLACE FUNCTION fn_hwstats_upsert(
    p_student_id  UUID,
    p_homework_id UUID,
    p_completed   BOOLEAN DEFAULT FALSE,
    p_accuracy    NUMERIC DEFAULT 0,
    p_time_spent  INT DEFAULT 0,
    p_moves       TEXT[] DEFAULT NULL
) RETURNS SETOF homework_stats AS $$
    INSERT INTO homework_stats (student_id, homework_id, completed, accuracy, time_spent, moves, last_attempt)
    VALUES (p_student_id, p_homework_id, p_completed, p_accuracy, p_time_spent, p_moves, NOW())
    ON CONFLICT (student_id, homework_id)
    DO UPDATE SET
        completed    = EXCLUDED.completed,
        accuracy     = EXCLUDED.accuracy,
        time_spent   = EXCLUDED.time_spent,
        moves        = EXCLUDED.moves,
        last_attempt = NOW()
    RETURNING *;
$$ LANGUAGE sql;

-- Ödevin istatistikleri
CREATE OR REPLACE FUNCTION fn_hwstats_by_homework(p_homework_id UUID)
RETURNS TABLE (
    id UUID, student_id UUID, homework_id UUID, completed BOOLEAN,
    accuracy NUMERIC, time_spent INT, last_attempt TIMESTAMPTZ,
    student_name VARCHAR
) AS $$
    SELECT hs.id, hs.student_id, hs.homework_id, hs.completed,
           hs.accuracy, hs.time_spent, hs.last_attempt,
           s.name
    FROM homework_stats hs
    JOIN students s ON hs.student_id = s.id
    WHERE hs.homework_id = p_homework_id
    ORDER BY s.name;
$$ LANGUAGE sql;

-- Öğrencinin ödev istatistikleri
CREATE OR REPLACE FUNCTION fn_hwstats_by_student(p_student_id UUID)
RETURNS TABLE (
    id UUID, homework_id UUID, completed BOOLEAN, accuracy NUMERIC,
    time_spent INT, last_attempt TIMESTAMPTZ,
    homework_title VARCHAR, due_date DATE
) AS $$
    SELECT hs.id, hs.homework_id, hs.completed, hs.accuracy,
           hs.time_spent, hs.last_attempt,
           ha.title, ha.due_date
    FROM homework_stats hs
    JOIN homework_assignments ha ON hs.homework_id = ha.id
    WHERE hs.student_id = p_student_id
    ORDER BY ha.due_date DESC;
$$ LANGUAGE sql;

-- Ödev tamamlama oranı
CREATE OR REPLACE FUNCTION fn_hwstats_completion_rate(p_homework_id UUID)
RETURNS TABLE (completed_count BIGINT, pending_count BIGINT, total BIGINT, completion_rate NUMERIC) AS $$
    SELECT
        COUNT(*) FILTER (WHERE completed = TRUE),
        COUNT(*) FILTER (WHERE completed = FALSE),
        COUNT(*),
        ROUND(100.0 * COUNT(*) FILTER (WHERE completed = TRUE) / NULLIF(COUNT(*), 0), 1)
    FROM homework_stats
    WHERE homework_id = p_homework_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  GALLERY (Galeri)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_gallery_create(
    p_url         TEXT,
    p_title       VARCHAR DEFAULT NULL,
    p_group_name  VARCHAR DEFAULT NULL,
    p_group_id    UUID DEFAULT NULL,
    p_date        DATE DEFAULT CURRENT_DATE,
    p_uploaded_by UUID DEFAULT NULL
) RETURNS SETOF gallery AS $$
    INSERT INTO gallery (url, title, group_name, group_id, date, uploaded_by)
    VALUES (p_url, p_title, p_group_name, p_group_id, p_date, p_uploaded_by)
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_gallery_list(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id UUID, url TEXT, title VARCHAR, group_name VARCHAR,
    group_id UUID, date DATE, uploaded_by UUID, created_at TIMESTAMPTZ,
    uploaded_by_name VARCHAR
) AS $$
    SELECT gl.id, gl.url, gl.title, gl.group_name, gl.group_id,
           gl.date, gl.uploaded_by, gl.created_at,
           u.full_name
    FROM gallery gl
    LEFT JOIN users u ON gl.uploaded_by = u.id
    ORDER BY gl.date DESC, gl.created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_gallery_list_by_group(p_group_id UUID)
RETURNS SETOF gallery AS $$
    SELECT * FROM gallery WHERE group_id = p_group_id ORDER BY date DESC;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_gallery_get(p_id UUID)
RETURNS SETOF gallery AS $$
    SELECT * FROM gallery WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_gallery_update(
    p_id         UUID,
    p_title      VARCHAR DEFAULT NULL,
    p_group_name VARCHAR DEFAULT NULL,
    p_group_id   UUID DEFAULT NULL
) RETURNS SETOF gallery AS $$
    UPDATE gallery SET
        title      = COALESCE(p_title, title),
        group_name = COALESCE(p_group_name, group_name),
        group_id   = COALESCE(p_group_id, group_id)
    WHERE id = p_id
    RETURNING *;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION fn_gallery_delete(p_id UUID)
RETURNS VOID AS $$
    DELETE FROM gallery WHERE id = p_id;
$$ LANGUAGE sql;


-- ════════════════════════════════════════════════════════════════════════════
--  ÖĞRENCİ PANELİ (Veli girişi – panel verileri ve aidat ödemesi)
--  Frontend şu an localStorage kullanıyor; backend bağlanınca bu fonksiyonlar kullanılabilir.
-- ════════════════════════════════════════════════════════════════════════════

-- Veli girişi: Telefon veya öğrenci ID ile öğrenci bul (PIN kontrolü uygulama tarafında)
CREATE OR REPLACE FUNCTION fn_student_for_parent_login(
    p_phone_or_id VARCHAR
) RETURNS SETOF students AS $$
    SELECT * FROM students s
    WHERE s.status = 'active'
      AND (
          s.id::TEXT = TRIM(p_phone_or_id)
          OR REPLACE(REPLACE(REPLACE(COALESCE(s.parent_phone, ''), ' ', ''), '-', ''), '.', '') LIKE '%' || REGEXP_REPLACE(TRIM(p_phone_or_id), '\D', '', 'g')
          OR REPLACE(REPLACE(REPLACE(COALESCE(s.father_phone, ''), ' ', ''), '-', ''), '.', '') LIKE '%' || REGEXP_REPLACE(TRIM(p_phone_or_id), '\D', '', 'g')
          OR REPLACE(REPLACE(REPLACE(COALESCE(s.mother_phone, ''), ' ', ''), '-', ''), '.', '') LIKE '%' || REGEXP_REPLACE(TRIM(p_phone_or_id), '\D', '', 'g')
      )
    LIMIT 1;
$$ LANGUAGE sql;

-- Öğrenci paneli: Öğrenci detayı (mevcut fn_student_get kullanılır)
-- SELECT * FROM fn_student_get('öğrenci-uuid');

-- Öğrenci paneli: Yoklama geçmişi
-- SELECT * FROM fn_attendance_student_history('öğrenci-uuid', 50);

-- Öğrenci paneli: Ödeme / aidat geçmişi (payments tablosu)
-- SELECT * FROM fn_payment_list_by_student('öğrenci-uuid');

-- Öğrenci paneli: Aidat ödemesi ekleme (veli panelinden gelen talebi kaydet)
-- payment_type_en: 'Cash' = Nakit, 'Transfer' = Havale/EFT, 'Card' = Kredi Kartı
-- Örnek: SELECT * FROM fn_payment_create(
--   'öğrenci-uuid',  -- p_student_id
--   500.00,          -- p_amount
--   'Transfer',      -- p_type (Cash / Transfer / Card)
--   '2024-03',       -- p_month (YYYY-MM veya 'Mart 2024')
--   'Mart 2024 aidat', -- p_description
--   CURRENT_DATE     -- p_date
-- );
-- Not: Kasa tarafında da gelir kaydı istiyorsanız fn_transaction_create ile ayrıca income ekleyin (transactions tablosunda student_id yoksa önce tabloya student_id kolonu eklenmeli veya sadece payments kullanılır).


-- ════════════════════════════════════════════════════════════════════════════
--  ÖDEV ATAMALARI (Bulmaca) — Öğrenci panelinde görünen ödevler
--  Tablolar ve fn_homework_list_for_student / fn_homework_create için
--  homework_assignments_sql.sql dosyasını çalıştırın.
--  Örnek: SELECT * FROM fn_homework_list_for_student('öğrenci-uuid'::UUID, 'Alt Yapı A');
-- ════════════════════════════════════════════════════════════════════════════


COMMIT;
