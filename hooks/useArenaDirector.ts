import { useEffect, useRef } from 'react';
import type { Tournament } from '../types';
import { ARENA_TICK_MS, arenaPhase, runArenaTick, swissNeedsDirector } from '../lib/arenaDirector';

/** Bitişten sonra da kısa süre çalış: süren son maçların sonucu sıralamaya işlensin. */
const AFTER_END_MS = 15 * 60 * 1000;

function needsDirector(t: Tournament, now: number): boolean {
  if (t.format === 'swiss') return swissNeedsDirector(t, now);
  if (t.format !== 'arena') return false;
  const phase = arenaPhase(t, now);
  if (phase === 'running') return true;
  if (phase === 'upcoming') return false;
  const end = new Date(t.startAt).getTime() + Math.max(0, t.durationMinutes || 0) * 60000;
  return now - end < AFTER_END_MS;
}

/**
 * Açık olan her ekran (öğrenci paneli, antrenör turnuva ekranı) bu kancayla arena
 * turnuvalarını yürütmeye aday olur; hangisinin yürüteceğine DB kirası karar verir.
 * `onTournament`, DB'deki güncel turnuvayı verir (sıralama/eşleşmeler canlı tazelenir).
 */
export function useArenaDirector(
  tournaments: Tournament[],
  onTournament: (t: Tournament) => void,
  opts?: { allowWithoutLease?: boolean },
): void {
  const listRef = useRef(tournaments);
  listRef.current = tournaments;
  const cbRef = useRef(onTournament);
  cbRef.current = onTournament;
  const allowRef = useRef(!!opts?.allowWithoutLease);
  allowRef.current = !!opts?.allowWithoutLease;

  // Yalnızca aday kümesi değişince zamanlayıcıyı yeniden kur (her render'da değil).
  const key = tournaments
    .filter((t) => t.format === 'arena' || t.format === 'swiss')
    .map((t) => `${t.id}@${t.startAt}+${t.durationMinutes}+${t.roundLimit ?? ''}`)
    .sort()
    .join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let running = false;
    const tick = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const now = Date.now();
        for (const t of listRef.current.filter((x) => needsDirector(x, now))) {
          if (cancelled) break;
          try {
            const out = await runArenaTick(t.id, { allowWithoutLease: allowRef.current });
            if (!cancelled && out.tournament) cbRef.current(out.tournament);
          } catch (e) {
            console.warn('[ArenaDirector] tick failed:', e);
          }
        }
      } finally {
        running = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), ARENA_TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key]);
}
