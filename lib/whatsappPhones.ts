import type { Student } from '../types';
import { isValidWhatsAppPhone } from './whatsappUtils';

/** Öğrencinin veli telefonlarını benzersiz ve geçerli sırayla döndürür */
export function parentPhonesForStudent(student: Student): string[] {
  const raw = [
    student.fatherPhone,
    student.motherPhone,
    student.parentPhone,
    ...(student.contactNumbers ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const trimmed = (p ?? '').trim();
    if (!trimmed || !isValidWhatsAppPhone(trimmed)) continue;
    const key = trimmed.replace(/\D/g, '').slice(-10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function primaryParentPhone(student: Student): string {
  return parentPhonesForStudent(student)[0] ?? '';
}
