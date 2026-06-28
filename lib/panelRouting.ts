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

const LAST_PANEL_HASH_KEY = 'netchess_last_panel_hash';

export type PanelHashState = {
  tab: string;
  studentId: string | null;
  studyId: string | null;
  chapterIndex: number | null;
};

function parseChapterIndex(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readPanelHash(): PanelHashState {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) {
    try {
      const saved = localStorage.getItem(LAST_PANEL_HASH_KEY);
      if (saved) return readPanelHashFromPath(saved);
    } catch { /* ignore */ }
    return { tab: 'dashboard', studentId: null, studyId: null, chapterIndex: null };
  }
  return readPanelHashFromPath(raw);
}

function readPanelHashFromPath(raw: string): PanelHashState {
  const [slug, p1, p2] = raw.split('/');
  const tab = SLUG_TO_TAB[slug] ?? 'dashboard';
  if (tab === 'student-detail' && p1) {
    return { tab, studentId: decodeURIComponent(p1), studyId: null, chapterIndex: null };
  }
  if (tab === 'study' && p1) {
    return {
      tab,
      studentId: null,
      studyId: decodeURIComponent(p1),
      chapterIndex: parseChapterIndex(p2),
    };
  }
  return { tab, studentId: null, studyId: null, chapterIndex: null };
}

export function writePanelHash(
  tab: string,
  studentId?: string | null,
  studyRoute?: { studyId?: string | null; chapterIndex?: number | null },
) {
  const slug = TAB_TO_SLUG[tab] ?? 'anasayfa';
  let next: string;
  if (tab === 'student-detail' && studentId) {
    next = `#/${slug}/${encodeURIComponent(studentId)}`;
  } else if (tab === 'study' && studyRoute?.studyId) {
    const sid = encodeURIComponent(studyRoute.studyId);
    next =
      studyRoute.chapterIndex != null && studyRoute.chapterIndex >= 0
        ? `#/${slug}/${sid}/${studyRoute.chapterIndex}`
        : `#/${slug}/${sid}`;
  } else {
    next = `#/${slug}`;
  }
  if (window.location.hash !== next) {
    window.location.hash = next;
  }
  try {
    localStorage.setItem(LAST_PANEL_HASH_KEY, next.replace(/^#\/?/, ''));
  } catch { /* ignore */ }
}

/** Çalışma editöründe seçili bölümü URL'ye yazar (panel sekmesi değişmez). */
export function writeStudyEditorHash(studyId: string | null, chapterIndex?: number | null) {
  if (!studyId) {
    writePanelHash('study');
    return;
  }
  writePanelHash('study', null, {
    studyId,
    chapterIndex: chapterIndex ?? null,
  });
}

/** Yönetim paneli girişi — `/yonetim` veya `#/yonetim` */
export function isAdminLoginRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/yonetim') return true;
  const head = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return head === 'yonetim';
}
