import type { Student } from '../types';
import { isValidWhatsAppPhone } from './whatsappUtils';

function normalizeTarget(student: Student): 'father' | 'mother' | 'both' {
  const raw = student.whatsappNotifyTarget;
  if (raw === 'mother' || raw === 'both' || raw === 'father') return raw;
  return 'father';
}

function phonesForTarget(student: Student, target: 'father' | 'mother' | 'both'): string[] {
  const father = (student.fatherPhone ?? '').trim();
  const mother = (student.motherPhone ?? '').trim();
  const parent = (student.parentPhone ?? '').trim();
  const extras = Array.isArray(student.contactNumbers) ? student.contactNumbers : [];

  if (target === 'father') {
    if (father) return [father];
    if (mother) return [mother];
    if (parent) return [parent];
    return extras.map((p) => String(p ?? '').trim()).filter(Boolean);
  }
  if (target === 'mother') {
    if (mother) return [mother];
    if (father) return [father];
    if (parent) return [parent];
    return extras.map((p) => String(p ?? '').trim()).filter(Boolean);
  }

  const ordered = [father, mother, parent, ...extras];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ordered) {
    const trimmed = (p ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.replace(/\D/g, '').slice(-10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Öğrencinin veli telefonlarını benzersiz ve geçerli sırayla döndürür */
export function parentPhonesForStudent(student: Student): string[] {
  const target = normalizeTarget(student);
  const raw = phonesForTarget(student, target);
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
