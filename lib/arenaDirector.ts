import type { Tournament, TournamentPairing } from '../types';
import { getServiceSupabase, isSupabaseBackend, supabase } from '../services/supabase';
import { dbToTournament } from './tournamentDb';
import { pairArenaRound, pairSwissRound, recalcStandings, type PairingPlayer } from './tournamentPairing';
import { swissRoundIntervalMs } from './tournamentStatus';

export { swissNeedsDirector, swissRoundIntervalMs } from './tournamentStatus';
import {
  createTournamentGames,
  fetchTournamentGames,
  finishTournamentGame,
  type TournamentGame,
} from './tournamentGames';

/**
 * Arena turnuva yöneticisi — antrenör ekranı açık olmasa da turnuvayı yürütür.
 * Katılan öğrencilerin panelleri ve antrenör ekranı birkaç saniyede bir `runArenaTick`
 * çağırır; veritabanı kirası (supabase_tournament_director.sql) sayesinde aynı anda
 * yalnızca bir istemci bir adım çalıştırır. Adım idempotenttir: tekrar çalışması zarar vermez.
 *
 * Bir adım:
 *  1. Saati bitmiş ama kimsenin kapatmadığı maçları (oyuncular ekranı kapattıysa) bitirir.
 *  2. Biten maçların sonuçlarını turnuvanın eşleşmelerine işler, sıralamayı yeniden hesaplar.
 *  3. Turnuva süresi içindeyse boştaki oyuncuları eşleştirir ve canlı maçlarını açar.
 */

export const ARENA_TICK_MS = 3000;
const LEASE_TTL_MS = 10000;
/** Saat bitiminden sonra oyuncu istemcisinin kendisi bitirsin diye kısa tolerans. */
const FLAG_GRACE_MS = 3000;
/** Maçı yeni biten oyuncu bir an nefes alsın (lichess Arena da hemen eşleştirmez). */
const PAIR_COOLDOWN_MS = 3000;

let holderId: string | null = null;
function directorHolderId(): string {
  if (!holderId) {
    holderId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `h-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return holderId;
}

function client() {
  if (!isSupabaseBackend()) return null;
  return getServiceSupabase() ?? supabase;
}

type LeaseResult = 'acquired' | 'busy' | 'unavailable';
let leaseRpcMissing = false;

async function acquireLease(tournamentId: string): Promise<LeaseResult> {
  const sb = client();
  if (!sb) return 'unavailable';
  if (leaseRpcMissing) return 'unavailable';
  const { data, error } = await sb.rpc('tournament_director_lease', {
    p_tournament_id: tournamentId,
    p_holder: directorHolderId(),
    p_ttl_ms: LEASE_TTL_MS,
  });
  if (error) {
    // Migration çalıştırılmamış: tekrar tekrar denemeyelim.
    if (/function|does not exist|schema cache/i.test(error.message)) leaseRpcMissing = true;
    console.warn('[ArenaDirector] lease error:', error.message);
    return 'unavailable';
  }
  return data === true ? 'acquired' : 'busy';
}

export function arenaPhase(t: Pick<Tournament, 'startAt' | 'durationMinutes'>, now = Date.now()): 'upcoming' | 'running' | 'over' {
  const start = new Date(t.startAt).getTime();
  if (!Number.isFinite(start) || now < start) return 'upcoming';
  const end = start + Math.max(0, t.durationMinutes || 0) * 60000;
  return now < end ? 'running' : 'over';
}

function gameClockExpired(g: TournamentGame, now: number): '1-0' | '0-1' | null {
  if (g.status !== 'active' || !g.turnStartedAt) return null;
  const turn = (g.fen.split(' ')[1] as 'w' | 'b') || 'w';
  const elapsed = now - new Date(g.turnStartedAt).getTime();
  const left = (turn === 'w' ? g.whiteTimeMs : g.blackTimeMs) - elapsed;
  if (left > -FLAG_GRACE_MS) return null;
  return turn === 'w' ? '0-1' : '1-0';
}

async function loadTournament(tournamentId: string): Promise<Tournament | null> {
  const sb = client();
  if (!sb) return null;
  const { data, error } = await sb.from('tournaments').select('*').eq('id', tournamentId).maybeSingle();
  if (error || !data) return null;
  return dbToTournament(data as Record<string, unknown>);
}

async function loadPlayers(t: Tournament): Promise<PairingPlayer[]> {
  const sb = client();
  const ids = t.participantIds ?? [];
  if (!sb || ids.length === 0) return [];
  const { data } = await sb.from('students').select('id,elo,group_name,club_id').in('id', ids);
  const source = t.teamBattle?.source ?? 'group';
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    rating: Number(r.elo) || 0,
    team: source === 'club' ? (r.club_id != null ? String(r.club_id) : undefined) : (r.group_name != null ? String(r.group_name) : undefined),
  }));
}

export type ArenaTickOutcome = {
  /** DB'deki güncel turnuva (adım sonrası) — ekranlar bununla tazelenir */
  tournament: Tournament | null;
  ran: boolean;
};

/**
 * @param allowWithoutLease Kira tablosu/RPC yoksa (migration çalıştırılmamış) yine de çalış.
 *   Yalnızca antrenör ekranı true verir — eski davranış (antrenör yönetir) korunur;
 *   öğrenciler kilitsiz çalışmaz, yoksa aynı oyuncular iki kez eşleşebilir.
 */
export async function runArenaTick(tournamentId: string, opts?: { allowWithoutLease?: boolean }): Promise<ArenaTickOutcome> {
  const lease = await acquireLease(tournamentId);
  if (lease === 'busy' || (lease === 'unavailable' && !opts?.allowWithoutLease)) {
    return { tournament: await loadTournament(tournamentId), ran: false };
  }

  const t = await loadTournament(tournamentId);
  if (!t || (t.format !== 'arena' && t.format !== 'swiss')) return { tournament: t, ran: false };

  const now = Date.now();
  let games = await fetchTournamentGames(t.id);

  // 1) Sahipsiz kalan (oyuncuların ekranı kapalı) maçlarda saat bitişi.
  const flagged = games
    .map((g) => ({ g, result: gameClockExpired(g, now) }))
    .filter((x): x is { g: TournamentGame; result: '1-0' | '0-1' } => x.result != null);
  if (flagged.length > 0) {
    await Promise.all(flagged.map(({ g, result }) => finishTournamentGame({ gameId: g.id, result })));
    games = await fetchTournamentGames(t.id);
  }

  // 2) Biten maçların sonuçlarını eşleşmelere işle.
  const finished = new Map(
    games.filter((g) => g.status === 'finished' && g.result).map((g) => [g.id, g.result as TournamentPairing['result']]),
  );
  const finishedAt = new Map(games.map((g) => [g.id, g.finishedAt ? new Date(g.finishedAt).getTime() : 0]));
  let changed = false;
  let rounds = (t.rounds ?? []).map((r) => ({
    ...r,
    pairings: r.pairings.map((p) => {
      const res = p.gameId ? finished.get(p.gameId) : undefined;
      if (res && p.result !== res) {
        changed = true;
        return { ...p, result: res };
      }
      return p;
    }),
  }));

  // 3b) İsviçre (lichess Swiss gibi): başlangıçta 1. tur; tur tamamen bitince, tempoya göre
  //     kısa bir aradan sonra sıradaki tur; tur sayısına ulaşınca turnuva biter. Elle eşleştirme gerekmez.
  if (t.format === 'swiss') {
    const roundLimit = t.roundLimit ?? 0;
    const start = new Date(t.startAt).getTime();

    // Eski elle eşleştirme İsviçre için canlı maç açmıyordu: süren turda oyunu olmayan,
    // sonucu girilmemiş eşleşmelere canlı maçı sonradan aç (yoksa tur sonsuza dek sonuçsuz bekler).
    const current = rounds[rounds.length - 1];
    const missing = current
      ? current.pairings.filter((p): p is TournamentPairing & { blackId: string } => p.blackId != null && !p.gameId && !p.result)
      : [];
    if (current && missing.length > 0) {
      const created = await createTournamentGames(missing.map((p) => ({
        tournamentId: t.id,
        roundNo: current.roundNo,
        whiteStudentId: p.whiteId,
        blackStudentId: p.blackId,
        timeControl: t.timeControl,
      })));
      if (created.length > 0) {
        const byPair = new Map(created.map((g) => [`${g.whiteStudentId}|${g.blackStudentId}`, g.id]));
        rounds = rounds.map((r) => (r.id !== current.id ? r : {
          ...r,
          pairings: r.pairings.map((p) => {
            if (p.blackId == null || p.gameId || p.result) return p;
            const gameId = byPair.get(`${p.whiteId}|${p.blackId}`);
            return gameId ? { ...p, gameId } : p;
          }),
        }));
        changed = true;
      }
    }

    const last = rounds[rounds.length - 1];
    const lastComplete = !last || last.pairings.every((p) => !!p.result);
    let due = false;
    if (roundLimit > 0 && Number.isFinite(start) && now >= start && rounds.length < roundLimit && lastComplete) {
      if (!last) {
        due = true;
      } else {
        const lastFinishedAt = Math.max(
          new Date(last.createdAt).getTime() || 0,
          ...last.pairings.map((p) => (p.gameId ? finishedAt.get(p.gameId) ?? 0 : 0)),
        );
        due = now - lastFinishedAt >= swissRoundIntervalMs(t.timeControl);
      }
    }
    if (due && (t.participantIds?.length ?? 0) >= 2) {
      const candidate: Tournament = { ...t, rounds };
      const players = await loadPlayers(candidate);
      const { pairings } = pairSwissRound(candidate, players);
      const real = pairings.filter((p): p is TournamentPairing & { blackId: string } => p.blackId != null);
      if (real.length > 0) {
        const roundNo = rounds.length + 1;
        const created = await createTournamentGames(real.map((p) => ({
          tournamentId: t.id,
          roundNo,
          whiteStudentId: p.whiteId,
          blackStudentId: p.blackId,
          timeControl: t.timeControl,
        })));
        // Maçlar tek toplu kayıtla açılır (hepsi ya da hiçbiri). Açılamadıysa turu yazma; sonraki adım tekrar dener.
        if (created.length === real.length) {
          const byPair = new Map(created.map((g) => [`${g.whiteStudentId}|${g.blackStudentId}`, g.id]));
          const withGames = pairings.map((p) => (p.blackId == null ? p : { ...p, gameId: byPair.get(`${p.whiteId}|${p.blackId}`) }));
          rounds = [...rounds, { id: `${t.id}-r${roundNo}`, roundNo, createdAt: new Date().toISOString(), pairings: withGames }];
          changed = true;
        }
      }
    }
  }

  // 3) Arena: süre içindeyse boştakileri eşleştir.
  if (t.format === 'arena' && arenaPhase(t, now) === 'running') {
    // Az önce maçı biten oyuncu birkaç saniye beklesin.
    const justFinished = new Set<string>();
    for (const r of rounds) {
      for (const p of r.pairings) {
        if (!p.gameId || !p.result) continue;
        if (now - (finishedAt.get(p.gameId) ?? 0) < PAIR_COOLDOWN_MS) {
          justFinished.add(p.whiteId);
          if (p.blackId) justFinished.add(p.blackId);
        }
      }
    }
    const candidate: Tournament = { ...t, rounds };
    const players = await loadPlayers(candidate);
    const { pairings } = pairArenaRound(candidate, players);
    const ready = pairings.filter((p) => p.blackId != null && !justFinished.has(p.whiteId) && !justFinished.has(p.blackId));
    if (ready.length > 0) {
      const roundNo = rounds.length + 1;
      const created = await createTournamentGames(ready.map((p) => ({
        tournamentId: t.id,
        roundNo,
        whiteStudentId: p.whiteId,
        blackStudentId: p.blackId as string,
        timeControl: t.timeControl,
      })));
      const byPair = new Map(created.map((g) => [`${g.whiteStudentId}|${g.blackStudentId}`, g.id]));
      const withGames = ready
        .map((p) => ({ ...p, gameId: byPair.get(`${p.whiteId}|${p.blackId}`) }))
        .filter((p) => !!p.gameId); // maç açılamadıysa eşleşmeyi yazma, sonraki adım tekrar dener
      if (withGames.length > 0) {
        rounds = [...rounds, { id: `${t.id}-r${roundNo}`, roundNo, createdAt: new Date().toISOString(), pairings: withGames }];
        changed = true;
      }
    }
  }

  if (!changed) return { tournament: t, ran: true };

  const next: Tournament = { ...t, rounds };
  next.standings = recalcStandings(next);
  const sb = client();
  if (sb) {
    const { error } = await sb.from('tournaments').update({ rounds: next.rounds, standings: next.standings }).eq('id', t.id);
    if (error) {
      console.warn('[ArenaDirector] tournament write error:', error.message);
      return { tournament: t, ran: true };
    }
  }
  return { tournament: next, ran: true };
}
