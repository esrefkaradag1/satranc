/** Türkiye cep telefonu: 10 hane (5XXXXXXXXX) veya 11 hane (05XXXXXXXXX) kabul edilir. */
export function normalizeTrPhoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('90') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return d.slice(0, 10);
}

export function isValidTrPhone(input: string): boolean {
  const d = normalizeTrPhoneDigits(input);
  return d.length === 10 && d.startsWith('5');
}

/** Görüntüleme: 0 5XX XXX XX XX */
export function formatTrPhoneDisplay(digits?: string): string {
  const d = normalizeTrPhoneDigits(digits || '');
  if (d.length < 10) return digits?.trim() || '—';
  return `0 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}
