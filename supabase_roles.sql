-- Rol yönetimi: roller, izinler ve rol-izin eşlemesi
-- Supabase SQL Editor'da çalıştırın.

-- ─── Tablolar ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_roles (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  panel text NOT NULL CHECK (panel IN ('admin', 'coach', 'club', 'student', 'parent')),
  description text,
  color text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_permissions (
  panel text NOT NULL CHECK (panel IN ('admin', 'coach', 'club', 'student', 'parent')),
  perm_key text NOT NULL,
  label text NOT NULL,
  category text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (panel, perm_key)
);

CREATE TABLE IF NOT EXISTS public.app_role_permissions (
  role_id text NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  perm_key text NOT NULL,
  PRIMARY KEY (role_id, perm_key)
);

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS role_id text REFERENCES public.app_roles(id) ON DELETE SET NULL;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS role_id text REFERENCES public.app_roles(id) ON DELETE SET NULL;

COMMENT ON TABLE public.app_roles IS 'Uygulama rolleri (sistem + özel)';
COMMENT ON TABLE public.app_permissions IS 'Menü/özellik izin kataloğu';
COMMENT ON TABLE public.app_role_permissions IS 'Rol başına izinler';
COMMENT ON COLUMN public.coaches.role_id IS 'Antrenöre atanan özel rol';
COMMENT ON COLUMN public.clubs.role_id IS 'Kulübe atanan özel rol';

-- ─── RLS (okuma herkese, yazma service role ile) ────────────────────────────

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read app_roles" ON public.app_roles;
CREATE POLICY "Public read app_roles" ON public.app_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read app_permissions" ON public.app_permissions;
CREATE POLICY "Public read app_permissions" ON public.app_permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read app_role_permissions" ON public.app_role_permissions;
CREATE POLICY "Public read app_role_permissions" ON public.app_role_permissions FOR SELECT USING (true);

-- Yazma politikaları (anon key ile client-side yazım — mevcut uygulama mimarisiyle uyumlu)
DROP POLICY IF EXISTS "Allow write app_roles" ON public.app_roles;
CREATE POLICY "Allow write app_roles" ON public.app_roles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow write app_permissions" ON public.app_permissions;
CREATE POLICY "Allow write app_permissions" ON public.app_permissions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow write app_role_permissions" ON public.app_role_permissions;
CREATE POLICY "Allow write app_role_permissions" ON public.app_role_permissions FOR ALL USING (true) WITH CHECK (true);

-- ─── İzin kataloğu (seed) ───────────────────────────────────────────────────

INSERT INTO public.app_permissions (panel, perm_key, label, category, sort_order) VALUES
  -- Admin
  ('admin', 'dashboard', 'Anasayfa', 'Genel', 1),
  ('admin', 'student-list', 'Öğrenci Listesi', 'Öğrenci İşleri', 2),
  ('admin', 'student-add', 'Öğrenci Ekle', 'Öğrenci İşleri', 3),
  ('admin', 'attendance', 'Yoklama Al', 'Öğrenci İşleri', 4),
  ('admin', 'groups', 'Branş & Grup', 'Öğrenci İşleri', 5),
  ('admin', 'bulk-actions', 'Toplu İşlemler', 'Öğrenci İşleri', 6),
  ('admin', 'applications', 'Başvurular', 'Öğrenci İşleri', 7),
  ('admin', 'student-detail', 'Öğrenci Detay', 'Öğrenci İşleri', 8),
  ('admin', 'students', 'Öğrenci İşlemleri', 'Öğrenci İşleri', 9),
  ('admin', 'qr-attendance', 'QR Yoklama', 'Öğrenci İşleri', 10),
  ('admin', 'corporate', 'Kurumsal Yapı', 'Kurumsal Yapı', 11),
  ('admin', 'tournaments', 'Turnuvalar', 'Turnuvalar', 12),
  ('admin', 'finance', 'Kasa & Finans', 'Kasa Operasyon', 13),
  ('admin', 'inventory', 'Depo & Envanter', 'Kasa Operasyon', 14),
  ('admin', 'gallery', 'Galeri İşlemleri', 'Medya & İletişim', 15),
  ('admin', 'messages', 'Site İçi Mesajlar', 'Medya & İletişim', 16),
  ('admin', 'security', 'Kullanıcı & Güvenlik', 'Sistem', 17),
  ('admin', 'roles', 'Rol Yönetimi', 'Sistem', 18),
  ('admin', 'leaderboard', 'Lider Tablosu', 'Raporlama', 19),
  ('admin', 'analysis', 'Analiz & Performans', 'Raporlama', 20),
  ('admin', 'profile', 'Profil', 'Hesap', 21),
  -- Coach
  ('coach', 'dashboard', 'Anasayfa', 'Genel', 101),
  ('coach', 'student-list', 'Öğrenci Listesi', 'Öğrenci İşleri', 102),
  ('coach', 'attendance', 'Yoklama Al', 'Öğrenci İşleri', 103),
  ('coach', 'groups', 'Branş & Grup', 'Öğrenci İşleri', 104),
  ('coach', 'student-detail', 'Öğrenci Detay', 'Öğrenci İşleri', 105),
  ('coach', 'lessons', 'Canlı Ders', 'Eğitim & İçerik', 106),
  ('coach', 'puzzles', 'Bulmaca Yönetimi', 'Eğitim & İçerik', 107),
  ('coach', 'study', 'Çalışma', 'Eğitim & İçerik', 108),
  ('coach', 'homework', 'Ödev Yönetimi', 'Eğitim & İçerik', 109),
  ('coach', 'curriculum', 'Ders Programı & Müfredat', 'Eğitim & İçerik', 110),
  ('coach', 'gallery', 'Galeri İşlemleri', 'Medya & İletişim', 111),
  ('coach', 'messages', 'Site İçi Mesajlar', 'Medya & İletişim', 112),
  ('coach', 'leaderboard', 'Lider Tablosu', 'Raporlama', 113),
  ('coach', 'analysis', 'Analiz & Performans', 'Raporlama', 114),
  ('coach', 'profile', 'Profil', 'Hesap', 115),
  -- Club
  ('club', 'dashboard', 'Anasayfa', 'Genel', 201),
  ('club', 'profile', 'Profil & Ayarlar', 'Kulüp Bilgileri', 202),
  ('club', 'coaches', 'Antrenörler', 'Personel', 203),
  ('club', 'students', 'Öğrenci Listesi', 'Öğrenci İşleri', 204),
  ('club', 'tournaments', 'Turnuvalar', 'Turnuvalar', 205),
  ('club', 'finance', 'Kasa Özeti', 'Finans', 206),
  -- Student
  ('student', 'summary', 'Özet', 'Genel', 301),
  ('student', 'leaderboard', 'Lider Tablosu', 'Genel', 302),
  ('student', 'messages', 'Mesajlar', 'Genel', 303),
  ('student', 'gallery', 'Medya & Galeri', 'İçerik & Eğitim', 304),
  ('student', 'schedule', 'Ders Programı', 'İçerik & Eğitim', 305),
  ('student', 'live-lesson', 'Canlı Derse Katıl', 'İçerik & Eğitim', 306),
  ('student', 'puzzles', 'Bulmaca', 'İçerik & Eğitim', 307),
  ('student', 'study', 'Çalışma', 'İçerik & Eğitim', 308),
  ('student', 'tournaments', 'Turnuvalar', 'İçerik & Eğitim', 309),
  ('student', 'analyses', 'Analizler', 'İçerik & Eğitim', 310),
  ('student', 'ukd', 'UKD/FIDE', 'İçerik & Eğitim', 311),
  ('student', 'lichess', 'Lichess', 'İçerik & Eğitim', 312),
  ('student', 'chesscom', 'Chess.com', 'İçerik & Eğitim', 313),
  ('student', 'payments', 'Ödemeler', 'Ödeme & Aidat', 314),
  ('student', 'dues', 'Aidat Geçmişi', 'Ödeme & Aidat', 315),
  ('student', 'attendance', 'Devam', 'Takip & Hesap', 316),
  ('student', 'profile', 'Profil', 'Takip & Hesap', 317),
  -- Parent (veli sekmeleri)
  ('parent', 'summary', 'Özet', 'Genel', 401),
  ('parent', 'leaderboard', 'Lider Tablosu', 'Genel', 402),
  ('parent', 'messages', 'Mesajlar', 'Genel', 403),
  ('parent', 'gallery', 'Medya & Galeri', 'İçerik', 404),
  ('parent', 'schedule', 'Ders Programı', 'İçerik', 405),
  ('parent', 'payments', 'Ödemeler', 'Ödeme & Aidat', 406),
  ('parent', 'dues', 'Aidat Geçmişi', 'Ödeme & Aidat', 407),
  ('parent', 'attendance', 'Devam', 'Takip & Hesap', 408),
  ('parent', 'profile', 'Profil', 'Takip & Hesap', 409)
ON CONFLICT (panel, perm_key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- ─── Sistem rolleri ─────────────────────────────────────────────────────────

INSERT INTO public.app_roles (id, slug, name, panel, description, color, is_system) VALUES
  ('role-admin', 'admin', 'Yönetici', 'admin', 'Tam yetkili yönetim paneli', '#8b5cf6', true),
  ('role-coach', 'coach', 'Antrenör', 'coach', 'Eğitim ve öğrenci işleri', '#f59e0b', true),
  ('role-club', 'club', 'Kulüp', 'club', 'Şube yönetimi', '#10b981', true),
  ('role-student', 'student', 'Öğrenci', 'student', 'Öğrenci paneli erişimi', '#14b8a6', true),
  ('role-parent', 'parent', 'Veli', 'parent', 'Veli paneli erişimi', '#6366f1', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color;

-- ─── Varsayılan izinler: Yönetici ──────────────────────────────────────────

INSERT INTO public.app_role_permissions (role_id, perm_key) VALUES
  ('role-admin', 'dashboard'),
  ('role-admin', 'student-list'),
  ('role-admin', 'student-add'),
  ('role-admin', 'attendance'),
  ('role-admin', 'groups'),
  ('role-admin', 'bulk-actions'),
  ('role-admin', 'applications'),
  ('role-admin', 'student-detail'),
  ('role-admin', 'students'),
  ('role-admin', 'qr-attendance'),
  ('role-admin', 'corporate'),
  ('role-admin', 'tournaments'),
  ('role-admin', 'finance'),
  ('role-admin', 'inventory'),
  ('role-admin', 'gallery'),
  ('role-admin', 'messages'),
  ('role-admin', 'security'),
  ('role-admin', 'roles'),
  ('role-admin', 'leaderboard'),
  ('role-admin', 'analysis'),
  ('role-admin', 'profile')
ON CONFLICT DO NOTHING;

-- Antrenör
INSERT INTO public.app_role_permissions (role_id, perm_key) VALUES
  ('role-coach', 'dashboard'),
  ('role-coach', 'student-list'),
  ('role-coach', 'attendance'),
  ('role-coach', 'groups'),
  ('role-coach', 'student-detail'),
  ('role-coach', 'lessons'),
  ('role-coach', 'puzzles'),
  ('role-coach', 'study'),
  ('role-coach', 'homework'),
  ('role-coach', 'curriculum'),
  ('role-coach', 'gallery'),
  ('role-coach', 'messages'),
  ('role-coach', 'leaderboard'),
  ('role-coach', 'analysis'),
  ('role-coach', 'profile')
ON CONFLICT DO NOTHING;

-- Kulüp
INSERT INTO public.app_role_permissions (role_id, perm_key) VALUES
  ('role-club', 'dashboard'),
  ('role-club', 'profile'),
  ('role-club', 'coaches'),
  ('role-club', 'students'),
  ('role-club', 'tournaments'),
  ('role-club', 'finance')
ON CONFLICT DO NOTHING;

-- Öğrenci
INSERT INTO public.app_role_permissions (role_id, perm_key) VALUES
  ('role-student', 'summary'),
  ('role-student', 'leaderboard'),
  ('role-student', 'messages'),
  ('role-student', 'gallery'),
  ('role-student', 'schedule'),
  ('role-student', 'live-lesson'),
  ('role-student', 'puzzles'),
  ('role-student', 'study'),
  ('role-student', 'tournaments'),
  ('role-student', 'analyses'),
  ('role-student', 'ukd'),
  ('role-student', 'lichess'),
  ('role-student', 'chesscom'),
  ('role-student', 'payments'),
  ('role-student', 'dues'),
  ('role-student', 'attendance'),
  ('role-student', 'profile')
ON CONFLICT DO NOTHING;

-- Veli (öğrenci sekmelerinin kısıtlı alt kümesi)
INSERT INTO public.app_role_permissions (role_id, perm_key) VALUES
  ('role-parent', 'summary'),
  ('role-parent', 'leaderboard'),
  ('role-parent', 'messages'),
  ('role-parent', 'gallery'),
  ('role-parent', 'schedule'),
  ('role-parent', 'payments'),
  ('role-parent', 'dues'),
  ('role-parent', 'attendance'),
  ('role-parent', 'profile')
ON CONFLICT DO NOTHING;
