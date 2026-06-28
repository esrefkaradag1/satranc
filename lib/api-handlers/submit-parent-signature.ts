import { createClient } from '@supabase/supabase-js';
import type { StudentApplication } from '../applicationTypes';

type Req = {
  method?: string;
  body?: string | Record<string, unknown>;
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

function parseBody(req: Req): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca POST desteklenir' });
    return;
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({ error: 'Sunucu yapılandırması eksik' });
    return;
  }

  const body = parseBody(req);
  const token = String(body.token ?? '').trim();
  const signatureDataUrl = String(body.signatureDataUrl ?? '').trim();
  const signatureName = String(body.signatureName ?? '').trim();
  const kvkkAccepted = Boolean(body.kvkkAccepted);
  const clientIp = String(body.clientIp ?? '').trim();

  if (!token) {
    res.status(400).json({ error: 'Geçersiz davet bağlantısı' });
    return;
  }
  if (!signatureDataUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'Geçersiz imza verisi' });
    return;
  }
  if (!signatureName) {
    res.status(400).json({ error: 'İmzalayan ad soyad zorunludur' });
    return;
  }
  if (!kvkkAccepted) {
    res.status(400).json({ error: 'KVKK onayı zorunludur' });
    return;
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: loadError } = await client
    .from(TABLE)
    .select('*')
    .eq('data->>inviteToken', token)
    .limit(1);

  if (loadError) {
    res.status(500).json({ error: loadError.message });
    return;
  }

  const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Form bulunamadı' });
    return;
  }

  const found = rowToApp(row);
  if (found.signatureDataUrl?.trim()) {
    res.status(200).json({ application: found, alreadySigned: true });
    return;
  }

  const now = new Date().toISOString();
  const updated: StudentApplication = {
    ...found,
    signatureDataUrl,
    signatureName,
    signedAt: now,
    kvkkAccepted: true,
    kvkkAcceptedAt: now,
    clientIp: clientIp || found.clientIp,
    status: 'signed',
    updatedAt: now,
  };

  const { error: saveError } = await client.from(TABLE).upsert(appToRow(updated), { onConflict: 'id' });
  if (saveError) {
    res.status(500).json({ error: saveError.message });
    return;
  }

  res.setHeader?.('Cache-Control', 'no-store');
  res.status(200).json({ application: updated });
}
