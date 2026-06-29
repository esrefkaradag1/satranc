import type { StudentApplication, ApplicationStatus } from '../lib/applicationTypes';
import type { Student } from '../types';
import { isDisplayablePhotoUrl } from '../lib/studentPhotoUpload';
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
  const listName = row.app_name ?? row.appName;
  const fromListCols = listName != null && String(listName).trim() !== '';
  const data = fromListCols
    ? {
        name: row.app_name,
        tcNo: row.app_tc_no,
        branchOffice: row.app_branch_office,
        group: row.app_group,
        birthDate: row.app_birth_date,
        clubId: row.app_club_id,
        studentId: row.app_student_id,
        fatherPhone: row.app_father_phone,
        motherPhone: row.app_mother_phone,
        hasPhoto: row.has_photo,
        hasSignature: row.has_signature,
      }
    : row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : row;
  const hasPhoto = data.hasPhoto === true || data.hasPhoto === 'true';
  const hasSignature = data.hasSignature === true || data.hasSignature === 'true';
  const fatherPhone = String(data.fatherPhone ?? '');
  const motherPhone = String(data.motherPhone ?? '');
  const phones = Array.isArray(data.phones)
    ? (data.phones as string[])
    : [fatherPhone, motherPhone].map((p) => p.trim()).filter(Boolean);
  return {
    id: String(row.id ?? data.id ?? ''),
    applicationNo: String(row.application_no ?? data.applicationNo ?? ''),
    status: (row.status ?? data.status ?? 'pending') as ApplicationStatus,
    branchOffice: String(data.branchOffice ?? ''),
    group: String(data.group ?? ''),
    tcNo: String(data.tcNo ?? ''),
    name: String(data.name ?? ''),
    birthDate: String(data.birthDate ?? ''),
    photoDataUrl:
      data.photoDataUrl != null
        ? String(data.photoDataUrl)
        : hasPhoto
          ? '__HAS_PHOTO__'
          : null,
    lichessUsername: String(data.lichessUsername ?? ''),
    chessComUsername: String(data.chessComUsername ?? ''),
    school: String(data.school ?? ''),
    teacher: String(data.teacher ?? ''),
    notes: String(data.notes ?? ''),
    healthInfo: String(data.healthInfo ?? ''),
    fatherName: String(data.fatherName ?? ''),
    fatherPhone,
    fatherJob: String(data.fatherJob ?? ''),
    motherName: String(data.motherName ?? ''),
    motherPhone,
    motherJob: String(data.motherJob ?? ''),
    address: String(data.address ?? ''),
    phones,
    kvkkAccepted: Boolean(data.kvkkAccepted),
    kvkkAcceptedAt: String(data.kvkkAcceptedAt ?? ''),
    clientIp: String(data.clientIp ?? ''),
    signatureDataUrl:
      data.signatureDataUrl != null
        ? String(data.signatureDataUrl)
        : hasSignature
          ? '__HAS_SIGNATURE__'
          : '',
    signatureName: String(data.signatureName ?? ''),
    signedAt: String(data.signedAt ?? ''),
    registrarSignatureDataUrl: data.registrarSignatureDataUrl != null ? String(data.registrarSignatureDataUrl) : undefined,
    registrarSignatureName: data.registrarSignatureName != null ? String(data.registrarSignatureName) : undefined,
    studentId: data.studentId != null ? String(data.studentId) : undefined,
    source: data.source as StudentApplication['source'],
    inviteToken: data.inviteToken != null ? String(data.inviteToken) : undefined,
    clubId: data.clubId != null ? String(data.clubId) : undefined,
    clubSlug: data.clubSlug != null ? String(data.clubSlug) : undefined,
    createdAt: String(row.created_at ?? data.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? data.updatedAt ?? ''),
  };
}

function isApplicationSummary(app: StudentApplication): boolean {
  return (
    app.photoDataUrl === '__HAS_PHOTO__' ||
    app.signatureDataUrl === '__HAS_SIGNATURE__'
  );
}

async function fetchApplicationByIdFromSupabase(id: string): Promise<StudentApplication | null> {
  const client = getServiceSupabase() ?? supabase;
  const { data, error } = await client.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const app = rowToApp(data as Record<string, unknown>);
  upsertLocalApplication(app);
  return app;
}

async function countApplicationsForYear(year: number): Promise<number> {
  if (!isSupabaseBackend()) {
    return readLocal().filter((a) => a.applicationNo.startsWith(`B-${year}-`)).length;
  }
  try {
    const client = getServiceSupabase() ?? supabase;
    const { count, error } = await client
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .like('application_no', `B-${year}-%`);
    if (!error && count != null) return count;
  } catch {
    /* yedek */
  }
  return readLocal().filter((a) => a.applicationNo.startsWith(`B-${year}-`)).length;
}

function appToRow(app: StudentApplication): Record<string, unknown> {
  const hasPhoto =
    app.photoDataUrl === '__HAS_PHOTO__' || isDisplayablePhotoUrl(app.photoDataUrl);
  const hasSignature =
    app.signatureDataUrl === '__HAS_SIGNATURE__' ||
    Boolean(app.signatureDataUrl?.trim() && app.signatureDataUrl !== '__HAS_SIGNATURE__');
  return {
    id: app.id,
    application_no: app.applicationNo,
    status: app.status,
    data: app,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
    app_name: app.name || null,
    app_tc_no: app.tcNo || null,
    app_branch_office: app.branchOffice || null,
    app_group: app.group || null,
    app_club_id: app.clubId ?? null,
    app_student_id: app.studentId ?? null,
    app_birth_date: app.birthDate || null,
    app_father_phone: app.fatherPhone || null,
    app_mother_phone: app.motherPhone || null,
    has_photo: hasPhoto,
    has_signature: hasSignature,
  };
}

export function getApplicationFormUrl(clubSlug?: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const slug = clubSlug?.trim().toLowerCase();
  if (slug) return `${base}#/basvuru/${encodeURIComponent(slug)}`;
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
  const list = await loadApplicationsListAsync();
  const pending = list.find(
    (a) =>
      a.studentId === student.id &&
      a.source === 'admin_student' &&
      !a.signatureDataUrl?.trim()
  );
  if (pending?.inviteToken) {
    const application = isApplicationSummary(pending)
      ? (await loadApplicationByIdAsync(pending.id)) ?? pending
      : pending;
    return {
      token: pending.inviteToken,
      url: getParentConsentFormUrl(pending.inviteToken),
      application,
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
  if (isSupabaseBackend()) {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('data->>inviteToken', token)
        .maybeSingle();
      if (!error && data) {
        const app = rowToApp(data as Record<string, unknown>);
        upsertLocalApplication(app);
        return app;
      }
    } catch {
      /* yedek */
    }
  }
  const list = await loadApplicationsListAsync();
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
  if (isSupabaseBackend()) {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('data->>studentId', studentId)
        .order('created_at', { ascending: false });
      if (!error && data?.length) {
        return data.map((r) => rowToApp(r as Record<string, unknown>));
      }
    } catch {
      /* yedek */
    }
  }
  const list = await loadApplicationsListAsync();
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

export async function loadApplicationListMetaAsync(options?: {
  clubId?: string;
}): Promise<{ studentId: string; signed: boolean }[]> {
  const clubId = options?.clubId?.trim();
  const fromLocal = () =>
    readLocal()
      .filter((a) => a.studentId && (!clubId || a.clubId === clubId))
      .map((a) => ({
        studentId: a.studentId!,
        signed: a.status === 'signed' || a.status === 'approved' || !!a.signatureDataUrl?.trim(),
      }));

  if (isSupabaseBackend()) {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client.rpc('netchess_application_list_meta', {
        p_club_id: clubId ?? null,
      });
      if (!error && Array.isArray(data)) {
        const out: { studentId: string; signed: boolean }[] = [];
        for (const row of data) {
          const r = row as Record<string, unknown>;
          const studentId = String(r.student_id ?? r.studentId ?? '').trim();
          if (!studentId) continue;
          out.push({ studentId, signed: Boolean(r.signed) });
        }
        return out;
      }
      if (error) {
        const missingRpc =
          error.code === '42883' ||
          error.code === 'PGRST202' ||
          /netchess_application_list_meta/i.test(error.message ?? '');
        if (!missingRpc) {
          console.warn('[Applications] list meta RPC error:', error.message);
        }
      }
    } catch (e) {
      console.warn('[Applications] list meta RPC failed:', e);
    }
    return fromLocal();
  }
  return fromLocal();
}

/** Başvurudaki fotoğraflar — öğrenci kaydında photoUrl yoksa liste için */
export async function loadApplicationPhotoMapAsync(options?: {
  clubId?: string;
}): Promise<Record<string, string>> {
  const clubId = options?.clubId?.trim();
  const map: Record<string, string> = {};

  if (isSupabaseBackend()) {
    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client.rpc('netchess_application_student_photos', {
        p_club_id: clubId ?? null,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const r = row as Record<string, unknown>;
          const studentId = String(r.student_id ?? r.studentId ?? '').trim();
          const photoUrl = String(r.photo_url ?? r.photoUrl ?? '').trim();
          if (studentId && isDisplayablePhotoUrl(photoUrl)) {
            map[studentId] = photoUrl;
          }
        }
        return map;
      }
    } catch {
      /* RPC yoksa yerel yedek */
    }
  }

  for (const app of readLocal()) {
    if (!app.studentId || (clubId && app.clubId !== clubId)) continue;
    if (isDisplayablePhotoUrl(app.photoDataUrl)) {
      map[app.studentId] = app.photoDataUrl!.trim();
    }
  }
  return map;
}

export async function loadApplicationByIdAsync(id: string): Promise<StudentApplication | null> {
  const local = readLocal().find((a) => a.id === id);
  if (local && !isApplicationSummary(local)) return local;
  if (!isSupabaseBackend()) return local ?? null;
  return fetchApplicationByIdFromSupabase(id) ?? local ?? null;
}

async function fetchApplicationsListFromColumns(
  clubId?: string,
): Promise<StudentApplication[] | null> {
  const client = getServiceSupabase() ?? supabase;
  const listSelect =
    'id, application_no, status, created_at, updated_at, app_name, app_tc_no, app_branch_office, app_group, app_club_id, app_student_id, app_birth_date, app_father_phone, app_mother_phone, has_photo, has_signature';
  let query = client.from(TABLE).select(listSelect).order('created_at', { ascending: false });
  if (clubId) query = query.eq('app_club_id', clubId);
  const { data, error } = await query;
  if (error) {
    if (error.code === '42703' || /app_name|has_photo/i.test(error.message ?? '')) return null;
    throw error;
  }
  return (data ?? []).map((row) => rowToApp(row as Record<string, unknown>));
}

/** Admin listesi — büyük imza/foto jsonb olmadan */
export async function loadApplicationsListAsync(options?: {
  clubId?: string;
}): Promise<StudentApplication[]> {
  const clubId = options?.clubId?.trim();

  if (isSupabaseBackend()) {
    try {
      const fromColumns = await fetchApplicationsListFromColumns(clubId);
      if (fromColumns != null) {
        writeLocal(fromColumns);
        return fromColumns;
      }
    } catch (e) {
      console.warn('[Applications] list columns query failed:', e);
    }

    try {
      const client = getServiceSupabase() ?? supabase;
      const { data, error } = await client.rpc('netchess_list_applications', {
        p_club_id: clubId ?? null,
      });
      if (!error && Array.isArray(data)) {
        const list = data.map((row) => rowToApp(row as Record<string, unknown>));
        writeLocal(list);
        return list;
      }
      if (error) {
        const missingRpc =
          error.code === '42883' ||
          error.code === 'PGRST202' ||
          /netchess_list_applications/i.test(error.message ?? '');
        if (!missingRpc) {
          console.warn('[Applications] list RPC error:', error.message);
        }
      }
    } catch (e) {
      console.warn('[Applications] list RPC failed:', e);
    }
  }

  return readLocal().filter((a) => !clubId || a.clubId === clubId);
}

export async function loadApplicationsAsync(): Promise<StudentApplication[]> {
  return loadApplicationsListAsync();
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
  const year = new Date().getFullYear();
  const seq = (await countApplicationsForYear(year)) + 1;
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
  const found = await loadApplicationByIdAsync(id);
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
