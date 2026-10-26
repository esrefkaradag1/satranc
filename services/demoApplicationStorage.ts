import type { DemoApplication, DemoApplicationStatus } from '../lib/demoApplicationTypes';
import { DEMO_APPLICATIONS_UPDATED_EVENT } from '../lib/demoApplicationTypes';
import { formatPersonName } from '../lib/personNameUtils';
import { getServiceSupabase, isSupabaseBackend, supabase } from './supabase';

const TABLE = 'demo_applications';
const LOCAL_KEY = 'netchess_demo_applications_v1';

function notifyUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DEMO_APPLICATIONS_UPDATED_EVENT));
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeDemoPhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

export function formatDemoPhone(phone: string): string {
  const digits = normalizeDemoPhone(phone);
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 10) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  }
  return phone.trim();
}

function readLocal(): DemoApplication[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DemoApplication[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: DemoApplication[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

function upsertLocal(app: DemoApplication) {
  const local = readLocal();
  const idx = local.findIndex((a) => a.id === app.id);
  writeLocal(idx >= 0 ? local.map((a) => (a.id === app.id ? app : a)) : [app, ...local]);
}

function rowToApp(row: Record<string, unknown>): DemoApplication {
  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  return {
    id: String(row.id ?? data.id ?? ''),
    applicationNo: String(row.application_no ?? data.applicationNo ?? ''),
    status: (row.status ?? data.status ?? 'pending') as DemoApplicationStatus,
    clubName: String(row.club_name ?? data.clubName ?? ''),
    contactPerson: String(row.contact_person ?? data.contactPerson ?? ''),
    phone: String(row.phone ?? data.phone ?? ''),
    clientIp: data.clientIp != null ? String(data.clientIp) : undefined,
    clubId: data.clubId != null ? String(data.clubId) : undefined,
    coachId: data.coachId != null ? String(data.coachId) : undefined,
    clubUsername: data.clubUsername != null ? String(data.clubUsername) : undefined,
    createdAt: String(row.created_at ?? data.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? data.updatedAt ?? ''),
    approvedAt: data.approvedAt != null ? String(data.approvedAt) : undefined,
  };
}

function appToRow(app: DemoApplication): Record<string, unknown> {
  return {
    id: app.id,
    application_no: app.applicationNo,
    status: app.status,
    club_name: app.clubName,
    contact_person: app.contactPerson,
    phone: app.phone,
    data: app,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

function client() {
  return getServiceSupabase() ?? supabase;
}

async function countForYear(year: number): Promise<number> {
  if (!isSupabaseBackend()) {
    return readLocal().filter((a) => a.applicationNo.startsWith(`D-${year}-`)).length;
  }
  try {
    const { count, error } = await client()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .like('application_no', `D-${year}-%`);
    if (!error && count != null) return count;
  } catch {
    /* yedek */
  }
  return readLocal().filter((a) => a.applicationNo.startsWith(`D-${year}-`)).length;
}

export async function saveDemoApplicationAsync(app: DemoApplication): Promise<void> {
  upsertLocal(app);
  notifyUpdated();
  if (!isSupabaseBackend()) return;
  try {
    const { error } = await client().from(TABLE).upsert(appToRow(app));
    if (error) console.warn('[DemoApplications] save:', error.message);
  } catch (e) {
    console.warn('[DemoApplications] save failed:', e);
  }
}

export async function loadDemoApplicationsListAsync(): Promise<DemoApplication[]> {
  const local = readLocal();
  if (!isSupabaseBackend()) return local;
  try {
    const { data, error } = await client()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return local;
    const list = (data as Record<string, unknown>[]).map(rowToApp);
    writeLocal(list);
    return list;
  } catch {
    return local;
  }
}

export async function createDemoApplicationAsync(input: {
  clubName: string;
  contactPerson: string;
  phone: string;
  clientIp?: string;
}): Promise<DemoApplication> {
  const clubName = input.clubName.trim();
  const contactPerson = formatPersonName(input.contactPerson);
  const phone = normalizeDemoPhone(input.phone);
  if (!clubName || !contactPerson || phone.length < 10) {
    throw new Error('Kulüp, yetkili ve geçerli telefon zorunludur.');
  }

  const localDup = readLocal().find(
    (a) => a.status === 'pending' && normalizeDemoPhone(a.phone) === phone,
  );
  if (localDup) return localDup;

  if (isSupabaseBackend()) {
    try {
      const { data } = await client()
        .from(TABLE)
        .select('*')
        .eq('phone', phone)
        .eq('status', 'pending')
        .limit(1);
      if (data && data.length > 0) {
        const app = rowToApp(data[0] as Record<string, unknown>);
        upsertLocal(app);
        return app;
      }
    } catch {
      /* yeni kayıt */
    }
  }

  const year = new Date().getFullYear();
  const seq = (await countForYear(year)) + 1;
  const now = new Date().toISOString();
  const app: DemoApplication = {
    id: genId(),
    applicationNo: `D-${year}-${String(seq).padStart(4, '0')}`,
    status: 'pending',
    clubName,
    contactPerson,
    phone,
    clientIp: input.clientIp?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await saveDemoApplicationAsync(app);
  return app;
}

export async function updateDemoApplicationAsync(
  id: string,
  patch: Partial<DemoApplication>,
): Promise<DemoApplication | null> {
  const list = await loadDemoApplicationsListAsync();
  const found = list.find((a) => a.id === id);
  if (!found) return null;
  const updated: DemoApplication = {
    ...found,
    ...patch,
    id: found.id,
    applicationNo: found.applicationNo,
    createdAt: found.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await saveDemoApplicationAsync(updated);
  return updated;
}

export async function deleteDemoApplicationAsync(id: string): Promise<void> {
  writeLocal(readLocal().filter((a) => a.id !== id));
  notifyUpdated();
  if (!isSupabaseBackend()) return;
  try {
    const { error } = await client().from(TABLE).delete().eq('id', id);
    if (error) console.warn('[DemoApplications] delete:', error.message);
  } catch (e) {
    console.warn('[DemoApplications] delete failed:', e);
  }
}
