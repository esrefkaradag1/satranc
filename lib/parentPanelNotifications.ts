import type { ParentPanelNotification, NotificationEvent } from './notificationEvents';

const STORAGE_KEY = 'netchess_parent_panel_notifications';
const MAX_PER_STUDENT = 200;

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
  const trimmed = all.slice(0, MAX_PER_STUDENT * 50);
  saveAll(trimmed);
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

export async function fetchParentPanelNotificationsRemote(
  studentId: string,
  limit = 80,
): Promise<ParentPanelNotification[] | null> {
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

export async function persistParentPanelNotificationRemote(
  notification: ParentPanelNotification,
): Promise<boolean> {
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
  if (!remote?.length) return local;
  const byId = new Map<string, ParentPanelNotification>();
  for (const n of [...remote, ...local]) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createParentPanelNotification(input: {
  studentId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  branchOffice?: string;
}): ParentPanelNotification {
  const row = pushParentPanelNotificationLocal({
    studentId: input.studentId,
    event: input.event,
    title: input.title,
    body: input.body,
    branchOffice: input.branchOffice,
    createdAt: new Date().toISOString(),
  });
  void persistParentPanelNotificationRemote(row);
  return row;
}
