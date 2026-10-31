import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import type { ParentPanelNotification, NotificationEvent } from './notificationEvents';

const STORAGE_KEY = 'netchess_parent_panel_notifications';
const TABLE = 'parent_panel_notifications';
const MAX_PER_STUDENT = 200;

function client() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

function loadAll(): ParentPanelNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ParentPanelNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(rows: ParentPanelNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_PER_STUDENT * 50)));
  } catch { /* quota */ }
}

function genId(): string {
  return `pn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowToNotification(row: Record<string, unknown>): ParentPanelNotification {
  return {
    id: String(row.id ?? ''),
    studentId: String(row.student_id ?? ''),
    event: String(row.event ?? 'lesson_absent') as NotificationEvent,
    title: String(row.title ?? 'Bildirim'),
    body: String(row.body ?? ''),
    branchOffice: row.branch_office ? String(row.branch_office) : undefined,
    read: Boolean(row.read_at),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mergeById(a: ParentPanelNotification[], b: ParentPanelNotification[]): ParentPanelNotification[] {
  const byId = new Map<string, ParentPanelNotification>();
  for (const n of [...b, ...a]) {
    if (!n.id) continue;
    const prev = byId.get(n.id);
    byId.set(n.id, prev ? { ...n, read: prev.read || n.read } : n);
  }
  return [...byId.values()].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
}

export function listParentPanelNotificationsLocal(studentId: string): ParentPanelNotification[] {
  const sid = String(studentId ?? '').trim();
  if (!sid) return [];
  return loadAll()
    .filter((n) => n.studentId === sid)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function countUnreadParentPanelNotifications(studentId: string): number {
  return listParentPanelNotificationsLocal(studentId).filter((n) => !n.read).length;
}

export function pushParentPanelNotificationLocal(entry: Omit<ParentPanelNotification, 'id' | 'read'> & { id?: string }) {
  const all = loadAll();
  const row: ParentPanelNotification = {
    id: entry.id || genId(),
    studentId: entry.studentId,
    event: entry.event,
    title: entry.title,
    body: entry.body,
    branchOffice: entry.branchOffice,
    read: false,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
  all.unshift(row);
  saveAll(all.slice(0, MAX_PER_STUDENT * 50));
  return row;
}

export function markParentPanelNotificationReadLocal(id: string, studentId: string) {
  const all = loadAll();
  let changed = false;
  const next = all.map((n) => {
    if (n.id !== id || n.studentId !== studentId) return n;
    changed = true;
    return { ...n, read: true };
  });
  if (changed) saveAll(next);
}

export function markAllParentPanelNotificationsReadLocal(studentId: string) {
  const all = loadAll();
  const next = all.map((n) => (n.studentId === studentId ? { ...n, read: true } : n));
  saveAll(next);
}

async function fetchParentPanelNotificationsSupabase(
  studentId: string,
  limit = 80,
): Promise<ParentPanelNotification[] | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('id, student_id, event, title, body, branch_office, read_at, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[parent-notifications] load failed:', error.message);
      return null;
    }
    return (data ?? []).map((row) => rowToNotification(row as Record<string, unknown>));
  } catch (e) {
    console.warn('[parent-notifications] load failed:', e);
    return null;
  }
}

export async function fetchParentPanelNotificationsRemote(
  studentId: string,
  limit = 80,
): Promise<ParentPanelNotification[] | null> {
  const fromDb = await fetchParentPanelNotificationsSupabase(studentId, limit);
  if (fromDb) return fromDb;
  try {
    const res = await fetch('/api/whatsapp?action=parent-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'parent-notifications', studentId, limit }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { notifications?: ParentPanelNotification[] };
    return Array.isArray(data.notifications) ? data.notifications : [];
  } catch {
    return null;
  }
}

async function persistParentPanelNotificationSupabase(notification: ParentPanelNotification): Promise<boolean> {
  const sb = client();
  if (!sb) return false;
  try {
    const { error } = await sb.from(TABLE).upsert(
      {
        id: notification.id,
        student_id: notification.studentId,
        event: notification.event,
        title: notification.title,
        body: notification.body,
        branch_office: notification.branchOffice ?? null,
        read_at: notification.read ? new Date().toISOString() : null,
        created_at: notification.createdAt,
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.warn('[parent-notifications] save failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[parent-notifications] save failed:', e);
    return false;
  }
}

export async function persistParentPanelNotificationRemote(
  notification: ParentPanelNotification,
): Promise<boolean> {
  if (await persistParentPanelNotificationSupabase(notification)) return true;
  try {
    const res = await fetch('/api/whatsapp?action=parent-notifications-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'parent-notifications-create', notification }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listParentPanelNotifications(
  studentId: string,
): Promise<ParentPanelNotification[]> {
  const remote = await fetchParentPanelNotificationsRemote(studentId);
  const local = listParentPanelNotificationsLocal(studentId);
  const merged = remote ? mergeById(remote, local) : local;
  if (remote?.length) {
    const others = loadAll().filter((n) => n.studentId !== studentId);
    saveAll([...merged, ...others]);
  }
  return merged;
}

export async function createParentPanelNotification(input: {
  studentId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  branchOffice?: string;
}): Promise<ParentPanelNotification> {
  const row = pushParentPanelNotificationLocal({
    studentId: input.studentId,
    event: input.event,
    title: input.title,
    body: input.body,
    branchOffice: input.branchOffice,
    createdAt: new Date().toISOString(),
  });
  await persistParentPanelNotificationRemote(row);
  return row;
}

export async function markParentPanelNotificationRead(id: string, studentId: string): Promise<void> {
  markParentPanelNotificationReadLocal(id, studentId);
  const sb = client();
  if (sb) {
    try {
      await sb.from(TABLE).update({ read_at: new Date().toISOString() }).eq('id', id).eq('student_id', studentId);
    } catch { /* ignore */ }
    return;
  }
  const local = listParentPanelNotificationsLocal(studentId).find((n) => n.id === id);
  if (local) await persistParentPanelNotificationRemote({ ...local, read: true });
}

export async function markAllParentPanelNotificationsRead(studentId: string): Promise<void> {
  markAllParentPanelNotificationsReadLocal(studentId);
  const sb = client();
  if (!sb) return;
  try {
    await sb
      .from(TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .is('read_at', null);
  } catch { /* ignore */ }
}
