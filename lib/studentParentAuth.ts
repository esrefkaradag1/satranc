import type { Student } from '../types';

export function getDisplayStudentNoFromList(student: Student, allStudents: Student[]): number {
  if (student.studentNo != null && student.studentNo > 0) return student.studentNo;
  const sorted = [...allStudents].sort(
    (a, b) =>
      (a.registrationDate || '').localeCompare(b.registrationDate || '') ||
      (a.name || '').localeCompare(b.name || '') ||
      a.id.localeCompare(b.id),
  );
  const idx = sorted.findIndex((s) => s.id === student.id);
  return idx >= 0 ? idx + 1 : 0;
}

export function allStudentPhones(student: Student): string[] {
  return [
    student.parentPhone,
    student.fatherPhone,
    student.motherPhone,
    ...(student.contactNumbers ?? []),
  ].filter(Boolean) as string[];
}

/** Veli / öğrenci girişi: öğrenci no, kullanıcı adı, id veya telefon ile eşleşme */
export function findStudentForLogin(students: Student[], phoneOrStudentId: string): Student | undefined {
  const trimmed = phoneOrStudentId.trim();
  const trimmedLower = trimmed.toLowerCase();
  const trimmedDigits = trimmed.replace(/\D/g, '');

  return students.find((s) => {
    if (s.id === trimmed) return true;
    const num = parseInt(trimmed, 10);
    if (!Number.isNaN(num) && getDisplayStudentNoFromList(s, students) === num) return true;
    if (s.username && s.username.toLowerCase() === trimmedLower) return true;
    const phones = allStudentPhones(s);
    return phones.some((tel) => {
      const digits = tel.replace(/\D/g, '');
      return digits.length >= 7 && (digits.endsWith(trimmedDigits) || trimmedDigits.endsWith(digits.slice(-10)));
    });
  });
}

/** Öğrenci şifresi, veli PIN veya telefon son 4 hane */
export function verifyStudentLoginPin(student: Student, pin: string): boolean {
  const trimmedPin = pin.trim();
  if (!trimmedPin) return false;
  if (student.password && student.password === trimmedPin) return true;
  if (student.parentPin && student.parentPin === trimmedPin) return true;
  const last4 = trimmedPin.replace(/\D/g, '').slice(-4);
  if (last4.length < 4) return false;
  return allStudentPhones(student).some((tel) => {
    const digits = tel.replace(/\D/g, '');
    return digits.length >= 4 && digits.slice(-4) === last4;
  });
}

export function dbRowToStudent(row: Record<string, unknown>): Student {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (k === 'group_name') {
      out.group = v;
      continue;
    }
    if (k === 'lichess_access_token') continue;
    const camel = k.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
    out[camel] = v;
  }
  if (!('group' in out)) out.group = out.groupId ?? '';
  return out as unknown as Student;
}

/** API yanıtı — şifre/token alanları gönderilmez */
export function studentForClientResponse(student: Student): Student {
  const { password: _p, ...rest } = student;
  return rest as Student;
}
