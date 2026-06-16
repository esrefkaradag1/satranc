export function validateTcNo(tc: string): boolean {
  const d = tc.replace(/\D/g, '');
  if (d.length !== 11 || d[0] === '0') return false;
  const digits = d.split('').map(Number);
  if (digits.some((n) => Number.isNaN(n))) return false;
  const odd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const even = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = ((odd * 7 - even) % 10 + 10) % 10;
  const d11 = digits.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return digits[9] === d10 && digits[10] === d11;
}

import { isValidTrPhone } from './phoneUtils';

export function validateTrPhone(phone: string): boolean {
  return isValidTrPhone(phone);
}

export function ageFromBirthDate(iso: string): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}
