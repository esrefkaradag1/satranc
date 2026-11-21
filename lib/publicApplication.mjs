/**
 * Girişsiz öğrenci başvurusu — POST /api/submit-application
 *
 * Neden sunucuda: veritabanı yetkileri (RLS) açılınca giriş yapmamış ziyaretçi başvuru tablosunu
 * okuyamaz/yazamaz. Ayrıca eski akış mükerrer kontrolü için TC ile tabloyu sorgulayıp bulunan
 * başvurunun TÜM verisini tarayıcıya döndürüyordu (TC bilen herkes başkasının başvurusunu
 * görebiliyordu). Burada mükerrer kontrol ve numaralandırma sunucuda yapılır; yanıtta yalnızca
 * başvuru numarası döner.
 */
import { getSupabase } from './studentParentAuth.mjs';

const TABLE = 'student_applications';
const MAX_BODY_CHARS = 7_000_000; // fotoğraf + imza veri URL'leri dahil
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 10;
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_IP) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.clear();
  return false;
}

function genId() {
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeClubKey(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDisplayablePhotoUrl(value) {
  return typeof value === 'string' && /^(data:image\/|https?:\/\/)/i.test(value.trim());
}

/** services/applicationStorage.ts appToRow ile aynı sütun eşlemesi */
function appToRow(app) {
  const hasPhoto = app.photoDataUrl === '__HAS_PHOTO__' || isDisplayablePhotoUrl(app.photoDataUrl);
  const hasSignature =
    app.signatureDataUrl === '__HAS_SIGNATURE__'
    || Boolean(String(app.signatureDataUrl ?? '').trim() && app.signatureDataUrl !== '__HAS_SIGNATURE__');
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

async function findDuplicate(sb, input) {
  const tc = String(input.tcNo ?? '').replace(/\D/g, '');
  if (tc) {
    const { data } = await sb.from(TABLE).select('application_no').eq('app_tc_no', tc).limit(1);
    if (data?.length) return data[0].application_no;
  }
  const name = String(input.name ?? '').trim();
  const phone = String(input.phones?.[0] ?? '').replace(/\D/g, '');
  if (name && phone) {
    const { data } = await sb
      .from(TABLE)
      .select('application_no')
      .eq('app_name', name)
      .or(`app_father_phone.eq.${phone},app_mother_phone.eq.${phone}`)
      .limit(1);
    if (data?.length) return data[0].application_no;
  }
  return null;
}

async function resolveClubId(sb, clubId, branchOffice) {
  if (String(clubId ?? '').trim()) return String(clubId).trim();
  const branch = String(branchOffice ?? '').trim();
  if (!branch) return undefined;
  const { data } = await sb.from('clubs').select('id, name');
  const key = normalizeClubKey(branch);
  const match = (data ?? []).find((row) => normalizeClubKey(row.name) === key);
  return match ? String(match.id) : undefined;
}

/**
 * @param {Record<string, unknown>} body { application: <başvuru alanları> }
 * @param {Record<string, string|undefined>} env
 * @param {{ ip?: string }} [meta]
 */
export async function submitApplicationHandler(body, env, meta = {}) {
  const input = body?.application;
  if (!input || typeof input !== 'object') return { status: 400, body: { error: 'Başvuru bilgisi gerekli.' } };
  if (!String(input.name ?? '').trim()) return { status: 400, body: { error: 'Öğrenci adı gerekli.' } };
  if (JSON.stringify(input).length > MAX_BODY_CHARS) {
    return { status: 413, body: { error: 'Başvuru çok büyük (fotoğraf/imza boyutunu küçültün).' } };
  }
  if (limited(meta.ip)) return { status: 429, body: { error: 'Çok fazla başvuru denemesi. Bir saat sonra tekrar deneyin.' } };

  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Sunucu veritabanı yapılandırması eksik.' } };

  try {
    const duplicateNo = await findDuplicate(sb, input);
    if (duplicateNo) return { status: 200, body: { duplicate: true, applicationNo: duplicateNo } };

    const year = new Date().getFullYear();
    const clubId = await resolveClubId(sb, input.clubId, input.branchOffice);
    const now = new Date().toISOString();
    // Numara çakışırsa (eşzamanlı başvuru) bir sonrakini dene.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await sb.from(TABLE).select('id', { count: 'exact', head: true }).like('application_no', `B-${year}-%`);
      const seq = (count ?? 0) + 1 + attempt;
      const app = {
        ...input,
        clubId,
        id: genId(),
        applicationNo: `B-${year}-${String(seq).padStart(4, '0')}`,
        status: 'pending', // ziyaretçi durumu belirleyemez
        createdAt: now,
        updatedAt: now,
      };
      const { error } = await sb.from(TABLE).insert(appToRow(app));
      if (!error) return { status: 200, body: { duplicate: false, id: app.id, applicationNo: app.applicationNo } };
      if (!/duplicate key|unique/i.test(error.message)) return { status: 500, body: { error: error.message } };
    }
    return { status: 409, body: { error: 'Başvuru numarası verilemedi, lütfen tekrar deneyin.' } };
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Başvuru kaydedilemedi.' } };
  }
}
