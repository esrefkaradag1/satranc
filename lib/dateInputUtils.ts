/** type="date" girişinde yılı en fazla 4 haneye kısıtlar (ör. 202606 → 2026) */
export function normalizeDateInputYear(value: string): string {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [yearRaw, month, day] = parts;
  const year = yearRaw.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return value;
  const m = month.padStart(2, '0').slice(0, 2);
  const d = day.padStart(2, '0').slice(0, 2);
  return `${year}-${m}-${d}`;
}

export const DATE_INPUT_MIN = '1900-01-01';
export const DATE_INPUT_MAX = '2099-12-31';
