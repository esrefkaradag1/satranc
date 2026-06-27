import type { NavCategory } from '../constants';
import {
  NAV_CATEGORIES,
  COACH_NAV_CATEGORIES,
  CLUB_NAV_CATEGORIES,
  STUDENT_NAV_CATEGORIES,
} from '../constants';
import type { AppRole, RolePanel, AuthUser } from '../types';

export type PermissionDef = {
  key: string;
  label: string;
  category: string;
  panel: RolePanel;
};

const EXTRA_ADMIN: PermissionDef[] = [
  { key: 'student-detail', label: 'Öğrenci Detay', category: 'Öğrenci İşleri', panel: 'admin' },
  { key: 'students', label: 'Öğrenci İşlemleri (eski)', category: 'Öğrenci İşleri', panel: 'admin' },
  { key: 'qr-attendance', label: 'QR Yoklama', category: 'Öğrenci İşleri', panel: 'admin' },
];

const EXTRA_COACH: PermissionDef[] = [
  { key: 'student-detail', label: 'Öğrenci Detay', category: 'Öğrenci İşleri', panel: 'coach' },
];

function fromNav(categories: NavCategory[], panel: RolePanel): PermissionDef[] {
  const out: PermissionDef[] = [];
  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.subItems?.length) {
        for (const sub of item.subItems) {
          out.push({ key: sub.id, label: sub.label, category: cat.title, panel });
        }
      } else {
        out.push({ key: item.id, label: item.label, category: cat.title, panel });
      }
    }
  }
  return out;
}

/** Veli paneli — öğrenci sekmelerinin alt kümesi */
export const PARENT_DEFAULT_PERMISSIONS = [
  'summary',
  'leaderboard',
  'messages',
  'gallery',
  'schedule',
  'payments',
  'dues',
  'attendance',
  'profile',
];

export const PERMISSION_CATALOG: PermissionDef[] = [
  ...fromNav(NAV_CATEGORIES, 'admin'),
  ...EXTRA_ADMIN,
  ...fromNav(COACH_NAV_CATEGORIES, 'coach'),
  ...EXTRA_COACH,
  ...fromNav(CLUB_NAV_CATEGORIES, 'club'),
  ...fromNav(STUDENT_NAV_CATEGORIES, 'student'),
  ...PARENT_DEFAULT_PERMISSIONS.map((key, i) => {
    const studentDef = fromNav(STUDENT_NAV_CATEGORIES, 'student').find((p) => p.key === key);
    return {
      key,
      label: studentDef?.label ?? key,
      category: studentDef?.category ?? 'Veli',
      panel: 'parent' as RolePanel,
    };
  }),
];

export const SYSTEM_ROLE_SEEDS: Omit<AppRole, 'createdAt'>[] = [
  {
    id: 'role-admin',
    slug: 'admin',
    name: 'Yönetici',
    panel: 'admin',
    description: 'Tam yetkili yönetim paneli',
    color: '#8b5cf6',
    isSystem: true,
  },
  {
    id: 'role-coach',
    slug: 'coach',
    name: 'Antrenör',
    panel: 'coach',
    description: 'Eğitim ve öğrenci işleri',
    color: '#f59e0b',
    isSystem: true,
  },
  {
    id: 'role-club',
    slug: 'club',
    name: 'Kulüp',
    panel: 'club',
    description: 'Şube yönetimi',
    color: '#10b981',
    isSystem: true,
  },
  {
    id: 'role-student',
    slug: 'student',
    name: 'Öğrenci',
    panel: 'student',
    description: 'Öğrenci paneli erişimi',
    color: '#14b8a6',
    isSystem: true,
  },
  {
    id: 'role-parent',
    slug: 'parent',
    name: 'Veli',
    panel: 'parent',
    description: 'Veli paneli erişimi',
    color: '#6366f1',
    isSystem: true,
  },
];

export function permissionsForPanel(panel: RolePanel): PermissionDef[] {
  const seen = new Set<string>();
  return PERMISSION_CATALOG.filter((p) => {
    if (p.panel !== panel) return false;
    if (seen.has(p.key)) return false;
    seen.add(p.key);
    return true;
  });
}

function uniquePermissionKeys(perms: PermissionDef[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const p of perms) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    keys.push(p.key);
  }
  return keys;
}

/** Aynı izin anahtarı birden fazla panelde varsa ilk tanım (öncelik sırası) kullanılır */
function mergePermissionDefs(...lists: PermissionDef[][]): PermissionDef[] {
  const byKey = new Map<string, PermissionDef>();
  for (const list of lists) {
    for (const p of list) {
      if (!byKey.has(p.key)) byKey.set(p.key, p);
    }
  }
  return [...byKey.values()];
}

/** Rol düzenleyicide gösterilecek izinler — öğrenci/veli panelleri yalnızca kendi rollerinde */
export function permissionsForRoleEditor(panel: RolePanel): PermissionDef[] {
  if (panel === 'student') {
    return PERMISSION_CATALOG.filter((p) => p.panel === 'student');
  }
  if (panel === 'parent') {
    return PERMISSION_CATALOG.filter((p) => p.panel === 'parent');
  }
  if (panel === 'admin') {
    return permissionsForPanel('admin');
  }
  if (panel === 'coach') {
    // Antrenör rolleri: yönetici izinlerinin tamamı + antrenöre özel menüler
    return mergePermissionDefs(permissionsForPanel('admin'), permissionsForPanel('coach'), EXTRA_COACH);
  }
  if (panel === 'club') {
    // Kulüp rolleri: yönetici + antrenör + kulübe özel menüler
    return mergePermissionDefs(
      permissionsForPanel('admin'),
      permissionsForPanel('coach'),
      permissionsForPanel('club'),
    );
  }
  return permissionsForPanel('admin');
}

export function permissionKeysForRoleEditor(panel: RolePanel): string[] {
  return uniquePermissionKeys(permissionsForRoleEditor(panel));
}

/** Rol düzenlemede izinleri kategori bazında listeler (panel etiketiyle) */
export function groupedPermissionsForRoleEditor(panel: RolePanel): [string, PermissionDef[]][] {
  const byCat = new Map<string, PermissionDef[]>();
  for (const p of permissionsForRoleEditor(panel)) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  return [...byCat.entries()];
}

export function sanitizePermissionsForRole(panel: RolePanel, keys: string[]): string[] {
  const allowed = new Set(permissionKeysForRoleEditor(panel));
  return keys.filter((k) => allowed.has(k));
}

/** Kulübün antrenörüne verebileceği menü izinleri (antrenör paneli). */
export function coachGrantablePermissionDefs(): PermissionDef[] {
  return mergePermissionDefs(permissionsForPanel('coach'), EXTRA_COACH);
}

export function groupedCoachGrantablePermissions(): [string, PermissionDef[]][] {
  const byCat = new Map<string, PermissionDef[]>();
  for (const p of coachGrantablePermissionDefs()) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  return [...byCat.entries()];
}

export function sanitizeCoachGrantPermissions(keys: string[]): string[] {
  const allowed = new Set(coachGrantablePermissionDefs().map((p) => p.key));
  return keys.filter((k) => allowed.has(k));
}

export function permissionSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((k) => setB.has(k));
}

export function coachPermissionSummary(
  roleId: string | undefined,
  rolePermissionMap: Record<string, string[]>,
  appRoles: AppRole[],
): string {
  if (!roleId || roleId === 'role-coach') return 'Varsayılan yetkiler';
  const role = appRoles.find((r) => r.id === roleId);
  const count = rolePermissionMap[roleId]?.length ?? 0;
  if (role?.isSystem) return role.name;
  return role ? `${role.name} · ${count} izin` : `${count} özel izin`;
}

export function defaultPermissionsForRole(slug: string): string[] {
  switch (slug) {
    case 'admin':
      return permissionsForPanel('admin').map((p) => p.key);
    case 'coach':
      return permissionsForPanel('coach').map((p) => p.key);
    case 'club':
      // Kulüp paneli yönetim + antrenör menülerini birleştirir
      return permissionKeysForRoleEditor('club');
    case 'student':
      return permissionsForPanel('student').map((p) => p.key);
    case 'parent':
      return [...PARENT_DEFAULT_PERMISSIONS];
    default:
      return [];
  }
}

export function buildDefaultRolePermissionMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const role of SYSTEM_ROLE_SEEDS) {
    map[role.id] = defaultPermissionsForRole(role.slug);
  }
  return map;
}

export function filterNavByPermissions(categories: NavCategory[], allowed: Set<string>): NavCategory[] {
  return categories
    .map((cat) => ({
      ...cat,
      items: cat.items
        .map((item) => {
          if (item.subItems?.length) {
            const subItems = item.subItems.filter((s) => allowed.has(s.id));
            if (subItems.length === 0) return null;
            return { ...item, subItems };
          }
          return allowed.has(item.id) ? item : null;
        })
        .filter(Boolean) as NavCategory['items'],
    }))
    .filter((cat) => cat.items.length > 0);
}

/** Birden fazla panel menüsünü izinlere göre birleştirir (kulüp paneli için) */
export function mergeNavForPermissions(allowed: Set<string>, catalogs: NavCategory[][]): NavCategory[] {
  const merged: NavCategory[] = [];
  const seenItemIds = new Set<string>();

  for (const catalog of catalogs) {
    if (!catalog?.length) continue;
    const filtered = filterNavByPermissions(catalog, allowed);
    for (const cat of filtered) {
      let bucket = merged.find((m) => m.title === cat.title);
      if (!bucket) {
        bucket = { title: cat.title, icon: cat.icon, items: [] };
        merged.push(bucket);
      }
      for (const item of cat.items) {
        if (seenItemIds.has(item.id)) continue;
        seenItemIds.add(item.id);
        bucket.items.push(item);
      }
    }
  }

  return merged.filter((cat) => cat.items.length > 0);
}

export function clubNavForPermissions(allowed: Set<string>): NavCategory[] {
  const effective = new Set(allowed);
  // Kulüp "students" ile admin/antrenör "student-list" aynı menü — çift kayıt önlenir
  if (effective.has('student-list')) effective.delete('students');

  const coachesItem = CLUB_NAV_CATEGORIES.flatMap((c) => c.items).find((i) => i.id === 'coaches');
  const clubExtras: NavCategory[] =
    coachesItem && effective.has('coaches')
      ? [
          {
            title: 'Kulüp Yönetimi',
            icon: CLUB_NAV_CATEGORIES.find((c) => c.items.some((i) => i.id === 'coaches'))?.icon,
            items: [coachesItem],
          },
        ]
      : [];

  // Yönetim + antrenör menüsü öncelikli; kulübe özel antrenörler en sonda
  return mergeNavForPermissions(effective, [NAV_CATEGORIES, COACH_NAV_CATEGORIES, clubExtras]);
}

/** Antrenör paneli: yönetim menüsü + antrenör menüsü (izinlere göre) */
export function coachNavForPermissions(allowed: Set<string>): NavCategory[] {
  const effective = new Set(allowed);
  if (effective.has('student-list')) effective.delete('students');
  return mergeNavForPermissions(effective, [NAV_CATEGORIES, COACH_NAV_CATEGORIES]);
}

/** Antrenör panelinde sekme izni (alt sayfalar dahil) */
export function isCoachPanelTabAllowed(allowed: Set<string>, tab: string): boolean {
  if (allowed.has(tab)) return true;
  if (tab === 'student-detail' && (allowed.has('student-list') || allowed.has('students'))) return true;
  if (tab === 'qr-attendance' && allowed.has('attendance')) return true;
  return false;
}

/** Antrenör sidebar vurgusu */
export function coachSidebarTabFor(activeTab: string, allowed: Set<string>): string {
  if (activeTab === 'student-detail' || activeTab === 'student-add') {
    return allowed.has('student-list') ? 'student-list' : 'students';
  }
  return activeTab;
}

/** Kulüp panelinde öğrenci listesi sekmesi (admin listesi öncelikli) */
export function clubPreferredStudentListTab(allowed: Set<string>): string {
  if (allowed.has('student-list')) return 'student-list';
  if (allowed.has('students')) return 'students';
  return 'dashboard';
}

/** Kulüp panelinde sekme izni (alt sayfalar dahil) */
export function isClubPanelTabAllowed(allowed: Set<string>, tab: string): boolean {
  if (allowed.has(tab)) return true;
  if (tab === 'student-detail' && (allowed.has('student-list') || allowed.has('students'))) return true;
  if (tab === 'qr-attendance' && allowed.has('attendance')) return true;
  return false;
}

/** Sidebar vurgusu için üst menü kimliği */
export function clubSidebarTabFor(activeTab: string, allowed: Set<string>): string {
  if (activeTab === 'student-detail' || activeTab === 'student-add') {
    return allowed.has('student-list') ? 'student-list' : 'students';
  }
  return activeTab;
}

export function resolveRoleIdForAuth(
  auth: AuthUser,
  ctx: { coachRoleId?: string; clubRoleId?: string },
): string | undefined {
  if (auth.role === 'coach' && ctx.coachRoleId) return ctx.coachRoleId;
  if (auth.role === 'club' && ctx.clubRoleId) return ctx.clubRoleId;
  return undefined;
}

export function resolveCustomRoleIdForAuth(
  auth: AuthUser,
  ctx: { coaches: { id: string; branch?: string; roleId?: string }[]; clubs: { id: string; name?: string; roleId?: string }[] },
): string | undefined {
  if (auth.role === 'coach') {
    if (auth.roleId) return auth.roleId;
    const coach =
      (auth.coachId ? ctx.coaches.find((c) => c.id === auth.coachId) : undefined) ??
      ctx.coaches.find((c) => (c.branch || '').trim() === (auth.branch || '').trim());
    return coach?.roleId;
  }
  if (auth.role === 'club') {
    if (auth.roleId) return auth.roleId;
    const club =
      (auth.clubId ? ctx.clubs.find((c) => c.id === auth.clubId) : undefined) ??
      ctx.clubs.find((c) => (c.name || '').trim() === (auth.branch || '').trim());
    return club?.roleId;
  }
  return undefined;
}

export function systemRoleIdForAuth(auth: AuthUser): string {
  switch (auth.role) {
    case 'admin':
      return 'role-admin';
    case 'coach':
      return 'role-coach';
    case 'club':
      return 'role-club';
    case 'student':
      return 'role-student';
    case 'parent':
      return 'role-parent';
    default:
      return 'role-admin';
  }
}

export function getPermissionsForAuth(
  auth: AuthUser | null,
  rolePermissionMap: Record<string, string[]>,
  customRoleId?: string,
  rolesLoaded = true,
): Set<string> {
  if (!auth) return new Set();

  if (auth.role === 'admin') {
    return new Set(permissionsForPanel('admin').map((p) => p.key));
  }

  const slug =
    auth.role === 'coach'
      ? 'coach'
      : auth.role === 'club'
        ? 'club'
        : auth.role === 'student'
          ? 'student'
          : auth.role === 'parent'
            ? 'parent'
            : 'admin';

  const fallback = () => new Set(defaultPermissionsForRole(slug));
  const systemRoleId = systemRoleIdForAuth(auth);
  const roleId = customRoleId || systemRoleId;

  if (!rolesLoaded) {
    const cached = rolePermissionMap[roleId];
    if (cached?.length) return new Set(cached);
    if (customRoleId && customRoleId !== systemRoleId) {
      const systemCached = rolePermissionMap[systemRoleId];
      if (systemCached?.length) return new Set(systemCached);
    }
    return fallback();
  }

  if (roleId in rolePermissionMap) {
    const keys = rolePermissionMap[roleId];
    if (keys.length > 0) return new Set(keys);
    if (!customRoleId || customRoleId === systemRoleId) return new Set(keys);
  }

  if (customRoleId && customRoleId !== systemRoleId) {
    const systemKeys = rolePermissionMap[systemRoleId];
    if (systemKeys?.length) return new Set(systemKeys);
    return fallback();
  }

  return fallback();
}

export function hasPermission(
  auth: AuthUser | null,
  rolePermissionMap: Record<string, string[]>,
  key: string,
  customRoleId?: string,
  rolesLoaded = true,
): boolean {
  if (!auth) return false;
  if (auth.role === 'admin') return true;
  return getPermissionsForAuth(auth, rolePermissionMap, customRoleId, rolesLoaded).has(key);
}
