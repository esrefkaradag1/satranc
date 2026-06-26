/**
 * Lichess ve Chess.com public API ile kullanıcı profili, rating ve (Lichess) son oyunları çeker.
 * Kimlik doğrulama gerekmez.
 */

import {
  parseChessComTactics2Puzzles,
  formatChessComApiError,
  dedupeChessComPuzzleAttempts,
  type ChessComPuzzleAttempt,
  type ChessComPuzzleTab,
} from '../lib/chesscomPuzzleParse';
import { timestampMatchesDay, localDayKeyFromMs } from '../lib/homeworkDayUtils';
import { parseLichessActivityPuzzles } from '../lib/leaderboardUtils';

export type { ChessComPuzzleAttempt, ChessComPuzzleTab };
export { parseChessComTactics2Puzzles };

const LICHESS_DIRECT_API = 'https://lichess.org/api';
const CHESSCOM_DIRECT_API = 'https://api.chess.com/pub';
const FETCH_TIMEOUT_MS = 8000;
function lichessProxyUrl(apiPath: string, params?: URLSearchParams): string {
  const q = new URLSearchParams();
  q.set('path', apiPath.replace(/^\/+/, ''));
  if (params) params.forEach((value, key) => q.set(key, value));
  return `/api/lichess-proxy?${q.toString()}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/** Lichess API — sunucu proxy üzerinden (tarayıcıdan doğrudan erişim çoğu ağda zaman aşımı verir). */
async function lichessApiFetch(
  apiPath: string,
  init?: RequestInit,
  params?: URLSearchParams,
): Promise<Response> {
  return runLichessThrottled(async () => {
    if (isLichessGloballyRateLimited()) {
      return new Response(null, { status: 429, statusText: 'Lichess rate limit (bekleme)' });
    }
    const proxyUrl = lichessProxyUrl(apiPath, params);
    const res = await fetchWithTimeout(proxyUrl, init);
    if (res.status === 429) markLichessRateLimited();
    return res;
  });
}

async function chessComGamesFetch(username: string, year: string, month: string): Promise<Response> {
  const mm = month.padStart(2, '0');
  const q = new URLSearchParams({ username: username.toLowerCase(), year, month: mm });
  return fetchWithTimeout(`/api/chesscom-games?${q}`, { headers: { Accept: 'application/json' } });
}
const LICHESS_ACTIVITY_CACHE_TTL_MS = 5 * 60 * 1000;
const LICHESS_ACTIVITY_RATE_LIMIT_MS = 5 * 60 * 1000;
/** Lichess public API — ardışık istekler arası minimum süre (429 önleme) */
const LICHESS_MIN_REQUEST_GAP_MS = 1200;
const LICHESS_GLOBAL_BACKOFF_MS = 90_000;
const CHESSCOM_API = CHESSCOM_DIRECT_API;

let lichessRequestChain: Promise<unknown> = Promise.resolve();
let lichessLastRequestDoneAt = 0;
let lichessGlobalBackoffUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Tüm Lichess proxy isteklerini sıraya alır; Lichess rate limit (429) riskini azaltır. */
async function runLichessThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const task = async () => {
    const now = Date.now();
    const backoffWait = lichessGlobalBackoffUntil - now;
    if (backoffWait > 0) await sleep(backoffWait);
    const gapWait = lichessLastRequestDoneAt + LICHESS_MIN_REQUEST_GAP_MS - Date.now();
    if (gapWait > 0) await sleep(gapWait);
    try {
      return await fn();
    } finally {
      lichessLastRequestDoneAt = Date.now();
    }
  };
  const next = lichessRequestChain.then(task, task);
  lichessRequestChain = next.catch(() => {});
  return next;
}

function markLichessRateLimited(): void {
  lichessGlobalBackoffUntil = Date.now() + LICHESS_GLOBAL_BACKOFF_MS;
}

export function isLichessGloballyRateLimited(): boolean {
  return Date.now() < lichessGlobalBackoffUntil;
}

type LichessActivityCacheEntry = {
  fetchedAt: number;
  data: LichessActivity[];
  rateLimited?: boolean;
};

const lichessActivityCache = new Map<string, LichessActivityCacheEntry>();
const lichessActivityInFlight = new Map<string, Promise<LichessActivity[]>>();

function lichessActivityCacheKey(username: string): string {
  return username.trim().toLowerCase();
}

export interface LichessPerf {
  games: number;
  rating: number;
  rd?: number;
  prog?: number;
  prov?: boolean;
}

export interface LichessUserProfile {
  id: string;
  username: string;
  createdAt: number;
  playTime?: { total: number; tv?: number };
  perfs?: {
    rapid?: LichessPerf;
    blitz?: LichessPerf;
    bullet?: LichessPerf;
    puzzle?: LichessPerf;
    correspondence?: LichessPerf;
    classical?: LichessPerf;
    [key: string]: LichessPerf | undefined;
  };
  profile?: { country?: string; bio?: string };
  url?: string;
  /** Genel oyun sayıları (API'den döner) */
  count?: { all?: number; rated?: number; win?: number; loss?: number; draw?: number };
}

export interface LichessGamePlayer {
  /** Lichess kullanıcı adı (küçük harf id) */
  user?: { name: string; id?: string };
  rating?: number;
  ratingDiff?: number;
}

export interface LichessGame {
  id: string;
  variant?: string;
  speed?: string;
  perf?: string;
  createdAt?: number;
  lastMoveAt?: number;
  status?: string;
  players?: { white?: LichessGamePlayer; black?: LichessGamePlayer };
  opening?: { name?: string };
  winner?: 'white' | 'black';
  pgn?: string;
}

export interface LichessActivity {
  interval: { start: number; end: number };
  games?: Record<string, { win: number; loss: number; draw: number; rp?: { win: number; loss: number; draw: number } }>;
  puzzles?: { score?: { win: number; loss: number; draw: number }; count?: number };
  tournaments?: { nb: number; best: { name: string; url: string; rank: number; score: number }[] };
  teams?: { joined?: string[] };
  follows?: { in?: string[]; out?: string[] };
  posts?: { nb: number; last: { url: string; title: string; date: number }[] };
}

export interface ChessComPlayer {
  username: string;
  avatar?: string;
  url?: string;
  joined?: number;
  last_online?: number;
  country?: string;
  /** premium | basic | closed */
  status?: string;
  /** Takipçi sayısı */
  followers?: number;
  /** Lig: Bronze, Silver, Gold, vb. */
  league?: string;
  verified?: boolean;
  is_streamer?: boolean;
}

export interface ChessComStats {
  chess_rapid?: { last?: { rating: number; date: number; rd?: number }; best?: { rating: number; date?: number; game?: string }; record?: { win: number; loss: number; draw: number } };
  chess_blitz?: { last?: { rating: number }; best?: { rating: number; date?: number; game?: string }; record?: { win: number; loss: number; draw: number } };
  chess_bullet?: { last?: { rating: number }; best?: { rating: number; date?: number; game?: string }; record?: { win: number; loss: number; draw: number } };
  chess_daily?: { last?: { rating: number }; record?: { win: number; loss: number; draw: number } };
  tactics?: {
    highest?: { rating: number; date?: number };
    lowest?: { rating: number; date?: number };
  };
  puzzle_rush?: {
    best?: { total_attempts?: number; score?: number };
    daily?: { total_attempts?: number; score?: number };
  };
  lessons?: { highest?: { rating: number }; lowest?: { rating: number } };
  fide?: number;
  [key: string]: unknown;
}

/** Chess.com oyun listesi (aylık arşiv yanıtı) */
export interface ChessComGame {
  url?: string;
  uuid?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  rated?: boolean;
  white?: { username: string; rating?: number; result?: string };
  black?: { username: string; rating?: number; result?: string };
  accuracies?: { white?: number; black?: number };
  fen?: string;
  time_class?: string;
  /** chess | chess960 */
  rules?: string;
}

export function chessComGameInvolvesUser(game: ChessComGame, username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const w = game.white?.username?.toLowerCase() ?? '';
  const b = game.black?.username?.toLowerCase() ?? '';
  return w === u || b === u;
}

function dedupeChessComGames(games: ChessComGame[]): ChessComGame[] {
  const seen = new Set<string>();
  const out: ChessComGame[] = [];
  for (const g of games) {
    const key = (g.uuid || g.url || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

export interface FetchChessComAllGamesOptions {
  maxTotal?: number;
  onProgress?: (loadedCount: number) => void;
}

export interface FetchChessComGamesPageOptions {
  max?: number;
  beforeEndTime?: number;
}

export interface FetchChessComGamesPageResult {
  games: ChessComGame[];
  nextBeforeEndTime: number | null;
  hasMore: boolean;
}

/**
 * Sadece bu kullanıcı adına ait Chess.com oyunları (aylık API arşivleri; tüm site değil).
 */
export async function fetchChessComAllUserGames(
  username: string,
  opts?: FetchChessComAllGamesOptions
): Promise<ChessComGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return [];
  const maxTotal = opts?.maxTotal ?? 50_000;
  const onProgress = opts?.onProgress;

  try {
    const archivesRes = await fetch(`${CHESSCOM_API}/player/${encodeURIComponent(trimmed)}/games/archives`);
    if (!archivesRes.ok) return [];
    const archivesData = (await archivesRes.json()) as { archives?: string[] };
    const archives = archivesData.archives ?? [];
    if (archives.length === 0) return [];

    const all: ChessComGame[] = [];
    const newestFirst = archives.slice().reverse();

    for (const archiveUrl of newestFirst) {
      if (all.length >= maxTotal) break;
      const gamesRes = await fetch(archiveUrl);
      if (!gamesRes.ok) continue;
      const gamesData = (await gamesRes.json()) as { games?: ChessComGame[] };
      const monthGames = gamesData.games ?? [];
      for (const g of monthGames) {
        if (!chessComGameInvolvesUser(g, trimmed)) continue;
        all.push(g);
        if (all.length >= maxTotal) break;
      }
      onProgress?.(all.length);
    }

    const sorted = dedupeChessComGames(all).sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    return sorted.slice(0, maxTotal);
  } catch {
    return [];
  }
}

/** Chess.com kullanıcı oyunlarını sayfa sayfa çeker (varsayılan 20). */
export async function fetchChessComGamesPage(
  username: string,
  opts?: FetchChessComGamesPageOptions
): Promise<FetchChessComGamesPageResult> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return { games: [], nextBeforeEndTime: null, hasMore: false };
  const pageSize = Math.max(1, Math.min(100, Math.floor(opts?.max ?? 20)));
  const beforeEndTime = typeof opts?.beforeEndTime === 'number' && Number.isFinite(opts.beforeEndTime)
    ? opts.beforeEndTime
    : null;
  try {
    const archivesRes = await fetch(`${CHESSCOM_API}/player/${encodeURIComponent(trimmed)}/games/archives`);
    if (!archivesRes.ok) return { games: [], nextBeforeEndTime: null, hasMore: false };
    const archivesData = (await archivesRes.json()) as { archives?: string[] };
    const archives = archivesData.archives ?? [];
    if (archives.length === 0) return { games: [], nextBeforeEndTime: null, hasMore: false };

    const newestFirst = archives.slice().reverse();
    const collected: ChessComGame[] = [];
    for (const archiveUrl of newestFirst) {
      if (collected.length >= pageSize) break;
      const gamesRes = await fetch(archiveUrl);
      if (!gamesRes.ok) continue;
      const gamesData = (await gamesRes.json()) as { games?: ChessComGame[] };
      const monthGames = (gamesData.games ?? [])
        .filter((g) => chessComGameInvolvesUser(g, trimmed))
        .filter((g) => {
          const t = g.end_time ?? 0;
          if (!beforeEndTime) return true;
          return t > 0 && t < beforeEndTime;
        })
        .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
      for (const g of monthGames) {
        collected.push(g);
        if (collected.length >= pageSize) break;
      }
    }

    const games = dedupeChessComGames(collected).sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0)).slice(0, pageSize);
    let oldest = Infinity;
    for (const g of games) {
      const t = g.end_time ?? 0;
      if (t > 0 && t < oldest) oldest = t;
    }
    const nextBeforeEndTime = Number.isFinite(oldest) ? oldest : null;
    const hasMore = games.length >= pageSize && nextBeforeEndTime != null;
    return { games, nextBeforeEndTime, hasMore };
  } catch {
    return { games: [], nextBeforeEndTime: null, hasMore: false };
  }
}

/** Lichess kullanıcı profili ve rating'leri çeker */
export async function fetchLichessUser(username: string): Promise<LichessUserProfile | null> {
  const trimmed = username.trim();
  if (!trimmed) return null;
  try {
    const res = await lichessApiFetch(`user/${encodeURIComponent(trimmed)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as LichessUserProfile;
  } catch {
    return null;
  }
}

/** Oyun kaydında beyaz veya siyah olarak bu kullanıcı var mı (yalnızca istenen hesabın maçları) */
export function lichessGameInvolvesUser(game: LichessGame, username: string): boolean {
  const want = username.trim().toLowerCase();
  if (!want) return false;
  const w = game.players?.white?.user?.id ?? game.players?.white?.user?.name;
  const b = game.players?.black?.user?.id ?? game.players?.black?.user?.name;
  const ws = w != null ? String(w).toLowerCase() : '';
  const bs = b != null ? String(b).toLowerCase() : '';
  return ws === want || bs === want;
}

function dedupeLichessGamesById(games: LichessGame[]): LichessGame[] {
  const seen = new Set<string>();
  const out: LichessGame[] = [];
  for (const g of games) {
    const id = g.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(g);
  }
  return out;
}

function parseNdjsonGames(text: string): LichessGame[] {
  const lines = text.trim().split('\n').filter(Boolean);
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as LichessGame;
      } catch {
        return null;
      }
    })
    .filter((g): g is LichessGame => g != null);
}

/** Lichess kullanıcısının son oyunlarını çeker (ND-JSON) */
export async function fetchLichessRecentGames(username: string, max = 10): Promise<LichessGame[]> {
  const trimmed = username.trim();
  if (!trimmed) return [];
  try {
    const params = new URLSearchParams({ max: String(max), moves: '0', opening: 'true' });
    const res = await lichessApiFetch(
      `games/user/${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/x-ndjson' } },
      params,
    );
    if (!res.ok) return [];
    return parseNdjsonGames(await res.text());
  } catch {
    return [];
  }
}

export interface FetchLichessGamesPageOptions {
  max?: number;
  until?: number;
}

export interface FetchLichessGamesPageResult {
  games: LichessGame[];
  nextUntil: number | null;
  hasMore: boolean;
}

/** Lichess kullanıcı oyunlarını sayfa sayfa çeker (varsayılan 20). */
export async function fetchLichessGamesPage(
  username: string,
  opts?: FetchLichessGamesPageOptions
): Promise<FetchLichessGamesPageResult> {
  const trimmed = username.trim();
  if (!trimmed) return { games: [], nextUntil: null, hasMore: false };
  const pageSize = Math.max(1, Math.min(100, Math.floor(opts?.max ?? 20)));
  try {
    const params = new URLSearchParams();
    params.set('max', String(pageSize));
    params.set('moves', '0');
    params.set('opening', 'true');
    if (typeof opts?.until === 'number' && Number.isFinite(opts.until) && opts.until > 0) {
      params.set('until', String(Math.floor(opts.until)));
    }
    const res = await lichessApiFetch(
      `games/user/${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/x-ndjson' } },
      params,
    );
    if (!res.ok) return { games: [], nextUntil: null, hasMore: false };
    const parsed = parseNdjsonGames(await res.text());
    const games = dedupeLichessGamesById(parsed.filter((g) => lichessGameInvolvesUser(g, trimmed)));
    let oldest = Infinity;
    for (const g of games) {
      const t = g.createdAt ?? 0;
      if (t > 0 && t < oldest) oldest = t;
    }
    const nextUntil = Number.isFinite(oldest) ? oldest - 1 : null;
    const hasMore = games.length >= pageSize && nextUntil != null;
    return { games, nextUntil, hasMore };
  } catch {
    return { games: [], nextUntil: null, hasMore: false };
  }
}

export interface FetchLichessAllGamesOptions {
  /** Üst sınır (varsayılan 50.000) */
  maxTotal?: number;
  /** Her parti sonrası (liste büyüdükçe) */
  onProgress?: (loadedCount: number) => void;
}

/**
 * Sadece **bu kullanıcı adına** ait Lichess oyunlarını çeker (`GET /api/games/user/{username}` — tüm site verisi değil).
 * Meta veriler sayfalanır (max 100 / istek, `until` ile geriye). Hamle yok (`moves=0`); PGN için `fetchLichessGamePgn`.
 * Sonuçta yalnızca beyaz/siyah tahtada bu kullanıcı geçen oyunlar bırakılır; tekrarlayan id’ler atılır.
 */
export async function fetchLichessAllUserGames(
  username: string,
  opts?: FetchLichessAllGamesOptions
): Promise<LichessGame[]> {
  const trimmed = username.trim();
  if (!trimmed) return [];
  const maxTotal = opts?.maxTotal ?? 50_000;
  const onProgress = opts?.onProgress;
  const all: LichessGame[] = [];
  let until: number | undefined;
  const BATCH = 100;
  let batches = 0;
  const MAX_BATCHES = 1000;

  try {
    while (all.length < maxTotal && batches < MAX_BATCHES) {
      batches++;
      const take = Math.min(BATCH, maxTotal - all.length);
      const params = new URLSearchParams();
      params.set('max', String(take));
      params.set('moves', '0');
      params.set('opening', 'true');
      if (until !== undefined) params.set('until', String(until));

      const res = await lichessApiFetch(
        `games/user/${encodeURIComponent(trimmed)}`,
        { headers: { Accept: 'application/x-ndjson' } },
        params,
      );
      if (!res.ok) break;

      const batch = parseNdjsonGames(await res.text());
      if (batch.length === 0) break;

      const forUser = batch.filter((g) => lichessGameInvolvesUser(g, trimmed));
      all.push(...forUser);
      onProgress?.(all.length);

      if (batch.length < take) break;

      let oldest = Infinity;
      for (const g of batch) {
        const t = g.createdAt ?? 0;
        if (t > 0 && t < oldest) oldest = t;
      }
      if (!Number.isFinite(oldest)) break;
      until = oldest - 1;
    }
  } catch {
    /* boş veya kısmi liste */
  }

  return dedupeLichessGamesById(all).slice(0, maxTotal);
}

/** Tek oyun PGN'i (Lichess export); uygulama içi oynatıcı için */
export async function fetchLichessGamePgn(gameId: string): Promise<string | null> {
  const id = String(gameId ?? '').trim();
  if (!id) return null;
  const load = async (url: string) => {
    const res = await fetch(url, { headers: { Accept: 'application/x-chess-pgn' } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  };
  try {
    return await load(`/api/lichess-proxy?path=${encodeURIComponent(`game/export/${id}`)}`)
      ?? await load(`https://lichess.org/game/export/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/** Belirtilen güne ait Lichess oyunları (meta, PGN yok) */
export async function fetchLichessGamesForDay(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<LichessGame[]> {
  const trimmed = username.trim();
  if (!trimmed) return [];
  const target = day.slice(0, 10);
  const [y, m, d] = target.split('-').map(Number);
  if (!y || !m || !d) return [];
  const since = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const until = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  try {
    const params = new URLSearchParams();
    params.set('max', '100');
    params.set('moves', '0');
    params.set('since', String(since));
    params.set('until', String(until));
    const res = await lichessApiFetch(
      `games/user/${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/x-ndjson' } },
      params,
    );
    if (!res.ok) return [];
    const games = parseNdjsonGames(await res.text()).filter((g) => lichessGameInvolvesUser(g, trimmed));
    return dedupeLichessGamesById(
      games.filter((g) => {
        const ts = lichessGameTimestamp(g);
        return ts > 0 && timestampMatchesDay(ts, target);
      }),
    );
  } catch {
    return [];
  }
}

/** Chess.com kullanıcı profili çeker */
export async function fetchChessComPlayer(username: string): Promise<ChessComPlayer | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${CHESSCOM_API}/player/${encodeURIComponent(trimmed)}`);
    if (!res.ok) return null;
    return (await res.json()) as ChessComPlayer;
  } catch {
    return null;
  }
}

/** Chess.com kullanıcı istatistikleri (rating'ler) çeker */
export async function fetchChessComStats(username: string): Promise<ChessComStats | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${CHESSCOM_API}/player/${encodeURIComponent(trimmed)}/stats`);
    if (!res.ok) return null;
    return (await res.json()) as ChessComStats;
  } catch {
    return null;
  }
}

/** Chess.com son oyunları çeker (yalnızca en güncel aydan; hızlı önizleme için) */
export async function fetchChessComRecentGames(username: string, max = 10): Promise<ChessComGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return [];
  try {
    const archivesRes = await fetch(`${CHESSCOM_API}/player/${encodeURIComponent(trimmed)}/games/archives`);
    if (!archivesRes.ok) return [];
    const archivesData = (await archivesRes.json()) as { archives?: string[] };
    const archives = archivesData.archives ?? [];
    if (archives.length === 0) return [];
    const lastArchiveUrl = archives[archives.length - 1];
    const gamesRes = await fetch(lastArchiveUrl);
    if (!gamesRes.ok) return [];
    const gamesData = (await gamesRes.json()) as { games?: ChessComGame[] };
    const games = gamesData.games ?? [];
    const sorted = games.slice().sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    return sorted
      .filter((g) => chessComGameInvolvesUser(g, trimmed))
      .slice(0, max);
  } catch {
    return [];
  }
}

/** Chess.com üyelik durumu Türkçe */
export function chessComStatusLabel(status?: string): string {
  if (!status) return '—';
  if (status === 'premium') return 'Premium';
  if (status === 'basic') return 'Ücretsiz';
  if (status === 'closed') return 'Kapalı';
  return status;
}

/** Chess.com callback — tek oyun modu (rapid, blitz, bullet vb.) */
export interface ChessComModeStat {
  rating: number;
  highestRating: number;
  highestRatingDate?: string;
  lowestRating?: number;
  lowestRatingDate?: string;
  ratingChange?: number;
  ratingChangeDays?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  totalGames?: number;
  lastDate?: string;
}

/** Chess.com callback puzzle istatistikleri arayüzü */
export interface ChessComPuzzleStats {
  tactics?: {
    rating: number;
    highestRating: number;
    highestRatingDate?: string;
    lowestRating: number;
    lowestRatingDate?: string;
    attemptCount: number;
    passedCount: number;
    failedCount: number;
    totalSeconds: number;
    lastDate?: string;
  };
  puzzleRush?: {
    highestScore: number;
    avgScore: number;
    attemptCount: number;
    totalPuzzleAttempts: number;
    modes?: Record<string, number>;
  };
}

/** Chess.com callback — tüm modlar (stats/puzzles endpoint) */
export interface ChessComMemberStats extends ChessComPuzzleStats {
  rapid?: ChessComModeStat;
  blitz?: ChessComModeStat;
  bullet?: ChessComModeStat;
  daily?: ChessComModeStat;
  chess960?: ChessComModeStat;
}

function parseChessComModeStat(raw: Record<string, unknown>): ChessComModeStat | undefined {
  const rating = (raw.rating as number) ?? 0;
  if (!rating) return undefined;
  return {
    rating,
    highestRating: (raw.highest_rating as number) ?? rating,
    highestRatingDate: raw.highest_rating_date != null ? String(raw.highest_rating_date) : undefined,
    lowestRating: (raw.lowest_rating as number) ?? undefined,
    lowestRatingDate: raw.lowest_rating_date != null ? String(raw.lowest_rating_date) : undefined,
    ratingChange: (raw.rating_time_change_value as number) ?? undefined,
    ratingChangeDays: (raw.rating_time_change_days as number) ?? undefined,
    wins: (raw.total_win_count as number) ?? undefined,
    losses: (raw.total_loss_count as number) ?? undefined,
    draws: (raw.total_draw_count as number) ?? undefined,
    totalGames: (raw.total_game_count as number) ?? undefined,
    lastDate: raw.last_date != null ? String(raw.last_date) : undefined,
  };
}

/** Chess.com callback stats/puzzles JSON → üye istatistikleri */
export function parseChessComMemberStatsPayload(data: unknown): ChessComMemberStats | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as {
    stats?: Array<{ key: string; stats: Record<string, unknown>; gameCount?: number }>;
  };
  if (!raw.stats || !Array.isArray(raw.stats)) return null;

  const result: ChessComMemberStats = {};

  const modeKeys: { key: string; field: keyof Pick<ChessComMemberStats, 'rapid' | 'blitz' | 'bullet' | 'daily' | 'chess960'> }[] = [
    { key: 'rapid', field: 'rapid' },
    { key: 'lightning', field: 'blitz' },
    { key: 'bullet', field: 'bullet' },
    { key: 'chess', field: 'daily' },
    { key: 'chess960', field: 'chess960' },
  ];
  for (const { key, field } of modeKeys) {
    const entry = raw.stats.find((s) => s.key === key);
    if (entry?.stats) {
      const parsed = parseChessComModeStat(entry.stats);
      if (parsed) result[field] = parsed;
    }
  }

  const tacticsEntry = raw.stats.find((s) => s.key === 'tactics');
  if (tacticsEntry?.stats) {
    const s = tacticsEntry.stats;
    result.tactics = {
      rating: (s.rating as number) ?? 0,
      highestRating: (s.highest_rating as number) ?? 0,
      highestRatingDate: s.highest_rating_date != null ? String(s.highest_rating_date) : undefined,
      lowestRating: (s.lowest_rating as number) ?? 0,
      lowestRatingDate: s.lowest_rating_date != null ? String(s.lowest_rating_date) : undefined,
      attemptCount: (s.attempt_count as number) ?? 0,
      passedCount: (s.passed_count as number) ?? 0,
      failedCount: (s.failed_count as number) ?? 0,
      totalSeconds: (s.total_seconds as number) ?? 0,
      lastDate: s.last_date != null ? String(s.last_date) : undefined,
    };
  }

  const rushEntry = raw.stats.find((s) => s.key === 'tactics_challenge');
  if (rushEntry?.stats) {
    const s = rushEntry.stats;
    result.puzzleRush = {
      highestScore: (s.highest_score as number) ?? 0,
      avgScore: (s.avg_score as number) ?? 0,
      attemptCount: (s.attempt_count as number) ?? 0,
      totalPuzzleAttempts: (s.puzzle_attempts_total as number) ?? 0,
      modes: s.modes as Record<string, number> | undefined,
    };
  }

  return result;
}

/**
 * Chess.com callback endpoint'inden mod + bulmaca istatistikleri çeker.
 * Tarayıcı CORS nedeniyle yalnızca /api/chesscom-member-stats proxy üzerinden.
 */
export async function fetchChessComMemberStats(
  username: string,
  type: 'rated' | 'learning' | 'rush' = 'rated',
): Promise<ChessComMemberStats | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `/api/chesscom-member-stats?username=${encodeURIComponent(trimmed)}&type=${encodeURIComponent(type)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return parseChessComMemberStatsPayload(data);
  } catch {
    return null;
  }
}

/** @deprecated fetchChessComMemberStats kullanın */
export async function fetchChessComPuzzleStats(username: string): Promise<ChessComPuzzleStats | null> {
  return fetchChessComMemberStats(username);
}

export interface ChessComPuzzleDetail {
  pgn: string;
  isHumanPlayerWhite: boolean;
}

export interface ChessComRecentPuzzlesResult {
  attempts: ChessComPuzzleAttempt[];
  /** Chess.com geçmişi herkese açık API ile gelmiyorsa true */
  unavailable?: boolean;
  profileUrl?: string;
}

function normalizeChessComPuzzleAttempt(raw: Record<string, unknown>): ChessComPuzzleAttempt | null {
  const attempts = parseChessComTactics2Puzzles({ recentRatedProblems: [raw] }, 'rated');
  return attempts[0] ?? null;
}

export interface ChessComPuzzlesBundle {
  rated: ChessComPuzzleAttempt[];
  learning: ChessComPuzzleAttempt[];
  rush: ChessComPuzzleAttempt[];
  profileUrl?: string;
}

export interface ChessComPuzzlesBundleResult {
  data: ChessComPuzzlesBundle | null;
  error?: string;
}

function parseChessComPuzzlesBundlePayload(
  data: unknown,
  profileUrl: string,
): ChessComPuzzlesBundle | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as ChessComPuzzlesBundle & {
    attempts?: ChessComPuzzleAttempt[];
    recentRatedProblems?: unknown;
  };
  if (Array.isArray(body.rated)) {
    return {
      rated: body.rated,
      learning: body.learning ?? [],
      rush: body.rush ?? [],
      profileUrl: body.profileUrl ?? profileUrl,
    };
  }
  if (body.recentRatedProblems != null || (data as Record<string, unknown>).recentLearningProblems != null) {
    return {
      rated: parseChessComTactics2Puzzles(data, 'rated'),
      learning: parseChessComTactics2Puzzles(data, 'learning'),
      rush: parseChessComTactics2Puzzles(data, 'rush'),
      profileUrl: body.profileUrl ?? profileUrl,
    };
  }
  return {
    rated: body.attempts ?? [],
    learning: [],
    rush: [],
    profileUrl: body.profileUrl ?? profileUrl,
  };
}

/** Tek istekte tüm bulmaca sekmeleri + hata mesajı */
export async function fetchChessComPuzzlesBundleWithMeta(username: string): Promise<ChessComPuzzlesBundleResult> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return { data: null, error: 'Kullanıcı adı boş' };
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  try {
    const res = await fetch(`/api/chesscom-recent-puzzles?username=${encodeURIComponent(trimmed)}&type=all`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      let msg = `Chess.com yanıtı: ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: unknown; message?: unknown };
        msg = formatChessComApiError(errBody?.error ?? errBody?.message ?? errBody);
      } catch { /* ignore */ }
      return { data: null, error: msg };
    }
    const data = await res.json();
    return { data: parseChessComPuzzlesBundlePayload(data, profileUrl), error: undefined };
  } catch {
    return { data: null, error: 'Chess.com bağlantı hatası' };
  }
}

/** Tek istekte tüm bulmaca sekmeleri (Chess.com profil ile aynı kaynak) */
export async function fetchChessComPuzzlesBundle(username: string): Promise<ChessComPuzzlesBundle | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  try {
    const res = await fetch(`/api/chesscom-recent-puzzles?username=${encodeURIComponent(trimmed)}&type=all`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseChessComPuzzlesBundlePayload(data, profileUrl);
  } catch {
    return null;
  }
}

/** Chess.com callback yanıtından bulmaca denemelerini çıkarır */
export function parseChessComPuzzleAttemptsPayload(data: unknown): ChessComPuzzleAttempt[] {
  if (!data || typeof data !== 'object') return [];

  const root = data as Record<string, unknown>;
  const buckets: unknown[] = [];

  for (const key of [
    'recentPuzzles',
    'recent_puzzles',
    'puzzles',
    'attempts',
    'puzzleAttempts',
    'puzzle_attempts',
    'items',
    'data',
  ]) {
    const v = root[key];
    if (v != null) buckets.push(v);
  }

  const stats = root.stats;
  if (Array.isArray(stats)) {
    for (const entry of stats) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (e.key === 'tactics' || e.key === 'tactics_challenge') {
        const s = e.stats;
        if (s && typeof s === 'object') buckets.push(s);
      }
    }
  }

  const out: ChessComPuzzleAttempt[] = [];
  const seen = new Set<number>();

  const pushRaw = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const parsed = normalizeChessComPuzzleAttempt(raw as Record<string, unknown>);
    if (!parsed || seen.has(parsed.id)) return;
    seen.add(parsed.id);
    out.push(parsed);
  };

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      for (const item of bucket) pushRaw(item);
    } else if (bucket && typeof bucket === 'object') {
      for (const v of Object.values(bucket as Record<string, unknown>)) pushRaw(v);
    }
  }

  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Chess.com son bulmacalar — /api/chesscom-recent-puzzles → tactics2/new/puzzles (CORS yok).
 */
export async function fetchChessComRecentPuzzles(
  username: string,
  type: ChessComPuzzleTab = 'rated',
): Promise<ChessComRecentPuzzlesResult> {
  const trimmed = username.trim().toLowerCase();
  const profileUrl = trimmed
    ? `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`
    : undefined;

  if (!trimmed) {
    return { attempts: [], unavailable: true, profileUrl };
  }

  const bundle = await fetchChessComPuzzlesBundle(trimmed);
  if (!bundle) {
    return { attempts: [], unavailable: true, profileUrl };
  }

  const attempts =
    type === 'learning' ? bundle.learning : type === 'rush' ? bundle.rush : bundle.rated;

  return {
    attempts,
    unavailable: attempts.length === 0,
    profileUrl: bundle.profileUrl ?? profileUrl,
  };
}

/** Tek bulmaca PGN + tahta yönü (proxy veya doğrudan callback) */
export async function fetchChessComPuzzleDetail(puzzleId: number | string): Promise<ChessComPuzzleDetail | null> {
  const id = String(puzzleId ?? '').trim();
  if (!id) return null;

  try {
    const proxyRes = await fetch(`/api/chesscom-puzzle?id=${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!proxyRes.ok) return null;
    const body = (await proxyRes.json()) as ChessComPuzzleDetail;
    if (body?.pgn?.trim()) return body;
    return null;
  } catch {
    return null;
  }
}

export function formatChessComPuzzleTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Chess.com bulmaca denemesi zamanı — API ISO (+offset) veya Unix. */
export function formatChessComAttemptTime(iso: string): string {
  try {
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return iso;
    return new Date(ms).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Chess.com maç bitiş zamanı (Unix sn, UTC). */
export function formatChessComGameTime(endTimeSec?: number): string {
  if (!endTimeSec) return '—';
  try {
    return new Date(endTimeSec * 1000).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function chessComPuzzleAnalysisUrl(puzzleId: number | string): string {
  return `https://www.chess.com/puzzles/problem/${encodeURIComponent(String(puzzleId))}`;
}

/** Oyun hızı için Türkçe etiket */
export function lichessPerfLabel(key: string): string {
  const labels: Record<string, string> = {
    rapid: 'RAPID',
    blitz: 'BLITZ',
    bullet: 'BULLET',
    puzzle: 'PUZZLE',
    correspondence: 'GÜNLÜK',
    classical: 'KLASİK',
  };
  return labels[key] || key;
}

/**
 * Lichess kullanıcı aktivite akışını çeker.
 * Aynı kullanıcı için eşzamanlı/tekrarlayan istekler önbellek ve tek uçuş birleştirmesiyle sınırlanır.
 */
export async function fetchLichessActivity(username: string): Promise<LichessActivity[]> {
  const trimmed = username.trim();
  if (!trimmed) return [];
  const key = lichessActivityCacheKey(trimmed);
  const now = Date.now();
  const cached = lichessActivityCache.get(key);
  if (cached) {
    const ttl = cached.rateLimited ? LICHESS_ACTIVITY_RATE_LIMIT_MS : LICHESS_ACTIVITY_CACHE_TTL_MS;
    if (now - cached.fetchedAt < ttl) return cached.data;
  }

  const inflight = lichessActivityInFlight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await lichessApiFetch(`user/${encodeURIComponent(trimmed)}/activity`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 429) {
        const fallback = cached?.data ?? [];
        lichessActivityCache.set(key, { fetchedAt: Date.now(), data: fallback, rateLimited: true });
        return fallback;
      }
      if (!res.ok) {
        lichessActivityCache.set(key, { fetchedAt: Date.now(), data: [] });
        return [];
      }
      const data = await res.json();
      const activities = Array.isArray(data) ? (data as LichessActivity[]) : [];
      lichessActivityCache.set(key, { fetchedAt: Date.now(), data: activities });
      return activities;
    } catch (err) {
      lichessActivityCache.set(key, { fetchedAt: Date.now(), data: cached?.data ?? [], rateLimited: true });
      return cached?.data ?? [];
    } finally {
      lichessActivityInFlight.delete(key);
    }
  })();

  lichessActivityInFlight.set(key, promise);
  return promise;
}

function lichessGameTimestamp(game: LichessGame): number {
  return game.lastMoveAt ?? game.createdAt ?? 0;
}

/** Aktivite API 429 olduğunda günlük maç sayısı için yedek: /api/games/user */
export async function fetchLichessGamesCountForDay(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const trimmed = username.trim();
  if (!trimmed) return 0;
  const target = day.slice(0, 10);
  const [y, m, d] = target.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const since = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  try {
    const params = new URLSearchParams();
    params.set('max', '100');
    params.set('moves', '0');
    params.set('since', String(since));
    const res = await lichessApiFetch(
      `games/user/${encodeURIComponent(trimmed)}`,
      { headers: { Accept: 'application/x-ndjson' } },
      params,
    );
    if (!res.ok) return 0;
    const games = parseNdjsonGames(await res.text()).filter((g) => lichessGameInvolvesUser(g, trimmed));
    return games.filter((g) => {
      const ts = lichessGameTimestamp(g);
      return ts > 0 && timestampMatchesDay(ts, target);
    }).length;
  } catch {
    return 0;
  }
}

function isLichessActivityRateLimited(username: string): boolean {
  const cached = lichessActivityCache.get(lichessActivityCacheKey(username));
  return !!cached?.rateLimited;
}

function lichessGamesForDayFromActivity(activities: LichessActivity[], day: string): number {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;
    const games = row.games;
    if (!games) continue;
    let total = 0;
    for (const mode of Object.values(games)) {
      if (!mode || typeof mode !== 'object') continue;
      total += (mode.win || 0) + (mode.loss || 0) + (mode.draw || 0);
    }
    return total;
  }
  return 0;
}

function lichessPuzzleStatsForDayFromActivity(activities: LichessActivity[], day: string): DailyPuzzleActivityStats {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;

    const { total, passed, failed } = parseLichessActivityPuzzles(row);
    if (total > 0) {
      return { count: total, passed, failed };
    }
  }
  return { count: 0, passed: 0, failed: 0 };
}

/** Tek Lichess aktivite isteğiyle günlük maç + bulmaca özeti */
export async function fetchLichessDayStats(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<{ games: number; puzzles: DailyPuzzleActivityStats; activityRateLimited: boolean }> {
  try {
    const activities = await fetchLichessActivity(username);
    const activityRateLimited = isLichessActivityRateLimited(username);
    let games = lichessGamesForDayFromActivity(activities, day);
    const puzzles = lichessPuzzleStatsForDayFromActivity(activities, day);
    if (games === 0 && activities.length === 0 && !activityRateLimited) {
      games = await fetchLichessGamesCountForDay(username, day);
    }
    return { games, puzzles, activityRateLimited: isLichessActivityRateLimited(username) };
  } catch {
    if (isLichessGloballyRateLimited()) {
      return { games: 0, puzzles: { count: 0, passed: 0, failed: 0 }, activityRateLimited: true };
    }
    const games = await fetchLichessGamesCountForDay(username, day).catch(() => 0);
    return { games, puzzles: { count: 0, passed: 0, failed: 0 }, activityRateLimited: true };
  }
}

function puzzleAttemptOnDay(isoDate: string | undefined, day: string): boolean {
  if (!isoDate) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    return timestampMatchesDay(ms, day);
  } catch {
    return false;
  }
}

export interface DailyPuzzleActivityStats {
  /** Çözülen bulmaca sayısı */
  count: number;
  /** Doğru / çözülen */
  passed: number;
  /** Yanlış deneme sayısı */
  failed: number;
}

/**
 * Chess.com aylık arşivden belirtilen güne ait oyunlar (PGN dahil).
 */
export async function fetchChessComGamesListForDay(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<ChessComGame[]> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return [];
  const target = day.slice(0, 10);
  const [y, m] = target.split('-');
  if (!y || !m) return [];
  try {
    const res = await chessComGamesFetch(trimmed, y, m);
    if (!res.ok) return [];
    const data = (await res.json()) as { games?: ChessComGame[] };
    return dedupeChessComGames(
      (data.games ?? []).filter(
        (g) =>
          chessComGameInvolvesUser(g, trimmed) &&
          g.end_time &&
          localDayKeyFromMs(g.end_time * 1000) === target,
      ),
    ).sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0));
  } catch {
    return [];
  }
}

/**
 * Chess.com aylık arşivden belirtilen güne ait oyun sayısı.
 */
export async function fetchChessComGamesForDay(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const games = await fetchChessComGamesListForDay(username, day);
  return games.length;
}

/**
 * Lichess son aktivite akışından belirtilen güne ait puzzle denemeleri.
 */
export async function fetchLichessDailyPuzzleStats(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<DailyPuzzleActivityStats> {
  try {
    const activities = await fetchLichessActivity(username);
    return lichessPuzzleStatsForDayFromActivity(activities, day);
  } catch {
    return { count: 0, passed: 0, failed: 0 };
  }
}

/**
 * Chess.com tactics2 son bulmacalarından belirtilen güne ait denemeler (puanlı + özel + hücum).
 */
export async function fetchChessComDailyPuzzleStats(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<DailyPuzzleActivityStats> {
  const bundle = await fetchChessComPuzzlesBundle(username);
  if (!bundle) return { count: 0, passed: 0, failed: 0 };
  const target = day.slice(0, 10);
  const ratedToday = bundle.rated.filter((a) => puzzleAttemptOnDay(a.date, target));
  const unique = dedupeChessComPuzzleAttempts(ratedToday);
  const passed = unique.filter((a) => a.passed).length;
  return {
    count: passed,
    passed,
    failed: unique.filter((a) => !a.passed).length,
  };
}

/** @deprecated fetchLichessDailyPuzzleStats kullanın */
export async function fetchLichessDailyPuzzleCount(
  username: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const stats = await fetchLichessDailyPuzzleStats(username, day);
  return stats.count;
}

/** Lichess variant/speed için gösterim adı */
export function formatLichessSpeed(speed?: string, perf?: string): string {
  return (speed || perf || '—').toLowerCase();
}
