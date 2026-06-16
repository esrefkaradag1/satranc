import { createClient } from '@supabase/supabase-js';
import type { StudentApplication } from '../lib/applicationTypes';

type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
  setHeader?(name: string, value: string): void;
};

const TABLE = 'student_applications';

function rowToApp(row: Record<string, unknown>): StudentApplication {
  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : row;
  return {
    id: String(row.id ?? data.id ?? ''),
    applicationNo: String(row.application_no ?? data.applicationNo ?? ''),
    status: (row.status ?? data.status ?? 'pending') as StudentApplication['status'],
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

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Yalnızca GET desteklenir' });
    return;
  }

  const raw = req.query.token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  if (!token) {
    res.status(400).json({ error: 'Token gerekli' });
    return;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({ error: 'Sunucu yapılandırması eksik' });
    return;
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await client
    .from(TABLE)
    .select('*')
    .eq('data->>inviteToken', token)
    .limit(1);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Form bulunamadı' });
    return;
  }

  res.setHeader?.('Cache-Control', 'no-store');
  res.status(200).json({ application: rowToApp(row) });
}
