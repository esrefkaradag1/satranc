import type { NavCategory } from '../constants';
import {
  NAV_CATEGORIES,
  COACH_NAV_CATEGORIES,
  CLUB_NAV_CATEGORIES,
  STUDENT_NAV_CATEGORIES,
} from '../constants';
import type { AppRole, RolePanel } from '../types';
import type { AuthUser } from '../types';

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

export function defaultPermissionsForRole(slug: string): string[] {
  switch (slug) {
    case 'admin':
      return permissionsForPanel('admin').map((p) => p.key);
    case 'coach':
      return permissionsForPanel('coach').map((p) => p.key);
    case 'club':
      return permissionsForPanel('club').map((p) => p.key);
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

export function resolveRoleIdForAuth(
  auth: AuthUser,
  ctx: { coachRoleId?: string; clubRoleId?: string },
): string | undefined {
  if (auth.role === 'coach' && ctx.coachRoleId) return ctx.coachRoleId;
  if (auth.role === 'club' && ctx.clubRoleId) return ctx.clubRoleId;
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

  const roleId = customRoleId || systemRoleIdForAuth(auth);

  if (roleId in rolePermissionMap) {
    return new Set(rolePermissionMap[roleId]);
  }

  if (!rolesLoaded) return new Set();

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
  return new Set(defaultPermissionsForRole(slug));
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
