import type { Tournament } from '../types';

export type TournamentLifecycle = 'upcoming' | 'ongoing' | 'finished';

type StatusFields = Pick<Tournament, 'format' | 'startAt' | 'durationMinutes' | 'roundLimit' | 'rounds'>;

/**
 * İsviçre turnuvası süreyle değil turla biter: planlanan tur sayısına ulaşılıp
 * son turun tüm sonuçları girildiğinde tamamlanmış sayılır.
 */
export function isSwissComplete(t: Pick<Tournament, 'roundLimit' | 'rounds'>): boolean {
  const rounds = t.rounds ?? [];
  if (!t.roundLimit || rounds.length < t.roundLimit) return false;
  const last = rounds[rounds.length - 1];
  return !!last && last.pairings.every((p) => !!p.result);
}

/** Arena: başlangıç + süre. İsviçre: başladıktan sonra turlar bitene kadar sürer. */
export function getTournamentLifecycle(t: StatusFields, now = Date.now()): TournamentLifecycle {
  const start = new Date(t.startAt).getTime();
  if (Number.isFinite(start) && now < start) return 'upcoming';
  // Tur sayısı olmayan eski İsviçre kayıtları süreye göre değerlendirilir
  if (t.format === 'swiss' && t.roundLimit) {
    return isSwissComplete(t) ? 'finished' : 'ongoing';
  }
  const end = start + Math.max(0, t.durationMinutes || 0) * 60000;
  return now < end ? 'ongoing' : 'finished';
}

/** Listelerde gösterilecek uzunluk: Arena "45 dk", İsviçre "5 tur" */
export function tournamentLengthLabel(t: Pick<Tournament, 'format' | 'durationMinutes' | 'roundLimit'>): string {
  if (t.format === 'swiss' && t.roundLimit) return `${t.roundLimit} tur`;
  return `${t.durationMinutes} dk`;
}

/**
 * İsviçre turları arası bekleme — lichess (lila SwissForm.autoInterval) "auto" değerleri:
 * UltraBullet 5 sn, Bullet 10 sn, Blitz <5 dk 20 sn / diğer 30 sn, Rapid 60 sn, Klasik 300 sn.
 */
export function swissRoundIntervalMs(timeControl: string): number {
  const [baseRaw, incRaw] = String(timeControl || '').split('+');
  const base = Number(baseRaw);
  const inc = Number(incRaw) || 0;
  if (!Number.isFinite(base)) return 60_000;
  const estimate = base * 60 + inc * 40; // lichess: tahmini toplam süre (sn)
  if (estimate < 30) return 5_000;
  if (estimate < 180) return 10_000;
  if (estimate < 300) return 20_000;
  if (estimate < 480) return 30_000;
  if (estimate < 1500) return 60_000;
  return 300_000;
}

/** İsviçre: başladı mı ve hâlâ oynanacak tur var mı (yönetici gerekli mi)? */
export function swissNeedsDirector(t: Pick<Tournament, 'format' | 'roundLimit' | 'startAt' | 'rounds'>, now = Date.now()): boolean {
  if (t.format !== 'swiss' || !t.roundLimit) return false;
  const start = new Date(t.startAt).getTime();
  if (!Number.isFinite(start) || now < start) return false;
  const rounds = t.rounds ?? [];
  const last = rounds[rounds.length - 1];
  const lastComplete = !last || last.pairings.every((p) => !!p.result);
  return !(rounds.length >= t.roundLimit && lastComplete);
}
