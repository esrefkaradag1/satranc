import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import { fetchSiteMessages, insertSiteMessage } from './siteMessagesDb.mjs';

export type SiteConversationKind = 'parent' | 'group' | 'student';

export type SiteMessageSenderRole = 'admin' | 'coach' | 'parent' | 'student';

export type SiteMessage = {
  id: string;
  conversationId: string;
  kind: SiteConversationKind;
  targetStudentId?: string;
  targetGroup?: string;
  senderRole: SiteMessageSenderRole;
  senderName: string;
  text: string;
  createdAt: string;
};

const STORAGE_KEY = 'chess_site_messages_v1';
const UPDATE_EVENT = 'site-messages-updated';

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseMessage(raw: unknown): SiteMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  const conversationId = String(o.conversationId ?? o.conversation_id ?? '').trim();
  const text = String(o.text ?? '').trim();
  const createdAt = String(o.createdAt ?? o.created_at ?? '').trim();
  const kind =
    o.kind === 'group' ? 'group' : o.kind === 'parent' ? 'parent' : o.kind === 'student' ? 'student' : null;
  const senderRole = o.senderRole ?? o.sender_role;
  if (!id || !conversationId || !text || !createdAt || !kind) return null;
  if (senderRole !== 'admin' && senderRole !== 'coach' && senderRole !== 'parent' && senderRole !== 'student') {
    return null;
  }
  return {
    id,
    conversationId,
    kind,
    targetStudentId: o.targetStudentId
      ? String(o.targetStudentId)
      : o.target_student_id
        ? String(o.target_student_id)
        : undefined,
    targetGroup: o.targetGroup ? String(o.targetGroup) : o.target_group ? String(o.target_group) : undefined,
    senderRole,
    senderName: String(o.senderName ?? o.sender_name ?? 'Kullanıcı').trim() || 'Kullanıcı',
    text: text.slice(0, 2000),
    createdAt,
  };
}

function readLocalMessages(): SiteMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseMessage).filter((m): m is SiteMessage => !!m);
  } catch {
    return [];
  }
}

function writeLocalMessages(messages: SiteMessage[]) {
  if (typeof window === 'undefined') return;
  const trimmed = messages
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-5000);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

function mergeMessages(...lists: SiteMessage[][]): SiteMessage[] {
  const map = new Map<string, SiteMessage>();
  for (const list of lists) {
    for (const m of list) map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function rowToMessage(row: Record<string, unknown>): SiteMessage | null {
  return parseMessage({
    id: row.id,
    conversation_id: row.conversation_id,
    kind: row.kind,
    target_student_id: row.target_student_id,
    target_group: row.target_group,
    sender_role: row.sender_role,
    sender_name: row.sender_name,
    text: row.text,
    created_at: row.created_at,
  });
}

let supabaseTableMissing = false;
let remoteProbeDone = false;

export function isSiteMessagesRemoteUnavailable(): boolean {
  return supabaseTableMissing;
}

export function resetSiteMessagesRemoteProbe(): void {
  supabaseTableMissing = false;
  remoteProbeDone = false;
}

function rowsToMessages(rows: unknown[]): SiteMessage[] {
  return rows
    .map((row) => rowToMessage(row as Record<string, unknown>))
    .filter((m): m is SiteMessage => !!m);
}

async function fetchViaApi(conversationId?: string): Promise<SiteMessage[] | null> {
  if (supabaseTableMissing) return null;
  try {
    const q = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    const res = await fetch(`/api/site-messages${q}`);
    const body = (await res.json().catch(() => ({}))) as { messages?: unknown[]; missingTable?: boolean };
    if (body.missingTable) {
      supabaseTableMissing = true;
      remoteProbeDone = true;
    }
    if (!res.ok || !Array.isArray(body.messages)) return null;
    remoteProbeDone = true;
    return rowsToMessages(body.messages);
  } catch {
    return null;
  }
}

async function persistViaApi(message: SiteMessage): Promise<boolean> {
  if (supabaseTableMissing) return false;
  try {
    const res = await fetch('/api/site-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const body = (await res.json().catch(() => ({}))) as { missingTable?: boolean; error?: string };
    if (body.missingTable) {
      supabaseTableMissing = true;
      remoteProbeDone = true;
    }
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchSupabaseMessages(conversationId?: string): Promise<SiteMessage[] | null> {
  if (!isSupabaseBackend()) return null;
  if (supabaseTableMissing) return null;

  const client = getServiceSupabase() ?? supabase;
  const result = await fetchSiteMessages(client, conversationId);
  if (result.ok) {
    remoteProbeDone = true;
    return rowsToMessages(result.messages);
  }
  if (result.missingTable) {
    supabaseTableMissing = true;
    remoteProbeDone = true;
    return null;
  }
  return fetchViaApi(conversationId);
}

async function insertSupabaseMessage(message: SiteMessage): Promise<boolean> {
  if (!isSupabaseBackend()) return false;
  if (supabaseTableMissing) return false;

  const client = getServiceSupabase() ?? supabase;
  const result = await insertSiteMessage(client, message);
  if (result.ok) {
    remoteProbeDone = true;
    return true;
  }
  if (result.missingTable) {
    supabaseTableMissing = true;
    return false;
  }
  return persistViaApi(message);
}

export function parentConversationId(studentId: string): string {
  return `parent:${String(studentId).trim()}`;
}

export function studentConversationId(studentId: string): string {
  return `student:${String(studentId).trim()}`;
}

export function groupConversationId(groupName: string): string {
  return `group:${encodeURIComponent(groupName.trim())}`;
}

export function decodeGroupConversationId(conversationId: string): string {
  const prefix = 'group:';
  if (!conversationId.startsWith(prefix)) return '';
  try {
    return decodeURIComponent(conversationId.slice(prefix.length));
  } catch {
    return conversationId.slice(prefix.length);
  }
}

export async function listSiteMessages(conversationId: string): Promise<SiteMessage[]> {
  const local = readLocalMessages().filter((m) => m.conversationId === conversationId);
  const remote = await fetchSupabaseMessages(conversationId);
  if (remote === null) return local;
  const merged = mergeMessages(local, remote);
  const others = readLocalMessages().filter((m) => m.conversationId !== conversationId);
  writeLocalMessages([...others, ...merged]);
  return merged;
}

export async function listAllSiteMessages(): Promise<SiteMessage[]> {
  const local = readLocalMessages();
  const remote = await fetchSupabaseMessages();
  if (remote === null) return local;
  const merged = mergeMessages(local, remote);
  writeLocalMessages(merged);
  return merged;
}

export type SendSiteMessageInput = {
  conversationId: string;
  kind: SiteConversationKind;
  targetStudentId?: string;
  targetGroup?: string;
  senderRole: SiteMessageSenderRole;
  senderName: string;
  text: string;
};

export type SendSiteMessageResult = {
  message: SiteMessage;
  /** Sunucuya (Supabase/API) yazıldı mı — false ise yalnızca bu cihazda görünür */
  synced: boolean;
};

export async function sendSiteMessage(input: SendSiteMessageInput): Promise<SendSiteMessageResult | null> {
  const text = input.text.trim().slice(0, 2000);
  if (!text) return null;
  const message: SiteMessage = {
    id: genId(),
    conversationId: input.conversationId,
    kind: input.kind,
    targetStudentId: input.targetStudentId,
    targetGroup: input.targetGroup,
    senderRole: input.senderRole,
    senderName: input.senderName.trim() || 'Kullanıcı',
    text,
    createdAt: new Date().toISOString(),
  };
  const all = [...readLocalMessages(), message];
  writeLocalMessages(all);
  const synced = isSupabaseBackend() ? await insertSupabaseMessage(message) : true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
  return { message, synced };
}

export function formatSiteMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function formatSiteMessageDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Bugün';
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return 'Bugün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function subscribeSiteMessages(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onUpdate();
  };
  const onCustom = () => onUpdate();
  window.addEventListener('storage', onStorage);
  window.addEventListener(UPDATE_EVENT, onCustom);
  const interval = window.setInterval(() => {
    if (supabaseTableMissing && remoteProbeDone) return;
    onUpdate();
  }, supabaseTableMissing ? 30000 : 2000);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UPDATE_EVENT, onCustom);
    window.clearInterval(interval);
  };
}

export function isOutgoingSiteMessage(
  message: SiteMessage,
  viewerRole: SiteMessageSenderRole,
): boolean {
  if (viewerRole === 'admin' || viewerRole === 'coach') {
    return message.senderRole === 'admin' || message.senderRole === 'coach';
  }
  return message.senderRole === 'parent' || message.senderRole === 'student';
}
