/** Yerel takvim günü: YYYY-MM-DD */
export function todayDayKey(ref = new Date()): string {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localDayKeyFromMs(ms: number): string {
  return todayDayKey(new Date(ms));
}

export function utcDayKeyFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function timestampMatchesDay(ms: number, target: string): boolean {
  const day = target.slice(0, 10);
  return localDayKeyFromMs(ms) === day || utcDayKeyFromMs(ms) === day;
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

/** ISO gün anahtarında ±N gün kaydırır */
export function shiftDayKey(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return todayDayKey(d);
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
  return todayDayKey(d);
}
