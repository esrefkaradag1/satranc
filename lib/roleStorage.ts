import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '../types';
import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_SEEDS,
  buildDefaultRolePermissionMap,
  defaultPermissionsForRole,
} from './rolePermissions';

const ROLES_KEY = 'netchess_app_roles';
const PERMS_KEY = 'netchess_role_permissions';

export type RolePermissionMap = Record<string, string[]>;

export const ROLES_UPDATED_EVENT = 'netchess-roles-updated';

function getRolesClient(): SupabaseClient | null {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function dbToRole(row: Record<string, unknown>): AppRole {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    panel: String(row.panel ?? 'admin') as AppRole['panel'],
    description: row.description != null ? String(row.description) : undefined,
    color: row.color != null ? String(row.color) : undefined,
    isSystem: Boolean(row.is_system ?? row.isSystem),
    createdAt: row.created_at != null ? String(row.created_at) : row.createdAt != null ? String(row.createdAt) : undefined,
  };
}

function roleToDb(role: AppRole): Record<string, unknown> {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    panel: role.panel,
    description: role.description ?? null,
    color: role.color ?? null,
    is_system: role.isSystem,
    created_at: role.createdAt ?? new Date().toISOString(),
  };
}

export function loadRolesLocal(): AppRole[] {
  const stored = loadJSON<AppRole[]>(ROLES_KEY, []);
  if (stored.length > 0) return stored;
  return SYSTEM_ROLE_SEEDS.map((r) => ({ ...r, createdAt: new Date().toISOString() }));
}

export function loadRolePermissionsLocal(): RolePermissionMap {
  const stored = loadJSON<RolePermissionMap>(PERMS_KEY, {});
  if (Object.keys(stored).length > 0) return stored;
  return buildDefaultRolePermissionMap();
}

export function saveRolesLocal(roles: AppRole[]) {
  saveJSON(ROLES_KEY, roles);
}

export function saveRolePermissionsLocal(map: RolePermissionMap) {
  saveJSON(PERMS_KEY, map);
}

export async function fetchRolesFromSupabase(): Promise<{ roles: AppRole[]; permissions: RolePermissionMap } | null> {
  const sb = getRolesClient();
  if (!sb) return null;

  const [rolesRes, permsRes] = await Promise.all([
    sb.from('app_roles').select('*').order('created_at', { ascending: true }),
    sb.from('app_role_permissions').select('role_id, perm_key'),
  ]);

  if (rolesRes.error) {
    console.error('[roles] app_roles load failed:', rolesRes.error.message);
    return null;
  }

  if (permsRes.error) {
    console.error('[roles] app_role_permissions load failed:', permsRes.error.message);
    return null;
  }

  const roles = (rolesRes.data as Record<string, unknown>[]).map(dbToRole);
  const permissions: RolePermissionMap = {};
  const permRows = (permsRes.data ?? []) as { role_id: string; perm_key: string }[];

  for (const row of permRows) {
    if (!permissions[row.role_id]) permissions[row.role_id] = [];
    permissions[row.role_id].push(row.perm_key);
  }

  for (const role of roles) {
    const hasDbRows = permRows.some((r) => r.role_id === role.id);
    if (hasDbRows) {
      if (!permissions[role.id]) permissions[role.id] = [];
    } else if (role.isSystem) {
      permissions[role.id] = defaultPermissionsForRole(role.slug);
    } else {
      permissions[role.id] = [];
    }
  }

  return { roles, permissions };
}

export async function persistRoleToSupabase(role: AppRole): Promise<{ ok: boolean; error?: string }> {
  const sb = getRolesClient();
  if (!sb) return { ok: false, error: 'Supabase bağlantısı yok' };

  const { error } = await sb.from('app_roles').upsert(roleToDb(role));
  if (error) {
    console.error('[roles] upsert failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteRoleFromSupabase(roleId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getRolesClient();
  if (!sb) return { ok: false, error: 'Supabase bağlantısı yok' };

  const { error } = await sb.from('app_roles').delete().eq('id', roleId);
  if (error) {
    console.error('[roles] delete failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function persistRolePermissionsToSupabase(
  roleId: string,
  permKeys: string[],
): Promise<{ ok: boolean; error?: string }> {
  const sb = getRolesClient();
  if (!sb) return { ok: false, error: 'Supabase bağlantısı yok' };

  const { error: delErr } = await sb.from('app_role_permissions').delete().eq('role_id', roleId);
  if (delErr) {
    console.error('[roles] perm delete failed:', delErr.message);
    return { ok: false, error: delErr.message };
  }

  if (permKeys.length === 0) return { ok: true };

  const rows = permKeys.map((perm_key) => ({ role_id: roleId, perm_key }));
  const { error } = await sb.from('app_role_permissions').insert(rows);
  if (error) {
    console.error('[roles] perm insert failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function seedSystemRolesIfEmpty(): Promise<void> {
  const sb = getRolesClient();
  if (!sb) return;

  const { count, error } = await sb.from('app_roles').select('*', { count: 'exact', head: true });
  if (error || (count ?? 0) > 0) return;

  const now = new Date().toISOString();
  const roles = SYSTEM_ROLE_SEEDS.map((r) => ({ ...r, createdAt: now }));
  for (const role of roles) {
    await sb.from('app_roles').insert(roleToDb(role));
    await persistRolePermissionsToSupabase(role.id, defaultPermissionsForRole(role.slug));
  }
}

export function generateRoleId(): string {
  return `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function slugifyRoleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
