/** Panel sekmeleri ↔ URL slug (hash) eşlemesi */

export const TAB_TO_SLUG: Record<string, string> = {
  dashboard: 'anasayfa',
  corporate: 'kurumsal-yapi',
  'student-list': 'ogrenci-listesi',
  'student-add': 'ogrenci-ekle',
  'student-detail': 'ogrenci-detay',
  students: 'ogrenci-islemleri',
  attendance: 'yoklama-al',
  'qr-attendance': 'qr-yoklama',
  groups: 'brans-grup',
  'bulk-actions': 'toplu-islemler',
  applications: 'basvurular',
  puzzles: 'bulmaca-yonetimi',
  study: 'bulmaca-yeni',
  tournaments: 'turnuvalar',
  homework: 'odev-yonetimi',
  leaderboard: 'lider-tablosu',
  analysis: 'analiz-performans',
  finance: 'kasa-finans',
  inventory: 'depo-envanter',
  gallery: 'galeri',
  lessons: 'canli-ders',
  curriculum: 'ders-programi',
  messages: 'mesajlar',
  security: 'kullanici-guvenlik',
  roles: 'rol-yonetimi',
  profile: 'profil',
  coaches: 'antrenorler',
};

export const SLUG_TO_TAB: Record<string, string> = {
  ...Object.fromEntries(Object.entries(TAB_TO_SLUG).map(([tab, slug]) => [slug, tab])),
  whatsapp: 'messages',
};

export function readPanelHash(): { tab: string; studentId: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return { tab: 'dashboard', studentId: null };
  const [slug, extra] = raw.split('/');
  const tab = SLUG_TO_TAB[slug] ?? 'dashboard';
  return { tab, studentId: tab === 'student-detail' && extra ? extra : null };
}

export function writePanelHash(tab: string, studentId?: string | null) {
  const slug = TAB_TO_SLUG[tab] ?? 'anasayfa';
  const next =
    tab === 'student-detail' && studentId
      ? `#/${slug}/${studentId}`
      : `#/${slug}`;
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
}
