import type { Student } from '../types';
import { allStudentPhones } from './studentParentAuth';

export function studentHasParentRecord(student: Student): boolean {
  return Boolean(
    student.parentName?.trim()
    || student.fatherName?.trim()
    || student.motherName?.trim()
    || student.parentPhone?.trim()
    || student.fatherPhone?.trim()
    || student.motherPhone?.trim()
    || student.parentPin?.trim(),
  );
}

export function parentDisplayNames(student: Student): { father: string; mother: string; summary: string } {
  const father = student.fatherName?.trim() || student.parentName?.trim() || '';
  const mother = student.motherName?.trim() || '';
  const summary = [father, mother].filter(Boolean).join(' · ') || '—';
  return { father: father || '—', mother: mother || '—', summary };
}

export function formatParentPhone(digits?: string): string {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!d) return '—';
  if (d.length === 10) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 11 && d.startsWith('0')) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  }
  return d;
}

export function parentPhonesSummary(student: Student): { father: string; mother: string; login: string } {
  return {
    father: formatParentPhone(student.fatherPhone || (!student.motherPhone ? student.parentPhone : '')),
    mother: formatParentPhone(student.motherPhone),
    login: formatParentPhone(student.parentPhone),
  };
}

/** Veli paneli PIN: kayıtlı PIN, yoksa telefonun son 4 hanesi */
export function parentLoginSecret(student: Student): { pin: string; fallback: boolean } {
  const pin = student.parentPin?.trim() || '';
  if (pin) return { pin, fallback: false };
  for (const tel of allStudentPhones(student)) {
    const digits = tel.replace(/\D/g, '');
    if (digits.length >= 4) return { pin: digits.slice(-4), fallback: true };
  }
  return { pin: '', fallback: false };
}

export function studentLoginSecret(student: Student): string {
  return student.password?.trim() || '';
}

export function matchesParentSearch(student: Student, term: string): boolean {
  if (!term.trim()) return true;
  const hay = [
    student.name,
    student.parentName,
    student.fatherName,
    student.motherName,
    student.parentPhone,
    student.fatherPhone,
    student.motherPhone,
    student.tcNo,
    student.group,
    student.username,
    student.parentPin,
    ...(student.contactNumbers ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  const needle = term.trim().toLocaleLowerCase('tr');
  const digits = term.replace(/\D/g, '');
  return hay.toLocaleLowerCase('tr').includes(needle)
    || (digits.length >= 3 && hay.replace(/\D/g, '').includes(digits));
}
