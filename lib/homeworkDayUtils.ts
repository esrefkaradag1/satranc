export function istanbulDayKey(ref = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

export function shiftIstanbulDayKey(day: string, deltaDays: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00+03:00`);
  d.setDate(d.getDate() + deltaDays);
  return istanbulDayKey(d);
}

/** Ödev/platform gün anahtarı — sunucu cron ile aynı (Europe/Istanbul). */
export function homeworkDayKey(ref = new Date()): string {
  return istanbulDayKey(ref);
}

/** @deprecated Ödev/platform için homeworkDayKey kullanın. */
export function todayDayKey(ref = new Date()): string {
  return homeworkDayKey(ref);
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

/** Günlük ödev günü kapanışına (23:59 İstanbul) kalan süre */
export function msUntilDailyHomeworkClose(ref = new Date()): number {
  const today = homeworkDayKey(ref);
  const closeMs = new Date(`${today}T23:59:59+03:00`).getTime();
  return Math.max(0, closeMs - ref.getTime());
}

export function formatMidnightCountdown(ref = new Date()): string {
  const ms = msUntilDailyHomeworkClose(ref);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}sa ${m}dk ${s}sn`;
}

export function isToday(isoDate: string): boolean {
  return isoDate.slice(0, 10) === homeworkDayKey();
}

/** Günlük hedef günü kapandı mı? (geçmiş günler veya bugün 23:59 sonrası) */
export function isDailyHomeworkDayClosed(isoDate: string, ref = new Date()): boolean {
  const day = isoDate.slice(0, 10);
  const today = homeworkDayKey(ref);
  if (day < today) return true;
  if (day > today) return false;
  const closeMs = new Date(`${today}T23:59:59+03:00`).getTime();
  return ref.getTime() >= closeMs;
}

export function resolveDayCompletionStatus(
  isoDate: string,
  done: boolean,
  hasActivity = false,
  ref = new Date(),
): DayCompletionStatus {
  if (done) return 'done';
  if (isDailyHomeworkDayClosed(isoDate, ref)) {
    return hasActivity ? 'partial' : 'missed';
  }
  if (isoDate.slice(0, 10) > homeworkDayKey(ref)) return 'pending';
  return 'pending';
}

export function dayCompletionLabel(
  status: DayCompletionStatus,
  opts?: { isToday?: boolean },
): string {
  switch (status) {
    case 'done':
      return 'Tamam';
    case 'partial':
      return 'Kısmi yaptı';
    case 'missed':
      return 'Yapılmadı';
    case 'pending':
      return opts?.isToday ? 'Bugün' : 'Bekliyor';
    default:
      return '—';
  }
}

/** ISO gün anahtarında ±N gün kaydırır */
export function shiftDayKey(isoDate: string, deltaDays: number): string {
  return shiftIstanbulDayKey(isoDate.slice(0, 10), deltaDays);
}

export type DayCompletionStatus = 'done' | 'missed' | 'partial' | 'pending' | 'none';

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
  return homeworkDayKey(d);
}
