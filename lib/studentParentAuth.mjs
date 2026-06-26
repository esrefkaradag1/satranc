function allStudentPhones(student) {
  return [
    student.parentPhone,
    student.fatherPhone,
    student.motherPhone,
    ...(student.contactNumbers ?? []),
  ].filter(Boolean);
}

function getDisplayStudentNoFromList(student, allStudents) {
  if (student.studentNo != null && student.studentNo > 0) return student.studentNo;
  const sorted = [...allStudents].sort(
    (a, b) =>
      (a.registrationDate || '').localeCompare(b.registrationDate || '') ||
      (a.name || '').localeCompare(b.name || '') ||
      String(a.id).localeCompare(String(b.id)),
  );
  const idx = sorted.findIndex((s) => s.id === student.id);
  return idx >= 0 ? idx + 1 : 0;
}

function dbRowToStudent(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (k === 'group_name') {
      out.group = v;
      continue;
    }
    if (k === 'lichess_access_token') continue;
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  if (!('group' in out)) out.group = out.groupId ?? '';
  return out;
}

function findStudentForLogin(students, phoneOrStudentId) {
  const trimmed = String(phoneOrStudentId).trim();
  const trimmedLower = trimmed.toLowerCase();
  const trimmedDigits = trimmed.replace(/\D/g, '');

  return students.find((s) => {
    if (s.id === trimmed) return true;
    const num = parseInt(trimmed, 10);
    if (!Number.isNaN(num) && getDisplayStudentNoFromList(s, students) === num) return true;
    if (s.username && String(s.username).toLowerCase() === trimmedLower) return true;
    return allStudentPhones(s).some((tel) => {
      const digits = String(tel).replace(/\D/g, '');
      return digits.length >= 7 && (digits.endsWith(trimmedDigits) || trimmedDigits.endsWith(digits.slice(-10)));
    });
  });
}

function verifyStudentLoginPin(student, pin) {
  const trimmedPin = String(pin).trim();
  if (!trimmedPin) return false;
  if (student.password && student.password === trimmedPin) return true;
  if (student.parentPin && student.parentPin === trimmedPin) return true;
  const last4 = trimmedPin.replace(/\D/g, '').slice(-4);
  if (last4.length < 4) return false;
  return allStudentPhones(student).some((tel) => {
    const digits = String(tel).replace(/\D/g, '');
    return digits.length >= 4 && digits.slice(-4) === last4;
  });
}

function studentForClientResponse(student) {
  const { password: _p, ...rest } = student;
  return rest;
}

function supabaseConfig(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function getSupabase(env) {
  const cfg = supabaseConfig(env);
  if (!cfg) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function parentStudentLoginViaEnv(body, env) {
  const phoneOrStudentId = String(body.phoneOrStudentId ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!phoneOrStudentId || !pin) {
    return { status: 400, body: { error: 'phoneOrStudentId ve pin gerekli' } };
  }

  const sb = await getSupabase(env);
  if (!sb) {
    return { status: 503, body: { error: 'Supabase yapılandırması eksik' } };
  }

  const { data, error } = await sb.from('students').select('*').neq('status', 'inactive');
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  const students = (data ?? []).map((row) => dbRowToStudent(row));
  const student = findStudentForLogin(students, phoneOrStudentId);
  if (!student) {
    return { status: 401, body: { error: 'Öğrenci bulunamadı' } };
  }
  if (!verifyStudentLoginPin(student, pin)) {
    return { status: 401, body: { error: 'Şifre veya PIN hatalı' } };
  }

  return {
    status: 200,
    body: {
      studentId: student.id,
      student: studentForClientResponse(student),
    },
  };
}
