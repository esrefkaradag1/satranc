import type { StudentApplication, ApplicationStatus } from '../lib/applicationTypes';
import type { Student } from '../types';
import { canWriteSupabase, getServiceSupabase, isSupabaseBackend, supabase } from './supabase';

const TABLE = 'student_applications';
const LOCAL_KEY = 'netchess_student_applications_v1';
export const APPLICATIONS_UPDATED_EVENT = 'netchess-applications-updated';

function notifyApplicationsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(APPLICATIONS_UPDATED_EVENT));
}

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readLocal(): StudentApplication[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StudentApplication[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: StudentApplication[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* quota */
  }
}

function upsertLocalApplication(app: StudentApplication) {
  const local = readLocal();
  const idx = local.findIndex((a) => a.id === app.id);
  const next = idx >= 0 ? local.map((a) => (a.id === app.id ? app : a)) : [app, ...local];
  writeLocal(next);
}

function rowToApp(row: Record<string, unknown>): StudentApplication {
  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : row;
  return {
    id: String(row.id ?? data.id ?? ''),
    applicationNo: String(row.application_no ?? data.applicationNo ?? ''),
    status: (row.status ?? data.status ?? 'pending') as ApplicationStatus,
    branchOffice: String(data.branchOffice ?? ''),
    group: String(data.group ?? ''),
    tcNo: String(data.tcNo ?? ''),
    name: String(data.name ?? ''),
    birthDate: String(data.birthDate ?? ''),
    photoDataUrl: data.photoDataUrl != null ? String(data.photoDataUrl) : null,
    lichessUsername: String(data.lichessUsername ?? ''),
    chessComUsername: String(data.chessComUsername ?? ''),
    school: String(data.school ?? ''),
    teacher: String(data.teacher ?? ''),
    notes: String(data.notes ?? ''),
    healthInfo: String(data.healthInfo ?? ''),
    fatherName: String(data.fatherName ?? ''),
    fatherPhone: String(data.fatherPhone ?? ''),
    fatherJob: String(data.fatherJob ?? ''),
    motherName: String(data.motherName ?? ''),
    motherPhone: String(data.motherPhone ?? ''),
    motherJob: String(data.motherJob ?? ''),
    address: String(data.address ?? ''),
    phones: Array.isArray(data.phones) ? (data.phones as string[]) : [],
    kvkkAccepted: Boolean(data.kvkkAccepted),
    kvkkAcceptedAt: String(data.kvkkAcceptedAt ?? ''),
    clientIp: String(data.clientIp ?? ''),
    signatureDataUrl: String(data.signatureDataUrl ?? ''),
    signatureName: String(data.signatureName ?? ''),
    signedAt: String(data.signedAt ?? ''),
    registrarSignatureDataUrl: data.registrarSignatureDataUrl != null ? String(data.registrarSignatureDataUrl) : undefined,
    registrarSignatureName: data.registrarSignatureName != null ? String(data.registrarSignatureName) : undefined,
    studentId: data.studentId != null ? String(data.studentId) : undefined,
    source: data.source as StudentApplication['source'],
    inviteToken: data.inviteToken != null ? String(data.inviteToken) : undefined,
    createdAt: String(row.created_at ?? data.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? data.updatedAt ?? ''),
  };
}

function appToRow(app: StudentApplication): Record<string, unknown> {
  return {
    id: app.id,
    application_no: app.applicationNo,
    status: app.status,
    data: app,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

export function getApplicationFormUrl(): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  return `${base}#/basvuru`;
}

export function getParentConsentFormUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  return `${base}#/veli-imza/${encodeURIComponent(token)}`;
}

function studentToConsentDraft(student: Student) {
  const phones = [
    ...(student.contactNumbers ?? []),
    student.fatherPhone,
 student.motherPhone,
    student.parentPhone,
  ]
    .map((p) => String(p ?? '').replace(/\D/g, ''))
    .filter(Boolean);
  const uniquePhones = [...new Set(phones)];
  return {
    branchOffice: student.branchOffice ?? '',
    group: student.group ?? '',
    tcNo: student.tcNo ?? '',
    name: student.name,
    birthDate: student.birthDate ?? '',
    photoDataUrl:
      student.photoUrl?.startsWith('http') || student.photoUrl?.startsWith('data:')
        ? student.photoUrl
        : null,
    lichessUsername: student.lichessUsername ?? '',
    chessComUsername: student.chessComUsername ?? '',
    school: student.school ?? '',
    teacher: student.teacher ?? '',
    notes: student.notes ?? '',
    healthInfo: student.healthInfo ?? '',
    fatherName: student.fatherName ?? '',
    fatherPhone: student.fatherPhone ?? student.parentPhone ?? '',
    fatherJob: student.fatherJob ?? '',
    motherName: student.motherName ?? '',
    motherPhone: student.motherPhone ?? '',
    motherJob: student.motherJob ?? '',
    address: student.address ?? '',
    phones: uniquePhones,
    kvkkAccepted: false,
    kvkkAcceptedAt: '',
    clientIp: '',
    signatureDataUrl: '',
    signatureName: '',
    signedAt: '',
    studentId: student.id,
    source: 'admin_student' as const,
  };
}

/**
 * Admin öğrenci ekleme: temsilci imzası kaydedilir, veli imzası için davet oluşturulur.
 * Veli imzası `signatureDataUrl` alanına veli-imza formundan yazılır.
 */
export async function createSignedApplicationFromAdminAsync(
  student: Student,
  signature: {
    signatureDataUrl: string;
    signatureName: string;
    kvkkAccepted?: boolean;
    clientIp?: string;
  }
): Promise<{ token: string; url: string; application: StudentApplication }> {
  const token =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const app = await createApplicationAsync({
    ...studentToConsentDraft(student),
    inviteToken: token,
    registrarSignatureDataUrl: signature.signatureDataUrl,
    registrarSignatureName: signature.signatureName,
    signatureDataUrl: '',
    signatureName: '',
    signedAt: '',
    kvkkAccepted: false,
    kvkkAcceptedAt: '',
    clientIp: signature.clientIp ?? '',
    status: 'pending',
  });
  return { token, url: getParentConsentFormUrl(token), application: app };
}

/** Admin tarafından eklenen öğrenci için veli imza daveti (varsa mevcut bekleyeni döner) */
export async function getOrCreateParentConsentInviteAsync(
  student: Student
): Promise<{ token: string; url: string; application: StudentApplication }> {
  const list = await loadApplicationsAsync();
  const pending = list.find(
    (a) =>
      a.studentId === student.id &&
      a.source === 'admin_student' &&
      !a.signatureDataUrl?.trim()
  );
  if (pending?.inviteToken) {
    return {
      token: pending.inviteToken,
      url: getParentConsentFormUrl(pending.inviteToken),
      application: pending,
    };
  }
  const token =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const app = await createApplicationAsync({
    ...studentToConsentDraft(student),
    inviteToken: token,
  });
  return { token, url: getParentConsentFormUrl(token), application: app };
}

export async function loadApplicationByInviteToken(
  token: string
): Promise<StudentApplication | null> {
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`/api/load-parent-consent?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const json = (await res.json()) as { application?: StudentApplication };
        if (json.application) {
          upsertLocalApplication(json.application);
          return json.application;
        }
      }
    } catch {
      /* API yoksa yerel/anon yedek */
    }
  }
  const list = await loadApplicationsAsync();
  return list.find((a) => a.inviteToken === token) ?? null;
}

export async function submitParentSignatureAsync(
  token: string,
  data: {
    signatureDataUrl: string;
    signatureName: string;
    kvkkAccepted: boolean;
    clientIp?: string;
  }
): Promise<StudentApplication | null> {
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/submit-parent-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...data }),
      });
      const json = (await res.json()) as { application?: StudentApplication; error?: string };
      if (res.ok && json.application) {
        upsertLocalApplication(json.application);
        notifyApplicationsUpdated();
        return json.application;
      }
      if (!res.ok) {
        console.warn('[Applications] parent signature API:', json.error ?? res.status);
      }
    } catch (e) {
      console.warn('[Applications] parent signature API failed:', e);
    }
  }

  const found = await loadApplicationByInviteToken(token);
  if (!found) return null;
  if (found.signatureDataUrl?.trim()) return found;
  const updated: StudentApplication = {
    ...found,
    signatureDataUrl: data.signatureDataUrl,
    signatureName: data.signatureName,
    signedAt: new Date().toISOString(),
    kvkkAccepted: data.kvkkAccepted,
    kvkkAcceptedAt: new Date().toISOString(),
    clientIp: data.clientIp ?? found.clientIp,
    status: 'signed',
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveApplicationAsync(updated);
  if (saved) notifyApplicationsUpdated();
  return saved ? updated : null;
}

export async function loadSignedApplicationsByStudentId(
  studentId: string
): Promise<StudentApplication[]> {
  const list = await loadApplicationsAsync();
  return list.filter(
    (a) => a.studentId === studentId && !!a.signatureDataUrl?.trim()
  );
}

/** Öğrenciye bağlı tüm başvurular (imzalı + bekleyen) */
export async function loadApplicationsByStudentId(
  studentId: string
): Promise<StudentApplication[]> {
  const list = await loadApplicationsAsync();
  return list
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/** Kayıtlı başvuru yoksa öğrenci bilgilerinden form önizlemesi */
export function buildApplicationPreviewFromStudent(student: Student): StudentApplication {
  const now = new Date().toISOString();
  const draft = studentToConsentDraft(student);
  return {
    ...draft,
    id: `preview-${student.id}`,
    applicationNo: 'Kayıt Formu',
    status: 'pending',
    createdAt: student.registrationDate ?? now,
    updatedAt: now,
  };
}

export async function loadApplicationsAsync(): Promise<StudentApplication[]> {
  if (isSupabaseBackend()) {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[Applications] load error:', error.message);
        return readLocal();
      }
      const list = (data ?? []).map((r) => rowToApp(r as Record<string, unknown>));
      writeLocal(list);
      return list;
    } catch (e) {
      console.warn('[Applications] load failed:', e);
      return readLocal();
    }
  }
  return readLocal();
}

export async function saveApplicationAsync(app: StudentApplication): Promise<boolean> {
  upsertLocalApplication(app);

  if (!isSupabaseBackend()) return true;
  try {
    const client = getServiceSupabase() ?? supabase;
    const { error } = await client.from(TABLE).upsert(appToRow(app), { onConflict: 'id' });
    if (error) {
      console.warn('[Applications] save error:', error.message);
      return !canWriteSupabase();
    }
    notifyApplicationsUpdated();
    return true;
  } catch (e) {
    console.warn('[Applications] save failed:', e);
    return !canWriteSupabase();
  }
}

export async function deleteApplicationAsync(id: string): Promise<void> {
  writeLocal(readLocal().filter((a) => a.id !== id));
  if (!isSupabaseBackend()) return;
  try {
    const client = getServiceSupabase() ?? supabase;
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) console.warn('[Applications] delete error:', error.message);
  } catch (e) {
    console.warn('[Applications] delete failed:', e);
  }
}

export async function createApplicationAsync(
  input: Omit<StudentApplication, 'id' | 'applicationNo' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<StudentApplication> {
  const existing = await loadApplicationsAsync();
  const year = new Date().getFullYear();
  const seq = existing.filter((a) => a.applicationNo.startsWith(`B-${year}-`)).length + 1;
  const now = new Date().toISOString();
  const app: StudentApplication = {
    ...input,
    id: genId(),
    applicationNo: `B-${year}-${String(seq).padStart(4, '0')}`,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await saveApplicationAsync(app);
  return app;
}

export async function updateApplicationStatusAsync(
  id: string,
  status: ApplicationStatus
): Promise<StudentApplication | null> {
  const list = await loadApplicationsAsync();
  const found = list.find((a) => a.id === id);
  if (!found) return null;
  const updated: StudentApplication = {
    ...found,
    status,
    updatedAt: new Date().toISOString(),
  };
  await saveApplicationAsync(updated);
  return updated;
}

/** Basit IP — harici servis yoksa boş */
export async function fetchClientIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return '';
    const j = (await res.json()) as { ip?: string };
    return j.ip ?? '';
  } catch {
    return '';
  }
}
