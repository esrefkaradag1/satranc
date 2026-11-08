/**
 * Gerçek turnuva eşleştirme motoru.
 *
 * Lichess'in (lila-master) turnuva mantığından port edilmiştir:
 * - Arena: oyuncular puana göre sıralanır, bitişik rakipler eşleştirilir
 *   (lila `arena.PairingSystem.proximityPairings`), tekrar eşleşmeden kaçınılır,
 *   renk önceki beyaz/siyah sayılarına göre dengelenir (lila `ColorHistory`).
 * - Swiss: FIDE Dutch sistemi — puan gruplarına ayırma, grup içinde üst/alt
 *   yarıyı eşleştirme, tekrar eşleşmeden kaçınma, renk dengesi, tek kalan
 *   oyuncu bir alt puan grubuna "float" eder, turnuva genelinde tek kalan
 *   oyuncuya bay (serbest 1 puan) verilir.
 * - Derece ayırıcı: Sonneborn-Berger puanı, lila `SwissScoring.compute`
 *   formülüyle aynıdır (galibiyette rakibin tam puanı, remide yarısı).
 */
import type { Tournament, TournamentPairing, TournamentStanding } from '../types';

export interface PairingPlayer {
  id: string;
  /** Kuvvet sıralaması için (Elo/UKD); yoksa 0 kabul edilir */
  rating?: number;
}

export type StandingsTable = Record<string, TournamentStanding>;

const emptyStanding = (): TournamentStanding => ({ played: 0, wins: 0, draws: 0, losses: 0, points: 0, tieBreak: 0 });

/** Bir turnuvanın tüm turlarındaki, sonucu girilmiş eşleşmelerini düzleştirir. */
function playedPairings(t: Tournament): TournamentPairing[] {
  return (t.rounds ?? []).flatMap((r) => r.pairings).filter((p) => !!p.result);
}

/** Temel sıralama puanları (galibiyet 1, remi 0.5, bay 1). Sonneborn-Berger hariç. */
function basePoints(t: Tournament): StandingsTable {
  const standings: StandingsTable = {};
  for (const id of t.participantIds ?? []) standings[id] = emptyStanding();

  for (const p of playedPairings(t)) {
    standings[p.whiteId] ??= emptyStanding();
    if (p.blackId == null) {
      // Bay: rakipsiz, tam puan, galibiyet/mağlubiyet istatistiğine girmez.
      standings[p.whiteId].played += 1;
      standings[p.whiteId].points += 1;
      continue;
    }
    standings[p.blackId] ??= emptyStanding();
    standings[p.whiteId].played += 1;
    standings[p.blackId].played += 1;
    if (p.result === '1-0') {
      standings[p.whiteId].wins += 1;
      standings[p.whiteId].points += 1;
      standings[p.blackId].losses += 1;
    } else if (p.result === '0-1') {
      standings[p.blackId].wins += 1;
      standings[p.blackId].points += 1;
      standings[p.whiteId].losses += 1;
    } else {
      standings[p.whiteId].draws += 1;
      standings[p.blackId].draws += 1;
      standings[p.whiteId].points += 0.5;
      standings[p.blackId].points += 0.5;
    }
  }
  return standings;
}

/**
 * Sıralama puanları + Sonneborn-Berger derece ayırıcı.
 * lila `SwissScoring.computePlayers`: galibiyette rakibin toplam puanı tam,
 * remide yarısı eklenir; bay turunda oyuncunun o anki puanının yarısı eklenir.
 */
export function recalcStandings(t: Tournament): StandingsTable {
  const standings = basePoints(t);
  const tieBreak: Record<string, number> = {};
  for (const id of Object.keys(standings)) tieBreak[id] = 0;

  for (const p of playedPairings(t)) {
    if (p.blackId == null) {
      tieBreak[p.whiteId] = (tieBreak[p.whiteId] ?? 0) + standings[p.whiteId].points / 2;
      continue;
    }
    const whitePts = standings[p.blackId]?.points ?? 0;
    const blackPts = standings[p.whiteId]?.points ?? 0;
    if (p.result === '1-0') {
      tieBreak[p.whiteId] = (tieBreak[p.whiteId] ?? 0) + whitePts;
    } else if (p.result === '0-1') {
      tieBreak[p.blackId] = (tieBreak[p.blackId] ?? 0) + blackPts;
    } else {
      tieBreak[p.whiteId] = (tieBreak[p.whiteId] ?? 0) + whitePts / 2;
      tieBreak[p.blackId] = (tieBreak[p.blackId] ?? 0) + blackPts / 2;
    }
  }

  for (const id of Object.keys(standings)) {
    standings[id].tieBreak = Math.round((tieBreak[id] ?? 0) * 100) / 100;
  }
  return standings;
}

/** Katılımcıları puana ve Sonneborn-Berger'e göre sıralar (1. = lider). */
export function rankParticipants(t: Tournament, standings: StandingsTable): string[] {
  return [...(t.participantIds ?? [])].sort((a, b) => {
    const sa = standings[a] ?? emptyStanding();
    const sb = standings[b] ?? emptyStanding();
    return sb.points - sa.points || sb.tieBreak - sa.tieBreak;
  });
}

interface ColorCount {
  white: number;
  black: number;
}

function colorHistory(t: Tournament): Map<string, ColorCount> {
  const map = new Map<string, ColorCount>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) {
      c = { white: 0, black: 0 };
      map.set(id, c);
    }
    return c;
  };
  for (const p of playedPairings(t)) {
    get(p.whiteId).white += 1;
    if (p.blackId != null) get(p.blackId).black += 1;
  }
  return map;
}

function opponentHistory(t: Tournament): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = new Set();
      map.set(id, s);
    }
    return s;
  };
  for (const p of playedPairings(t)) {
    if (p.blackId == null) continue;
    get(p.whiteId).add(p.blackId);
    get(p.blackId).add(p.whiteId);
  }
  return map;
}

/** Daha önce beyazla oynamış oyuncuya siyah, siyahla oynamışa beyaz verir (lila `ColorHistory.firstGetsWhite`). */
function assignColors(
  aId: string,
  bId: string,
  colors: Map<string, ColorCount>,
): [string, string] {
  const a = colors.get(aId) ?? { white: 0, black: 0 };
  const b = colors.get(bId) ?? { white: 0, black: 0 };
  const aBalance = a.white - a.black;
  const bBalance = b.white - b.black;
  if (aBalance === bBalance) {
    return Math.random() < 0.5 ? [aId, bId] : [bId, aId];
  }
  // Beyaz sayısı/siyah sayısı farkı daha büyük (daha çok beyaz oynamış) olan bu sefer siyah alır.
  return aBalance > bBalance ? [bId, aId] : [aId, bId];
}

function ratingOf(players: PairingPlayer[], id: string): number {
  return players.find((p) => p.id === id)?.rating ?? 0;
}

export interface PairingResult {
  pairings: TournamentPairing[];
}

/**
 * Arena eşleştirmesi: puana (ve eşitlikte kuvvete) göre sıralı listede
 * bitişik oyuncular eşleştirilir (lila `arena.PairingSystem.proximityPairings`).
 * Tekrar eşleşme varsa bir sonraki aday ile takas denenir. Tek sayıda oyuncu
 * varsa en alttaki oyuncu bu turda bekler (gerçek Arena'da olduğu gibi serbest
 * puan verilmez).
 */
export function pairArenaRound(tournament: Tournament, players: PairingPlayer[]): PairingResult {
  const standings = recalcStandings(tournament);
  const opponents = opponentHistory(tournament);
  const colors = colorHistory(tournament);

  const pool = [...(tournament.participantIds ?? [])].sort((a, b) => {
    const sa = standings[a] ?? emptyStanding();
    const sb = standings[b] ?? emptyStanding();
    return sb.points - sa.points || ratingOf(players, b) - ratingOf(players, a);
  });

  const pairings: TournamentPairing[] = [];
  const used = new Set<string>();

  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a)) continue;
    // En yakın sırada, daha önce eşleşmemiş bir rakip ara (kısa mesafede takas).
    let opponentIdx = -1;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      if (used.has(b)) continue;
      if (!opponents.get(a)?.has(b)) {
        opponentIdx = j;
        break;
      }
      if (opponentIdx === -1) opponentIdx = j; // tekrar eşleşme olsa da yedek olarak tut
    }
    if (opponentIdx === -1) continue; // tek kalan oyuncu (bekler)
    const b = pool[opponentIdx];
    used.add(a);
    used.add(b);
    const [white, black] = assignColors(a, b, colors);
    pairings.push({ whiteId: white, blackId: black });
  }

  return { pairings };
}

/**
 * İsviçre sistemi (Dutch) eşleştirmesi:
 * 1. Katılımcılar puan gruplarına ayrılır (yüksekten alçağa).
 * 2. Her grup kuvvete göre sıralanır; tek sayıdaysa en alttaki oyuncu bir
 *    sonraki (daha düşük puanlı) gruba "float" eder.
 * 3. Grup ikiye bölünür (üst yarı S1, alt yarı S2) ve S1[i] – S2[i] eşleştirilir
 *    (klasik Dutch eşleştirme). Tekrar eşleşme varsa S2 içinde komşu ile takas denenir.
 * 4. Turnuva genelinde tek kalan oyuncuya (henüz bay almamış, en düşük sıralı)
 *    bay verilir — lichess İsviçre'de bay 1 puan değerindedir.
 */
export function pairSwissRound(tournament: Tournament, players: PairingPlayer[]): PairingResult {
  const standings = recalcStandings(tournament);
  const opponents = opponentHistory(tournament);
  const colors = colorHistory(tournament);

  const byPoints = new Map<number, string[]>();
  for (const id of tournament.participantIds ?? []) {
    const pts = standings[id]?.points ?? 0;
    const arr = byPoints.get(pts) ?? [];
    arr.push(id);
    byPoints.set(pts, arr);
  }
  const scoreGroups = [...byPoints.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, ids]) => ids.sort((a, b) => ratingOf(players, b) - ratingOf(players, a)));

  const pairings: TournamentPairing[] = [];
  const paired = new Set<string>();
  let floaters: string[] = [];

  const tryPairGroup = (group: string[]): string[] => {
    // Gruptan daha önce eşleşmiş oyuncular arasında tekrar eşleşmeyi en aza indirmek için
    // basit takaslı Dutch bölme.
    let g = group;
    if (g.length % 2 === 1) {
      // En düşük sıralı oyuncu alt gruba float eder.
      const floater = g[g.length - 1];
      floaters.push(floater);
      g = g.slice(0, -1);
    }
    const half = g.length / 2;
    const top = g.slice(0, half);
    const bottom = g.slice(half);
    const unresolved: string[] = [];
    for (let i = 0; i < top.length; i++) {
      const a = top[i];
      if (paired.has(a)) continue;
      let j = i;
      let b = bottom[j];
      let tries = 0;
      while (b !== undefined && (paired.has(b) || opponents.get(a)?.has(b)) && tries < bottom.length) {
        j = (j + 1) % bottom.length;
        b = bottom[j];
        tries += 1;
      }
      if (b === undefined || paired.has(b)) {
        unresolved.push(a);
        continue;
      }
      paired.add(a);
      paired.add(b);
      const [white, black] = assignColors(a, b, colors);
      pairings.push({ whiteId: white, blackId: black });
    }
    return unresolved;
  };

  for (const group of scoreGroups) {
    const withFloaters = [...floaters, ...group].sort(
      (a, b) => ratingOf(players, b) - ratingOf(players, a),
    );
    floaters = [];
    const leftovers = tryPairGroup(withFloaters);
    floaters.push(...leftovers);
  }

  // Son grup sonrası eşleşemeyenler: mümkünse tekrar eşleşerek bitirilir, yoksa bay alır.
  const remaining = floaters.filter((id) => !paired.has(id));
  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    const b = remaining.shift()!;
    paired.add(a);
    paired.add(b);
    const [white, black] = assignColors(a, b, colors);
    pairings.push({ whiteId: white, blackId: black });
  }
  if (remaining.length === 1) {
    const byePlayer = remaining[0];
    paired.add(byePlayer);
    pairings.push({ whiteId: byePlayer, blackId: null, result: '1-0' });
  }

  return { pairings };
}

export function pairNextRound(tournament: Tournament, players: PairingPlayer[]): PairingResult {
  return tournament.format === 'swiss' ? pairSwissRound(tournament, players) : pairArenaRound(tournament, players);
}
