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
