import type { ChessComGame, LichessGame } from '../services/chessPlatformService';
import type { SkillKey } from './platformSkillAnalysis';

export type GameResult = 'win' | 'loss' | 'draw';

export interface RecentGameRow {
  id: string;
  platform: 'lichess' | 'chesscom';
  dateIso: string;
  dateLabel: string;
  result: GameResult;
  opening?: string;
  opponent?: string;
  rating?: number;
  speed?: string;
  url: string;
}

export interface RatingChartPoint {
  name: string;
  elo: number;
  label: string;
}

export const SKILL_TRAINING_TIPS: Record<SkillKey, { focus: string; homework: string }> = {
  endgame: {
    focus: 'Kale-piyon ve vezir sonu pozisyonları',
    homework: 'Oyun sonu temalı bulmacalar ve klasik final çalışmaları',
  },
  tactics: {
    focus: 'Mat kalıpları, çatal ve açma taktikleri',
    homework: 'Taktik bulmaca setleri (2 hamle mat / kazanma)',
  },
  opening: {
    focus: 'Açılış prensipleri ve en zayıf açılış repertuarı',
    homework: 'Açılış varyantı tekrarları ve model oyunlar',
  },
  strategy: {
    focus: 'Orta oyun planı, taş koordinasyonu ve tempo seçimi',
    homework: 'Strateji bulmacaları ve uzun rapid maç analizi',
  },
};

export function lichessProfileUrl(username: string): string {
  return `https://lichess.org/@/${encodeURIComponent(username.trim())}`;
}

export function chessComProfileUrl(username: string): string {
  return `https://www.chess.com/member/${encodeURIComponent(username.trim())}`;
}

export function lichessGameUrl(gameId: string): string {
  return `https://lichess.org/${encodeURIComponent(gameId)}`;
}

export function chessComGameUrl(game: ChessComGame): string {
  if (game.url?.trim()) return game.url;
  if (game.uuid) return `https://www.chess.com/game/live/${game.uuid}`;
  return '';
}

function lichessSide(game: LichessGame, username: string): 'white' | 'black' | null {
  const u = username.trim().toLowerCase();
  const w = (game.players?.white?.user?.id ?? game.players?.white?.user?.name ?? '').toLowerCase();
  const b = (game.players?.black?.user?.id ?? game.players?.black?.user?.name ?? '').toLowerCase();
  if (w === u) return 'white';
  if (b === u) return 'black';
  return null;
}

function lichessOutcome(game: LichessGame, side: 'white' | 'black'): GameResult {
  if (!game.winner) return 'draw';
  return game.winner === side ? 'win' : 'loss';
}

function chessComSide(game: ChessComGame, username: string): 'white' | 'black' | null {
  const u = username.trim().toLowerCase();
  const w = (game.white?.username ?? '').toLowerCase();
  const b = (game.black?.username ?? '').toLowerCase();
  if (w === u) return 'white';
  if (b === u) return 'black';
  return null;
}

function chessComOutcome(game: ChessComGame, side: 'white' | 'black'): GameResult {
  const result = side === 'white' ? (game.white?.result ?? '') : (game.black?.result ?? '');
  if (result === 'win') return 'win';
  if (['agreed', 'repetition', 'stalemate', 'timevsinsufficient', 'insufficient', '50move'].includes(result)) {
    return 'draw';
  }
  return 'loss';
}

export function buildRecentGamesList(
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
  lichessUsername?: string,
  chessComUsername?: string,
  limit = 12,
): RecentGameRow[] {
  const rows: RecentGameRow[] = [];
  const lu = lichessUsername?.trim() ?? '';
  const cu = chessComUsername?.trim() ?? '';

  for (const g of lichessGames) {
    if (!lu) break;
    const side = lichessSide(g, lu);
    if (!side || !g.id) continue;
    const ts = g.createdAt ?? g.lastMoveAt ?? 0;
    if (!ts) continue;
    const opp =
      side === 'white'
        ? g.players?.black?.user?.name ?? g.players?.black?.user?.id
        : g.players?.white?.user?.name ?? g.players?.white?.user?.id;
    rows.push({
      id: g.id,
      platform: 'lichess',
      dateIso: new Date(ts).toISOString(),
      dateLabel: new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      result: lichessOutcome(g, side),
      opening: g.opening?.name,
      opponent: opp,
      rating: side === 'white' ? g.players?.white?.rating : g.players?.black?.rating,
      speed: g.speed || g.perf,
      url: lichessGameUrl(g.id),
    });
  }

  for (const g of chessComGames) {
    if (!cu) break;
    const side = chessComSide(g, cu);
    if (!side) continue;
    const ts = (g.end_time ?? 0) * 1000;
    if (!ts) continue;
    const opp = side === 'white' ? g.black?.username : g.white?.username;
    const url = chessComGameUrl(g);
    if (!url) continue;
    rows.push({
      id: g.uuid ?? url,
      platform: 'chesscom',
      dateIso: new Date(ts).toISOString(),
      dateLabel: new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      result: chessComOutcome(g, side),
      opponent: opp,
      rating: side === 'white' ? g.white?.rating : g.black?.rating,
      speed: g.time_class || g.time_control,
      url,
    });
  }

  return rows.sort((a, b) => b.dateIso.localeCompare(a.dateIso)).slice(0, limit);
}

export function buildPlatformRatingHistory(
  lichessGames: LichessGame[],
  chessComGames: ChessComGame[],
  lichessUsername: string | undefined,
  chessComUsername: string | undefined,
  months: number,
): RatingChartPoint[] {
  const cutoff = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
  const points: { ts: number; rating: number }[] = [];

  const lu = lichessUsername?.trim() ?? '';
  for (const g of lichessGames) {
    const side = lichessSide(g, lu);
    if (!side) continue;
    const ts = g.createdAt ?? g.lastMoveAt ?? 0;
    const rating = side === 'white' ? g.players?.white?.rating : g.players?.black?.rating;
    if (!ts || !rating || ts < cutoff) continue;
    points.push({ ts, rating });
  }

  const cu = chessComUsername?.trim() ?? '';
  for (const g of chessComGames) {
    const side = chessComSide(g, cu);
    if (!side) continue;
    const ts = (g.end_time ?? 0) * 1000;
    const rating = side === 'white' ? g.white?.rating : g.black?.rating;
    if (!ts || !rating || ts < cutoff) continue;
    points.push({ ts, rating });
  }

  if (points.length < 2) return [];

  points.sort((a, b) => a.ts - b.ts);

  const byMonth = new Map<string, number>();
  for (const p of points) {
    const d = new Date(p.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, p.rating);
  }

  return [...byMonth.entries()].map(([key, elo]) => {
    const [, m] = key.split('-').map(Number);
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return {
      name: monthNames[(m ?? 1) - 1] ?? key,
      elo,
      label: key,
    };
  });
}

export function resultColor(result: GameResult): string {
  if (result === 'win') return 'bg-emerald-500 hover:bg-emerald-400';
  if (result === 'draw') return 'bg-slate-500 hover:bg-slate-400';
  return 'bg-rose-500 hover:bg-rose-400';
}

export function resultLabel(result: GameResult): string {
  if (result === 'win') return 'Galibiyet';
  if (result === 'draw') return 'Beraberlik';
  return 'Mağlubiyet';
}
