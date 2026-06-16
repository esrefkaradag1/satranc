/** ISO tarih: YYYY-MM-DD */
export function todayDayKey(ref = new Date()): string {
  return ref.toISOString().slice(0, 10);
}

export function weekdayKeyFromIso(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function msUntilLocalMidnight(ref = new Date()): number {
  const end = new Date(ref);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, end.getTime() - ref.getTime());
}

export function formatMidnightCountdown(ref = new Date()): string {
  const ms = msUntilLocalMidnight(ref);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}sa ${m}dk ${s}sn`;
}

export function isToday(isoDate: string): boolean {
  return isoDate === todayDayKey();
}

export type DayCompletionStatus = 'done' | 'missed' | 'pending' | 'none';

/** Haftanın pazartesi günü (öğlen, yerel) */
export function mondayOfWeek(ref = new Date()): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** weekday 1=Pzt … 7=Paz */
export function isoDateForWeekday(monday: Date, weekday: number): string {
  const d = new Date(monday);
  d.setDate(d.getDate() + weekday - 1);
  return d.toISOString().slice(0, 10);
}
