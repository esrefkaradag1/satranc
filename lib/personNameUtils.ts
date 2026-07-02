import type { StudentApplication } from './applicationTypes';
import type { Student } from '../types';

/** Kişi adını Türkçe kurallarıyla tamamen büyük harfe çevirir. */
export function formatPersonName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return trimmed.toLocaleUpperCase('tr-TR');
}

const STUDENT_NAME_KEYS = ['name', 'parentName', 'fatherName', 'motherName'] as const;

export function normalizeStudentPersonNames<T extends Partial<Student>>(student: T): T {
  const out = { ...student };
  for (const key of STUDENT_NAME_KEYS) {
    const value = out[key];
    if (typeof value === 'string' && value.trim()) {
      out[key] = formatPersonName(value) as T[typeof key];
    }
  }
  return out;
}

export function normalizeApplicationPersonNames(app: StudentApplication): StudentApplication {
  return {
    ...app,
    name: formatPersonName(app.name),
    fatherName: formatPersonName(app.fatherName),
    motherName: formatPersonName(app.motherName),
    signatureName: formatPersonName(app.signatureName),
    registrarSignatureName: app.registrarSignatureName
      ? formatPersonName(app.registrarSignatureName)
      : app.registrarSignatureName,
  };
}
