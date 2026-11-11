/**
 * Gerçek turnuva eşleştirme motoru.
 *
 * Lichess'in (lila-master, bu depoda `lila-master/modules/tournament` altında
 * kaynağıyla birlikte bulunur) turnuva mantığından port edilmiştir:
 *
 * - Arena puanlama: lila `arena.ArenaSheet` ile birebir — galibiyet 2 puan,
 *   remi 1 puan, mağlubiyet 0. Üst üste 2 galibiyetten sonra "ateşte" (on fire)
 *   sayılır ve seri sürdükçe galibiyet 4, remi 2 puan eder (`streakBonus` ile
 *   açılıp kapatılabilir — kapalıyken sabit 2/1/0, ikiye katlama olmaz).
 * - Arena renk dengesi: lila `ColorHistory` ile birebir — her oyuncunun üst üste
 *   aynı renkle oynama "strike"ı ve toplam beyaz-siyah "balance"ı tutulur; iki
 *   oyuncu da zaten `maxStrike=3` üst üste aynı renkteyse eşleştirilmezler
 *   (`couldPlay`), eşleşince rengi daha dengesiz olan beyazı alır (`firstGetsWhite`).
 * - Arena eşleştirme maliyeti: lila `arena.AntmaPairing.pairScore` ile birebir —
 *   iki oyuncu arası |sıra farkı| × sıraya-göre-ağırlık + |puan/Elo farkı|; az önce
 *   oynadığı rakip (`Pairing.LastOpponents`, sadece EN SON rakip) ile
 *   eşleştirilmez. Lila gerçek üretimde bu maliyeti genel-graf ağırlıklı
 *   eşleştirme (WMMatching/blossom algoritması, binlerce oyuncu için) ile
 *   küresel optimumda çözer; burada aynı maliyet fonksiyonuyla greedy +
 *   yerel iyileştirme (2'li takas) kullanılır — küçük kulüp kadrolarında
 *   pratikte aynı sonuca ya da çok yakınına ulaşır.
 * - Swiss: FIDE Dutch sistemi — puan gruplarına ayırma, grup içinde üst/alt
 *   yarıyı eşleştirme, tekrar eşleşmeden kaçınma, renk dengesi, tek kalan
 *   oyuncu bir alt puan grubuna "float" eder, turnuva genelinde tek kalan
 *   oyuncuya bay (serbest 1 puan) verilir. Puanlama klasik kalır (1/0.5/0).
 * - Derece ayırıcı: Sonneborn-Berger puanı, lila `SwissScoring.compute`
 *   formülüyle aynıdır (galibiyette rakibin tam puanı, remide yarısı).
 * - Takım Savaşı: lila `TeamBattle`/`AntmaPairing.battleScore` ile birebir — aynı
 *   takımdan (burada: aynı kulüpten) iki oyuncu asla eşleştirilmez, her takımın
 *   puanı o takımın en iyi `nbLeaders` oyuncusunun bireysel puan toplamıdır.
 */
import type { Tournament, TournamentPairing, TournamentStanding } from '../types';

export interface PairingPlayer {
  id: string;
  /** Kuvvet sıralaması için (Elo/UKD); yoksa 0 kabul edilir */
  rating?: number;
  /** Takım Savaşı için takım kimliği (burada: clubId); takım savaşı yoksa kullanılmaz */
  team?: string;
}

export type StandingsTable = Record<string, TournamentStanding>;

const emptyStanding = (): TournamentStanding => ({ played: 0, wins: 0, draws: 0, losses: 0, points: 0, tieBreak: 0, winStreak: 0 });

/** Bir turnuvanın tüm turlarındaki, sonucu girilmiş eşleşmelerini, oynanma sırasına göre düzleştirir. */
function playedPairings(t: Tournament): TournamentPairing[] {
  return (t.rounds ?? []).flatMap((r) => r.pairings).filter((p) => !!p.result);
}

/**
 * Temel sıralama puanları.
 *
 * Swiss: klasik — galibiyet 1, remi 0.5, bay 1.
 *
 * Arena: lila `arena.ArenaSheet.addResult`/`Score.value` ile birebir — galibiyet
 * 2 puan, remi 1 puan, mağlubiyet 0. "Ateşte" (isOnFire = son iki maç da galibiyetse)
 * olunca hem galibiyet hem remi ikiye katlanır (4 / 2). `streakBonus` kapalıysa
 * (lila `Streakable(false)`) katlama hiç olmaz, sabit 2/1/0. Bay rakipsizdir, seriyi
 * bozar, tam puan (lila'da Arena'da bay yoktur; bu motor da bay üretmez — bay dalı
 * yalnızca Swiss'ten gelen veriyle uyumluluk için burada tutulur).
 */
function basePoints(t: Tournament): StandingsTable {
  const standings: StandingsTable = {};
  for (const id of t.participantIds ?? []) standings[id] = emptyStanding();

  const isArena = t.format === 'arena';
  const streakActive = isArena && t.streakBonus !== false;
  // lila Score.value: (Win,Normal)=2, (Win,Double)=4, (Draw,Normal)=1, (Draw,Double)=2, Loss=0.
  const resultPoints = (id: string, isWin: boolean): number => {
    if (!isArena) return isWin ? 1 : 0.5;
    const onFire = streakActive && standings[id].winStreak >= 2;
    if (isWin) return onFire ? 4 : 2;
    return onFire ? 2 : 1;
  };

  for (const p of playedPairings(t)) {
    standings[p.whiteId] ??= emptyStanding();
    if (p.blackId == null) {
      // Bay: rakipsiz, tam puan, galibiyet/mağlubiyet istatistiğine girmez, seriyi bozar.
      standings[p.whiteId].played += 1;
      standings[p.whiteId].points += isArena ? 2 : 1;
      standings[p.whiteId].winStreak = 0;
      continue;
    }
    standings[p.blackId] ??= emptyStanding();
    standings[p.whiteId].played += 1;
    standings[p.blackId].played += 1;
    if (p.result === '1-0') {
      standings[p.whiteId].wins += 1;
      standings[p.whiteId].points += resultPoints(p.whiteId, true);
      standings[p.whiteId].winStreak += 1;
      standings[p.blackId].losses += 1;
      standings[p.blackId].winStreak = 0;
    } else if (p.result === '0-1') {
      standings[p.blackId].wins += 1;
      standings[p.blackId].points += resultPoints(p.blackId, true);
      standings[p.blackId].winStreak += 1;
      standings[p.whiteId].losses += 1;
      standings[p.whiteId].winStreak = 0;
    } else {
      standings[p.whiteId].draws += 1;
      standings[p.blackId].draws += 1;
      standings[p.whiteId].points += resultPoints(p.whiteId, false);
      standings[p.blackId].points += resultPoints(p.blackId, false);
      standings[p.whiteId].winStreak = 0;
      standings[p.blackId].winStreak = 0;
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

export interface TeamStanding {
  teamId: string;
  score: number;
  /** Takımın en iyi N oyuncusu (nbLeaders), puana göre sıralı — kulüp puanına katkıda bulunanlar. */
  leaders: string[];
  /** Takımdaki, turnuvaya katılan toplam oyuncu sayısı. */
  playerCount: number;
}

/**
 * lila `TeamBattle`/`RankedTeam` ile birebir: her takımın puanı, o takımın en iyi
 * `nbLeaders` oyuncusunun bireysel puan toplamıdır (tüm takım üyelerinin toplamı değil).
 * Eşitlikte, tüm takım üyelerinin toplam puanı (geniş kadro derinliği) ayırıcıdır.
 */
export function rankTeams(t: Tournament, standings: StandingsTable, players: PairingPlayer[]): TeamStanding[] {
  const battle = t.teamBattle;
  if (!battle || battle.teamIds.length < 2) return [];

  const byTeam = new Map<string, string[]>();
  for (const id of t.participantIds ?? []) {
    const teamId = teamOf(players, id);
    if (!teamId || !battle.teamIds.includes(teamId)) continue;
    const arr = byTeam.get(teamId) ?? [];
    arr.push(id);
    byTeam.set(teamId, arr);
  }

  const nbLeaders = Math.max(1, battle.nbLeaders || 1);
  const teams: TeamStanding[] = battle.teamIds.map((teamId) => {
    const members = (byTeam.get(teamId) ?? []).sort((a, b) => {
      const sa = standings[a] ?? emptyStanding();
      const sb = standings[b] ?? emptyStanding();
      return sb.points - sa.points || sb.tieBreak - sa.tieBreak;
    });
    const leaders = members.slice(0, nbLeaders);
    const score = leaders.reduce((sum, id) => sum + (standings[id]?.points ?? 0), 0);
    return { teamId, score, leaders, playerCount: members.length };
  });

  return teams.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const depthA = (byTeam.get(a.teamId) ?? []).reduce((sum, id) => sum + (standings[id]?.points ?? 0), 0);
    const depthB = (byTeam.get(b.teamId) ?? []).reduce((sum, id) => sum + (standings[id]?.points ?? 0), 0);
    return depthB - depthA;
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

// --- Arena: lila `ColorHistory` ile birebir (strike: üst üste aynı renk; balance: toplam beyaz-siyah farkı) ---

interface ArenaColorHistory {
  strike: number;
  balance: number;
}

function arenaColorHistory(t: Tournament): Map<string, ArenaColorHistory> {
  const map = new Map<string, ArenaColorHistory>();
  const get = (id: string) => {
    let h = map.get(id);
    if (!h) {
      h = { strike: 0, balance: 0 };
      map.set(id, h);
    }
    return h;
  };
  // lila ColorHistory.inc: white => strike=(strike+1).atLeast(1), balance+1; black => strike=(strike-1).atMost(-1), balance-1.
  const inc = (h: ArenaColorHistory, white: boolean) => {
    h.strike = white ? Math.max(h.strike + 1, 1) : Math.min(h.strike - 1, -1);
    h.balance += white ? 1 : -1;
  };
  for (const p of playedPairings(t)) {
    inc(get(p.whiteId), true);
    if (p.blackId != null) inc(get(p.blackId), false);
  }
  return map;
}

/** lila `ColorHistory.couldPlay`: ikisi de zaten maxStrike (3) üst üste aynı renkteyse eşleşemezler. */
function couldPlayColors(a: ArenaColorHistory, b: ArenaColorHistory, maxStrike = 3): boolean {
  return (a.strike > -maxStrike || b.strike > -maxStrike) && (a.strike < maxStrike || b.strike < maxStrike);
}

/** lila `ColorHistory.firstGetsWhite`: rengi daha dengesiz (strike, sonra balance, daha düşük) olan beyazı alır. */
function firstGetsWhiteArena(a: ArenaColorHistory, b: ArenaColorHistory): boolean {
  if (a.strike !== b.strike) return a.strike < b.strike;
  if (a.balance !== b.balance) return a.balance < b.balance;
  return Math.random() < 0.5;
}

function assignColorsArena(aId: string, bId: string, colors: Map<string, ArenaColorHistory>): [string, string] {
  const a = colors.get(aId) ?? { strike: 0, balance: 0 };
  const b = colors.get(bId) ?? { strike: 0, balance: 0 };
  return firstGetsWhiteArena(a, b) ? [aId, bId] : [bId, aId];
}

/** lila `Pairing.LastOpponents`: her oyuncunun SADECE en son (bir önceki) rakibi — tüm geçmiş değil. */
function lastOpponentMap(t: Tournament): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of playedPairings(t)) {
    if (p.blackId == null) continue;
    map.set(p.whiteId, p.blackId);
    map.set(p.blackId, p.whiteId);
  }
  return map;
}

/** İki oyuncunun bu turnuvada kaç kez karşılaştığı (anahtar: sıralı "a|b"). */
function meetingCounts(t: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of playedPairings(t)) {
    if (p.blackId == null) continue;
    const key = pairKey(p.whiteId, p.blackId);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Daha önce karşılaşmış ikiliye her karşılaşma için eklenen ceza. Sıra/Elo maliyetinin
 * (en fazla birkaç yüz bin) çok üstünde: başka uygun rakip varken tekrar eşleşme seçilmez.
 */
const REMATCH_PENALTY = 50_000_000;

/**
 * lila `arena.PairingSystem.rankFactorFor`: en üst sıralar için eşleştirme kalitesi
 * daha önemli sayılır (sıra 1 vs 5, sıra 300 vs 310'dan daha "yakın" kabul edilir).
 */
function arenaRankFactor(maxRank: number, rankA: number, rankB: number): number {
  if (maxRank <= 0) return 2000;
  const rank = Math.min(rankA, rankB);
  return 300 + (1700 * (maxRank - rank)) / maxRank;
}

/**
 * lila `arena.AntmaPairing.pairScore`: az önceki rakiple veya ikisi de renk-dengesi
 * sınırında olan oyuncularla eşleşme engellenir (null); diğer durumda maliyet
 * |sıra farkı| × sıraya-göre-ağırlık + |Elo farkı| — küçük maliyet = daha iyi eşleşme.
 */
function teamOf(players: PairingPlayer[], id: string): string | undefined {
  return players.find((p) => p.id === id)?.team;
}

/**
 * lila `arena.AntmaPairing.battleScore`: Takım Savaşı'nda aynı takımdan (kulüpten)
 * iki oyuncu asla eşleştirilmez — diğer tüm kısıtlar (son rakip, renk dengesi) aynen geçerli.
 */
function arenaPairScore(
  aId: string,
  bId: string,
  ranks: Map<string, number>,
  maxRank: number,
  players: PairingPlayer[],
  colors: Map<string, ArenaColorHistory>,
  lastOpponents: Map<string, string>,
  teamBattle: boolean,
  meetings: Map<string, number> = new Map(),
): number | null {
  if (teamBattle && teamOf(players, aId) === teamOf(players, bId)) return null;
  if (lastOpponents.get(aId) === bId || lastOpponents.get(bId) === aId) return null;
  const rematchPenalty = (meetings.get(pairKey(aId, bId)) ?? 0) * REMATCH_PENALTY;
  const ca = colors.get(aId) ?? { strike: 0, balance: 0 };
  const cb = colors.get(bId) ?? { strike: 0, balance: 0 };
  if (!couldPlayColors(ca, cb)) return null;
  const rankA = ranks.get(aId) ?? 0;
  const rankB = ranks.get(bId) ?? 0;
  return rematchPenalty
    + Math.abs(rankA - rankB) * arenaRankFactor(maxRank, rankA, rankB)
    + Math.abs(ratingOf(players, aId) - ratingOf(players, bId));
}

/**
 * lila üretimde bu eşleştirmeyi genel-graf ağırlıklı eşleştirme (WMMatching/blossom
 * algoritması) ile küresel optimumda çözer — binlerce oyuncu için gerekli. Burada
 * aynı maliyet fonksiyonuyla greedy (en düşük maliyetli kenardan başla) + sınırlı
 * yerel iyileştirme (iki çiftin eşlerini takas edip toplam maliyet düşüyorsa kabul
 * et) kullanılır: küçük kulüp kadrolarında pratikte aynı/çok yakın sonucu verir.
 * Kısıtlar yüzünden hiç rakip bulamayan oyuncular (2+ ise) kısıtlar gevşetilerek
 * ikinci bir geçişte eşleştirilir — lila'nın tek kişi dışarıda kalmasın mantığıyla
 * aynı amaç.
 */
function solveArenaMatching(
  ids: string[],
  cost: (a: string, b: string) => number | null,
  relaxedCost: (a: string, b: string, i: number, j: number) => number | null = (_a, _b, i, j) => Math.abs(i - j),
): { pairs: Array<[string, string]>; unmatched: string[] } {
  const index = new Map(ids.map((id, i) => [id, i]));
  // Kısıtlı (null) kenarlar silinmez, "son çare" olarak çok pahalı kalır: böylece kısıta uyan
  // her eşleşme önce denenir, ama kimse gereksiz yere dışarıda kalmaz. Eskiden kalanlar ayrı bir
  // geçişte kendi aralarında eşleşiyordu — kalanlar çoğu zaman az önce oynamış ikili oluyordu.
  const LAST_RESORT = 1e12;
  const eff = (a: string, b: string): number | null => {
    const c = cost(a, b);
    if (c != null) return c;
    const r = relaxedCost(a, b, index.get(a) ?? 0, index.get(b) ?? 0);
    return r == null ? null : LAST_RESORT + r;
  };

  const edges: Array<{ a: string; b: string; cost: number }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const c = eff(ids[i], ids[j]);
      if (c != null) edges.push({ a: ids[i], b: ids[j], cost: c });
    }
  }
  edges.sort((x, y) => x.cost - y.cost);

  const used = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const e of edges) {
    if (used.has(e.a) || used.has(e.b)) continue;
    used.add(e.a);
    used.add(e.b);
    pairs.push([e.a, e.b]);
  }

  // 2'li takas ile yerel iyileştirme: iki çiftin eşlerini değiştirmek toplam maliyeti düşürüyorsa uygula.
  let improved = true;
  let guard = 0;
  while (improved && guard < 500) {
    improved = false;
    guard += 1;
    for (let i = 0; i < pairs.length && !improved; i++) {
      for (let j = i + 1; j < pairs.length && !improved; j++) {
        const [a1, b1] = pairs[i];
        const [a2, b2] = pairs[j];
        const current = (eff(a1, b1) ?? Infinity) + (eff(a2, b2) ?? Infinity);
        const swapA = eff(a1, a2);
        const swapB = eff(b1, b2);
        if (swapA != null && swapB != null && swapA + swapB < current) {
          pairs[i] = [a1, a2];
          pairs[j] = [b1, b2];
          improved = true;
          break;
        }
        const crossA = eff(a1, b2);
        const crossB = eff(b1, a2);
        if (crossA != null && crossB != null && crossA + crossB < current) {
          pairs[i] = [a1, b2];
          pairs[j] = [b1, a2];
          improved = true;
          break;
        }
      }
    }
  }

  return { pairs, unmatched: ids.filter((id) => !used.has(id)) };
}

/**
 * Şu anda sonucu girilmemiş bir eşleşmede olan (yani "maçı sürüyor" kabul edilen)
 * katılımcı kimlikleri. Arena'nın sürekli eşleştirmesi için bir oyuncu, kendi maçının
 * sonucu girilene kadar yeni bir rakibe eşleştirilmez; diğer oyuncuların maçını beklemez.
 */
export function busyParticipants(tournament: Tournament): Set<string> {
  const busy = new Set<string>();
  for (const round of tournament.rounds ?? []) {
    for (const p of round.pairings) {
      if (p.result) continue;
      busy.add(p.whiteId);
      if (p.blackId != null) busy.add(p.blackId);
    }
  }
  return busy;
}

/** Turnuvada henüz sonuçlanmamış bir eşleşmesi olmayan (yeni rakibe hazır) katılımcılar. */
export function freeParticipants(tournament: Tournament): string[] {
  const busy = busyParticipants(tournament);
  return (tournament.participantIds ?? []).filter((id) => !busy.has(id));
}

export interface PairingResult {
  pairings: TournamentPairing[];
}

/**
 * Arena eşleştirmesi — lila `arena.PairingSystem`/`AntmaPairing` ile birebir mantık:
 * canlı sıralamaya göre sıra numarası + Elo farkına dayalı maliyeti en aza indiren
 * eşleştirme aranır (bkz. `solveArenaMatching`), az önceki rakiple veya renk-dengesi
 * sınırındaki (3 üst üste aynı renk) oyuncularla eşleşme engellenir, eşleşince renk
 * `firstGetsWhiteArena` ile (daha dengesiz olan beyaz) atanır.
 *
 * Gerçek Lichess Arena'daki gibi sürekli akış: sadece şu anda sonucu girilmemiş
 * bir eşleşmesi olmayan ("boşta") katılımcılar eşleştirilir — henüz maçı süren
 * oyuncular dokunulmadan kalır, bütün turun bitmesini beklemeye gerek yoktur. Tek
 * sayıda boşta oyuncu varsa biri bu turda bekler; Arena'da bay/serbest puan yoktur.
 */
export function pairArenaRound(tournament: Tournament, players: PairingPlayer[]): PairingResult {
  const standings = recalcStandings(tournament);
  const colors = arenaColorHistory(tournament);
  const lastOpponents = lastOpponentMap(tournament);

  const pool = freeParticipants(tournament);
  if (pool.length < 2) return { pairings: [] };

  const ranking = rankParticipants(tournament, standings);
  const ranks = new Map<string, number>(ranking.map((id, idx) => [id, idx + 1]));
  const maxRank = Math.max(...pool.map((id) => ranks.get(id) ?? ranking.length), 1);

  const teamBattleOn = !!tournament.teamBattle && tournament.teamBattle.teamIds.length > 1;
  const meetings = meetingCounts(tournament);
  const cost = (a: string, b: string) =>
    arenaPairScore(a, b, ranks, maxRank, players, colors, lastOpponents, teamBattleOn, meetings);
  // Gevşetilmiş geçiş: az önce oynamış ikili, maçı süren başka oyuncular varken yeniden
  // eşleştirilmez — onlar bitince farklı rakip çıkar (lichess de bekletir). Herkes boştaysa
  // (ör. 2 kişilik turnuva) mecburen eşleşir; yine de en az karşılaşmış ikili tercih edilir.
  const othersBusy = (tournament.participantIds ?? []).length > pool.length;
  const relaxedCost = (a: string, b: string, i: number, j: number) => {
    const isLast = lastOpponents.get(a) === b || lastOpponents.get(b) === a;
    if (isLast && othersBusy) return null;
    return (isLast ? 1000 : 0) * REMATCH_PENALTY + (meetings.get(pairKey(a, b)) ?? 0) * REMATCH_PENALTY + Math.abs(i - j);
  };
  const { pairs } = solveArenaMatching(pool, cost, relaxedCost);

  const pairings: TournamentPairing[] = pairs.map(([a, b]) => {
    const [white, black] = assignColorsArena(a, b, colors);
    return { whiteId: white, blackId: black };
  });

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
