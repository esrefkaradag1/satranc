/**
 * Sunucu tarafı giriş — POST /api/login
 *
 * Eskiden bütün şifre karşılaştırmaları tarayıcıda yapılıyordu (şifreler tarayıcıya iniyor,
 * yönetici şifresi koda gömülüydü). Artık:
 *  - Şifreler yalnızca burada doğrulanır; yanıtta hiçbir şifre/PIN dönmez.
 *  - Yönetici şifresi sunucu ortamından gelir (ADMIN_PASSWORD veya ADMIN_PASSWORD_HASH).
 *  - Varsayılan ortak şifreler ('antrenor', 'kulup') kaldırıldı.
 *  - Kulüp/antrenör şifreleri tek yönlü saklanır; düz metin kayıt ilk başarılı girişte dönüştürülür.
 *  - Hatalı denemeler sınırlanır (hesap+IP başına 15 dakikada 5, IP başına 30).
 *  - SUPABASE_JWT_SECRET tanımlıysa imzalı oturum belirteci (JWT) verilir (Faz 2: veritabanı yetkileri).
 *
 * Öğrenci/veli: kararlaştırıldığı gibi öğrenci şifresi ve veli PIN'i görünür kalır; telefonun son
 * 4 hanesiyle giriş korunur — ancak deneme sınırı uygulanır.
 */
import { createHmac } from 'node:crypto';
import { hashPassword, isPasswordHash, verifyPassword } from './passwordHash.mjs';
import {
  dbRowToStudent,
  findStudentForLogin,
  getSupabase,
  studentForClientResponse,
  verifyStudentLoginPin,
} from './studentParentAuth.mjs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILURES = 5;
const MAX_IP_FAILURES = 30;
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

const failures = new Map(); // key -> number[] (zaman damgaları)

function recent(key) {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

function noteFailure(...keys) {
  const now = Date.now();
  for (const k of keys) failures.set(k, [...recent(k), now]);
  if (failures.size > 20_000) failures.clear(); // bellek koruması
}

/** Ortak hatalı-deneme sınırı (öğrenci/veli eski uç noktası da kullanır). */
export function loginThrottle(role, identifier, ip) {
  const accountKey = `a|${role}|${String(identifier ?? '').trim().toLowerCase()}`;
  const ipKey = `i|${ip || 'unknown'}`;
  return {
    blocked: recent(accountKey).length >= MAX_ACCOUNT_FAILURES || recent(ipKey).length >= MAX_IP_FAILURES,
    fail: () => noteFailure(accountKey, ipKey),
    succeed: () => failures.delete(accountKey),
  };
}

const TOO_MANY = 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.';

function envValue(env, ...names) {
  for (const n of names) {
    const v = String(env?.[n] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Supabase'in JWT gizli anahtarıyla imzalı belirteç — Faz 2'de RLS bu iddiaları okur. */
function signSession(env, claims) {
  const secret = envValue(env, 'SUPABASE_JWT_SECRET', 'JWT_SECRET');
  if (!secret) return undefined;
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: 'authenticated', role: 'authenticated', iat: now, exp: now + SESSION_TTL_SEC, ...claims };
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${head}.${body}.${sig}`;
}

function slugifyClubUsername(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'kulup';
}

/** lib/clubLoginUtils.ts findClubForLogin ile aynı kural (satırlar DB biçiminde). */
function findClubRow(rows, identifier) {
  const raw = String(identifier ?? '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const slugInput = slugifyClubUsername(raw);
  for (const c of rows) {
    const loginUser = String(c.login_username ?? '').trim();
    if (loginUser && (loginUser.toLowerCase() === lower || slugifyClubUsername(loginUser) === slugInput)) return c;
  }
  for (const c of rows) {
    if (slugifyClubUsername(c.name) === slugInput) return c;
    if (String(c.name ?? '').trim().toLowerCase() === lower) return c;
  }
  return undefined;
}

/** AppContext eski loginCoach ile aynı tanımlayıcı kuralı: e-posta, ad veya telefon (≥4 hane). */
function coachMatchesIdentifier(row, identifier) {
  const idRaw = String(identifier ?? '').trim();
  const idLower = idRaw.toLowerCase();
  const idDigits = idRaw.replace(/\D/g, '');
  const email = String(row.email ?? '').trim().toLowerCase();
  const phone = String(row.phone ?? '').replace(/\D/g, '');
  const name = String(row.name ?? '').trim().toLowerCase();
  return (
    (idLower && email === idLower)
    || (idLower && name === idLower)
    || (idDigits.length >= 4 && phone === idDigits)
    || (idDigits.length >= 4 && phone.endsWith(idDigits))
  );
}

async function rehash(sb, table, column, id, plain) {
  try {
    await sb.from(table).update({ [column]: hashPassword(plain) }).eq('id', id);
  } catch (err) {
    console.warn(`[login] ${table}.${column} dönüştürülemedi:`, err instanceof Error ? err.message : err);
  }
}

async function loginAdmin(password, env) {
  const hash = envValue(env, 'ADMIN_PASSWORD_HASH');
  const plain = envValue(env, 'ADMIN_PASSWORD');
  if (!hash && !plain) {
    return { status: 503, body: { error: 'Yönetici girişi yapılandırılmamış (sunucuda ADMIN_PASSWORD yok).' } };
  }
  const ok = hash ? verifyPassword(password, hash).ok : verifyPassword(password, plain).ok;
  if (!ok) return null;
  return { status: 200, body: { role: 'admin', token: signSession(env, { sub: 'admin', app_role: 'admin' }) } };
}

async function loginClub(identifier, password, env) {
  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Sunucu veritabanı yapılandırması eksik.' } };
  const { data, error } = await sb.from('clubs').select('id,name,login_username,login_password,role_id');
  if (error) return { status: 500, body: { error: error.message } };
  const club = findClubRow(data ?? [], identifier);
  if (!club) return null;
  const check = verifyPassword(password, club.login_password);
  if (!check.ok) return null;
  if (check.needsRehash) await rehash(sb, 'clubs', 'login_password', club.id, password);
  return {
    status: 200,
    body: {
      role: 'club',
      club: { id: club.id, name: club.name, roleId: club.role_id ?? undefined },
      token: signSession(env, { sub: `club:${club.id}`, app_role: 'club', club_id: club.id }),
    },
  };
}

async function loginCoach(identifier, password, env) {
  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Sunucu veritabanı yapılandırması eksik.' } };
  const { data, error } = await sb.from('coaches').select('id,name,email,phone,password,branch,club_id,role_id');
  if (error) return { status: 500, body: { error: error.message } };
  const verified = [];
  for (const row of data ?? []) {
    if (!coachMatchesIdentifier(row, identifier)) continue;
    const check = verifyPassword(password, row.password);
    if (!check.ok) continue;
    if (check.needsRehash) await rehash(sb, 'coaches', 'password', row.id, password);
    verified.push({
      id: row.id,
      name: row.name ?? undefined,
      branch: row.branch ?? undefined,
      clubId: row.club_id ?? undefined,
      roleId: row.role_id ?? undefined,
    });
  }
  if (verified.length === 0) return null;
  return {
    status: 200,
    body: {
      role: 'coach',
      coaches: verified,
      token: signSession(env, {
        sub: `coach:${verified[0].id}`,
        app_role: 'coach',
        coach_ids: verified.map((c) => c.id),
        club_id: verified[0].clubId ?? null,
      }),
    },
  };
}

async function loginStudentOrParent(role, identifier, pin, env) {
  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Sunucu veritabanı yapılandırması eksik.' } };
  const { data, error } = await sb.from('students').select('*');
  if (error) return { status: 500, body: { error: error.message } };
  const students = (data ?? []).map((row) => dbRowToStudent(row));
  const student = findStudentForLogin(students, identifier);
  if (!student || !verifyStudentLoginPin(student, pin)) return null;
  if (student.status === 'inactive') {
    return { status: 403, body: { error: 'Hesabınız pasiftir. Sisteme giriş yapamazsınız.', inactive: true } };
  }
  return {
    status: 200,
    body: {
      role,
      studentId: student.id,
      student: studentForClientResponse(student),
      token: signSession(env, { sub: `${role}:${student.id}`, app_role: role, student_id: student.id }),
    },
  };
}

/**
 * @param {Record<string, unknown>} body { role, identifier, password }
 * @param {Record<string, string|undefined>} env
 * @param {{ ip?: string }} [meta]
 */
export async function loginHandler(body, env, meta = {}) {
  const role = String(body?.role ?? '');
  const identifier = String(body?.identifier ?? '').trim();
  const password = String(body?.password ?? '').trim();
  if (!['admin', 'club', 'coach', 'student', 'parent'].includes(role)) {
    return { status: 400, body: { error: 'Geçersiz rol.' } };
  }
  if (!password || (role !== 'admin' && !identifier)) {
    return { status: 400, body: { error: 'Kullanıcı bilgisi ve şifre gerekli.' } };
  }

  const throttle = loginThrottle(role, role === 'admin' ? 'admin' : identifier, meta.ip);
  if (throttle.blocked) return { status: 429, body: { error: TOO_MANY } };

  let result;
  try {
    if (role === 'admin') result = await loginAdmin(password, env);
    else if (role === 'club') result = await loginClub(identifier, password, env);
    else if (role === 'coach') result = await loginCoach(identifier, password, env);
    else result = await loginStudentOrParent(role, identifier, password, env);
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Giriş sırasında hata oluştu.' } };
  }

  if (result === null) {
    throttle.fail();
    return { status: 401, body: { error: 'Kullanıcı bilgisi veya şifre hatalı.' } };
  }
  if (result.status === 200) throttle.succeed();
  return result;
}

/**
 * Eski /api/auth-parent uç noktası — aynı doğrulama ve deneme sınırı; yanıt biçimi korunur
 * ({ studentId, student } / 401 / 403 pasif). Sınır olmasaydı bu uç nokta tahmin için arka kapı olurdu.
 */
export async function legacyParentLoginHandler(body, env, meta = {}) {
  const result = await loginHandler(
    { role: 'parent', identifier: body?.phoneOrStudentId, password: body?.pin },
    env,
    meta,
  );
  if (result.status !== 200) return result;
  return { status: 200, body: { studentId: result.body.studentId, student: result.body.student } };
}

export { isPasswordHash };
