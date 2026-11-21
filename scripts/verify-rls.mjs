#!/usr/bin/env node
/**
 * Faz 2 veritabanı yetkilerini doğrular — YALNIZCA OKUR, hiçbir şey yazmaz.
 *
 * Kullanım:  set -a && source .env && set +a && node scripts/verify-rls.mjs
 * Gerekli ortam: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY,
 *                JWT_SECRET (veya SUPABASE_JWT_SECRET)
 *
 * Ziyaretçi, öğrenci ve antrenör için /api/login'in verdiği biçimde belirteç üretir ve beklenen
 * erişimi kontrol eder. supabase_rls_phase2.sql uygulanmadan önce çalıştırılırsa açıkları listeler.
 */
import { createHmac } from 'node:crypto';

const env = process.env;
const URL_ = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1';
const ANON = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const SERVICE = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = env.SUPABASE_JWT_SECRET || env.JWT_SECRET;
if (!URL_ || !ANON || !SERVICE || !SECRET) {
  console.error('Eksik ortam değişkeni (URL, ANON, SERVICE_ROLE, JWT_SECRET).');
  process.exit(2);
}

const now = Math.floor(Date.now() / 1000);
function mint(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({ aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 600, ...claims });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

async function query(bearer, path) {
  const res = await fetch(`${URL_}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, Prefer: 'count=exact', Range: '0-999' },
  });
  const rows = res.ok ? await res.json() : [];
  const total = Number((res.headers.get('content-range') || '').split('/')[1] ?? rows.length);
  return { ok: res.ok, status: res.status, rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : 0 };
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'GEÇTİ ' : 'KALDI '} ${name}${detail ? ` — ${detail}` : ''}`);
}

const service = (p) => query(SERVICE, p);
const allStudents = await service('students?select=id,status');
const student = allStudents.rows.find((r) => r.status !== 'inactive') ?? allStudents.rows[0];
const totals = {
  students: allStudents.total,
  transactions: (await service('transactions?select=id')).total,
  attendance: (await service('attendance_records?select=id')).total,
};
const anonToken = ANON;
const studentToken = mint({ sub: `student:${student.id}`, app_role: 'student', student_id: student.id });
const coachToken = mint({ sub: 'coach:verify', app_role: 'coach' });

console.log('\n── Ziyaretçi (giriş yok) ──');
for (const t of ['students', 'transactions', 'attendance_records', 'homework_attempts', 'student_applications', 'coaches', 'whatsapp_config', 'site_messages']) {
  const r = await query(anonToken, `${t}?select=*&limit=1`);
  check(`ziyaretçi ${t} okuyamaz`, r.rows.length === 0, r.ok ? `${r.rows.length} satır` : `HTTP ${r.status}`);
}
const anonClubsAll = await query(anonToken, 'clubs?select=login_password');
check('ziyaretçi kulüp şifresini okuyamaz', anonClubsAll.rows.length === 0, anonClubsAll.ok ? `${anonClubsAll.rows.length} satır` : `HTTP ${anonClubsAll.status}`);
const anonClubs = await query(anonToken, 'clubs?select=id,name');
check('ziyaretçi kulüp adlarını okur (başvuru formu)', anonClubs.rows.length > 0, `${anonClubs.rows.length} kulüp`);
const anonOffices = await query(anonToken, 'branch_offices?select=*&limit=1');
check('ziyaretçi şube listesini okur (başvuru formu)', anonOffices.ok, `HTTP ${anonOffices.status}`);
const anonRpc = await fetch(`${URL_}/rpc/tournament_self_join`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_tournament_id: '__yok__', p_student_id: '__yok__' }),
});
check('ziyaretçi veritabanı fonksiyonu çağıramaz', !anonRpc.ok, `HTTP ${anonRpc.status}`);

console.log('\n── Öğrenci ──');
const ownStudents = await query(studentToken, 'students?select=*');
check('öğrenci students tablosunda yalnızca kendi satırını görür',
  ownStudents.rows.length === 1 && String(ownStudents.rows[0]?.id) === String(student.id),
  `${ownStudents.rows.length}/${totals.students} satır`);
const pub = await query(studentToken, 'students_public?select=*');
check('öğrenci diğer öğrencileri students_public üzerinden görür', pub.ok && pub.rows.length > 1, pub.ok ? `${pub.rows.length} satır` : `HTTP ${pub.status}`);
const leaked = pub.rows.length ? Object.keys(pub.rows[0]).filter((k) => /password|pin|tc_no|phone|token|address|health|fee/i.test(k)) : [];
check('students_public gizli alan içermez', pub.ok && leaked.length === 0, leaked.join(',') || 'temiz');
const myTx = await query(studentToken, 'transactions?select=student_id');
check('öğrenci yalnızca kendi ödemelerini görür',
  myTx.rows.every((r) => String(r.student_id) === String(student.id)) && myTx.total < totals.transactions,
  `${myTx.total}/${totals.transactions} satır`);
const myAtt = await query(studentToken, 'attendance_records?select=student_id');
check('öğrenci yalnızca kendi yoklamasını görür',
  myAtt.rows.every((r) => String(r.student_id) === String(student.id)) && myAtt.total < totals.attendance,
  `${myAtt.total}/${totals.attendance} satır`);
for (const t of ['puzzles', 'tournaments', 'homeworks', 'training_groups']) {
  const r = await query(studentToken, `${t}?select=*&limit=1`);
  check(`öğrenci paylaşılan ${t} okur`, r.ok, `HTTP ${r.status}`);
}
for (const t of ['whatsapp_config', 'inventory', 'student_applications', 'chessduello_coach_settings']) {
  const r = await query(studentToken, `${t}?select=*&limit=1`);
  check(`öğrenci personel tablosu ${t} okuyamaz`, r.rows.length === 0, r.ok ? `${r.rows.length} satır` : `HTTP ${r.status}`);
}

console.log('\n── Antrenör (personel) ──');
const coachStudents = await query(coachToken, 'students?select=id');
check('antrenör tüm öğrencileri görür', coachStudents.total === totals.students, `${coachStudents.total}/${totals.students}`);
const coachTx = await query(coachToken, 'transactions?select=id');
check('antrenör tüm kasa kayıtlarını görür', coachTx.total === totals.transactions, `${coachTx.total}/${totals.transactions}`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nSonuç: ${results.length - failed}/${results.length} kontrol geçti.`);
process.exit(failed ? 1 : 0);
