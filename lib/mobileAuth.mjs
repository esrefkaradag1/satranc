/**
 * Mobil giriş: web ile aynı Supabase tabloları ve aynı parola kuralları.
 * students / coaches / clubs. Yönetim parolası webdeki gibi sabittir.
 */
import {
  allStudentPhones,
  dbRowToStudent,
  findStudentForLogin,
  getSupabase,
  studentForClientResponse,
  verifyStudentLoginPin,
} from './studentParentAuth.mjs';

const ADMIN_PASSWORD = 'admin';
const COACH_PASSWORD = 'antrenor';
const CLUB_PASSWORD = 'kulup';

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function camelRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (v === undefined) continue;
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

function verifyParentPin(student, pin) {
  const trimmedPin = String(pin || '').trim();
  if (!trimmedPin) return false;
  if (student.parentPin && student.parentPin === trimmedPin) return true;
  const last4 = trimmedPin.replace(/\D/g, '').slice(-4);
  if (last4.length < 4) return false;
  return allStudentPhones(student).some((tel) => {
    const digits = String(tel).replace(/\D/g, '');
    return digits.length >= 4 && digits.slice(-4) === last4;
  });
}

function publicStudent(student) {
  const safe = studentForClientResponse(student);
  return {
    id: safe.id,
    name: safe.name || 'Öğrenci',
    group: safe.group || safe.groupName || '',
    branch: safe.branchOffice || safe.branch || '',
    studentNo: safe.studentNo ?? null,
    status: safe.status || 'active',
  };
}

function findClub(clubs, identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const slugInput = slugify(raw);
  for (const c of clubs) {
    const loginUser = String(c.loginUsername || '').trim();
    if (!loginUser) continue;
    if (loginUser.toLowerCase() === lower) return c;
    if (slugify(loginUser) === slugInput) return c;
  }
  for (const c of clubs) {
    if (slugify(c.name) === slugInput) return c;
    if (String(c.name || '').trim().toLowerCase() === lower) return c;
  }
  return undefined;
}

async function loadStudents(sb) {
  const { data, error } = await sb.from('students').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => dbRowToStudent(row));
}

export async function mobileAuthHandler(body, env) {
  const action = String(body?.action ?? 'login').trim();
  if (action === 'panel' || action === 'send-message') {
    const { mobileStudentHandler } = await import('./mobileStudent.mjs');
    return mobileStudentHandler(body, env);
  }
  if (action === 'home') return mobileHome(body, env);
  return mobileLogin(body, env);
}

async function mobileLogin(body, env) {
  const role = String(body?.role ?? 'student').trim();
  const identifier = String(body?.identifier ?? body?.phoneOrStudentId ?? '').trim();
  const password = String(body?.password ?? body?.pin ?? '').trim();
  if (!password) return { status: 400, body: { error: 'Şifre gerekli' } };

  if (role === 'admin') {
    if (password !== ADMIN_PASSWORD) return { status: 401, body: { error: 'Yönetim şifresi hatalı' } };
    return {
      status: 200,
      body: { role: 'admin', name: 'Yönetim', user: { role: 'admin', name: 'Yönetim' } },
    };
  }

  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Supabase yapılandırması eksik' } };

  if (role === 'student' || role === 'parent') {
    if (!identifier) return { status: 400, body: { error: 'Öğrenci no, kullanıcı adı veya telefon gerekli' } };
    let students;
    try {
      students = await loadStudents(sb);
    } catch (err) {
      return { status: 500, body: { error: err instanceof Error ? err.message : 'Öğrenciler okunamadı' } };
    }
    const student = findStudentForLogin(students, identifier);
    if (!student) return { status: 401, body: { error: 'Bu bilgilerle öğrenci bulunamadı' } };
    if (student.status === 'inactive') {
      return { status: 403, body: { error: 'Hesabınız pasiftir. Sisteme giriş yapamazsınız.' } };
    }
    const ok = role === 'parent' ? verifyParentPin(student, password) : verifyStudentLoginPin(student, password);
    if (!ok) return { status: 401, body: { error: 'Şifre veya PIN hatalı' } };
    const profile = publicStudent(student);
    return {
      status: 200,
      body: {
        role,
        name: profile.name,
        studentId: profile.id,
        user: { role, ...profile },
      },
    };
  }

  if (role === 'coach') {
    if (!identifier) return { status: 400, body: { error: 'E-posta, ad veya telefon gerekli' } };
    const { data, error } = await sb.from('coaches').select('*');
    if (error) return { status: 500, body: { error: error.message } };
    const idLower = identifier.toLowerCase();
    const idDigits = identifier.replace(/\D/g, '');
    const coach = (data ?? []).map(camelRow).find((c) => {
      const email = String(c.email || '').trim().toLowerCase();
      const phone = String(c.phone || '').replace(/\D/g, '');
      const name = String(c.name || '').trim().toLowerCase();
      const matches =
        (email && email === idLower)
        || (name && name === idLower)
        || (idDigits.length >= 4 && phone === idDigits)
        || (idDigits.length >= 4 && phone.endsWith(idDigits));
      if (!matches) return false;
      const expected = String(c.password || '').trim() || COACH_PASSWORD;
      return password === expected;
    });
    if (!coach) return { status: 401, body: { error: 'Antrenör bulunamadı veya şifre hatalı' } };
    return {
      status: 200,
      body: {
        role: 'coach',
        name: coach.name || 'Antrenör',
        coachId: coach.id,
        user: {
          role: 'coach',
          id: coach.id,
          name: coach.name || 'Antrenör',
          branch: coach.branch || '',
          clubId: coach.clubId || null,
          email: coach.email || '',
        },
      },
    };
  }

  if (role === 'club') {
    if (!identifier) return { status: 400, body: { error: 'Kulüp kullanıcı adı gerekli' } };
    const { data, error } = await sb.from('clubs').select('*');
    if (error) return { status: 500, body: { error: error.message } };
    const clubs = (data ?? []).map(camelRow);
    const club = findClub(clubs, identifier);
    if (!club) return { status: 401, body: { error: 'Kulüp bulunamadı' } };
    const expected = String(club.loginPassword || '').trim() || CLUB_PASSWORD;
    if (password !== expected) return { status: 401, body: { error: 'Kulüp şifresi hatalı' } };
    return {
      status: 200,
      body: {
        role: 'club',
        name: club.name || 'Kulüp',
        clubId: club.id,
        user: {
          role: 'club',
          id: club.id,
          name: club.name || 'Kulüp',
          loginUsername: club.loginUsername || '',
        },
      },
    };
  }

  return { status: 400, body: { error: 'Geçersiz rol' } };
}

async function mobileHome(body, env) {
  const role = String(body?.role ?? '').trim();
  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Supabase yapılandırması eksik' } };

  if (role === 'admin') {
    const [students, coaches, clubs] = await Promise.all([
      sb.from('students').select('id', { count: 'exact', head: true }),
      sb.from('coaches').select('id', { count: 'exact', head: true }),
      sb.from('clubs').select('id', { count: 'exact', head: true }),
    ]);
    return {
      status: 200,
      body: {
        title: 'Yönetim',
        lines: [
          `${students.count ?? 0} öğrenci`,
          `${coaches.count ?? 0} antrenör`,
          `${clubs.count ?? 0} kulüp`,
        ],
        people: [],
      },
    };
  }

  let students;
  try {
    students = await loadStudents(sb);
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : 'Öğrenciler okunamadı' } };
  }
  const active = students.filter((s) => s.status !== 'inactive');

  if (role === 'coach') {
    const coachId = String(body?.coachId ?? '').trim();
    const { data } = await sb.from('coaches').select('*').eq('id', coachId).maybeSingle();
    const coach = data ? camelRow(data) : null;
    const branch = String(coach?.branch || '').trim();
    const clubId = String(coach?.clubId || '').trim();
    const mine = active.filter((s) => {
      if (clubId && String(s.clubId || '') === clubId) return true;
      if (branch && (s.branchOffice === branch || s.branch === branch)) return true;
      return !clubId && !branch;
    });
    return {
      status: 200,
      body: {
        title: coach?.name || 'Antrenör',
        lines: [`${mine.length} öğrenci bu hesapla aynı veritabanında`],
        people: mine.slice(0, 40).map((s) => publicStudent(s)),
      },
    };
  }

  if (role === 'club') {
    const clubId = String(body?.clubId ?? '').trim();
    const { data } = await sb.from('clubs').select('*').eq('id', clubId).maybeSingle();
    const club = data ? camelRow(data) : null;
    const name = String(club?.name || '').trim();
    const mine = active.filter((s) => {
      if (clubId && String(s.clubId || '') === clubId) return true;
      if (name && (s.branchOffice === name || s.branch === name)) return true;
      return false;
    });
    return {
      status: 200,
      body: {
        title: name || 'Kulüp',
        lines: [`${mine.length} öğrenci kayıtlı`],
        people: mine.slice(0, 40).map((s) => publicStudent(s)),
      },
    };
  }

  const studentId = String(body?.studentId ?? '').trim();
  const student = students.find((s) => s.id === studentId);
  if (!student) return { status: 404, body: { error: 'Öğrenci kaydı bulunamadı' } };
  const profile = publicStudent(student);
  return {
    status: 200,
    body: {
      title: profile.name,
      lines: [profile.group, profile.branch].filter(Boolean),
      people: [profile],
    },
  };
}
