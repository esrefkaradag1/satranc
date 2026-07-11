import { fetchChessComMonthGames } from '../chesscomMonthGamesFetch';
import { fetchChessComUpstream } from '../chesscomUpstreamFetch.mjs';
import {
  parseChessComTactics2Puzzles,
  parseChessComTacticsLifetimeFromMemberPayload,
  parseChessComTacticsLifetimeFromTactics2Bundle,
} from '../chesscomPuzzleParse';
import { lichessProxyRequest } from '../lichessProxyThrottle.mjs';
import {
  buildPlatformDayStats,
  chessComGamesForDay,
  chessComPuzzleStatsForDay,
  lichessGamesForDayFromActivity,
  lichessPuzzleStatsForDayFromActivity,
  uniqueYearMonths,
  type LichessActivityRow,
  type PlatformDayStatsPayload,
} from '../platformWeekStatsDerive';
import {
  chessComDailyStatsFromLifetimeTracker,
  preferRicherChessComDayStats,
  tacticsLifetimeFromMemberStats,
} from '../chesscomDailyTacticsTracker';
import { computeChessComActivityTimeSeconds } from '../platformActivityTime';
import { fetchLichessGamesTimeSecondsForDay } from '../lichessDayGamesFetch';

type Req = {
  method?: string;
  body?: string | Record<string, unknown>;
};
type Res = {
  status(code: number): { json(body: unknown): void };
  setHeader(name: string, value: string): void;
};

type StudentInput = {
  id: string;
  lichessUsername?: string;
  chessComUsername?: string;
};

export const config = { maxDuration: 60 };

const LICHESS_USER_RE = /^[A-Za-z0-9_-]{1,30}$/;
const CHESSCOM_USER_RE = /^[a-z0-9_-]{1,25}$/i;
const CHESSCOM_FETCH_TIMEOUT_MS = 10_000;

function normalizeLichess(username: string | undefined): string {
  const trimmed = username?.trim() ?? '';
  return LICHESS_USER_RE.test(trimmed) ? trimmed : '';
}

function normalizeChessCom(username: string | undefined): string {
  const trimmed = username?.trim().toLowerCase() ?? '';
  return CHESSCOM_USER_RE.test(trimmed) ? trimmed : '';
}

function parseBody(req: Req): { students: StudentInput[]; days: string[] } {
  const raw = req.body;
  const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const students = Array.isArray(body?.students) ? body.students : [];
  const days = Array.isArray(body?.days)
    ? body.days.map((d: unknown) => String(d).slice(0, 10)).filter(Boolean)
    : [];
  return { students, days };
}

const LICHESS_ACTIVITY_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      },
    );
  });
}

async function fetchLichessActivity(username: string): Promise<LichessActivityRow[]> {
  const run = async (): Promise<LichessActivityRow[]> => {
    const qs = new URLSearchParams();
    qs.set('soft', '1');
    const upstream = await lichessProxyRequest(`user/${username}/activity`, qs, 'application/json', process.env);
    if (upstream.rateLimited || upstream.status === 429) return [];
    if (upstream.status < 200 || upstream.status >= 300) return [];
    const data = JSON.parse(upstream.body);
    return Array.isArray(data) ? (data as LichessActivityRow[]) : [];
  };
  // Lichess yavaşsa/backoff'taysa batch isteğini kilitleme: zaman aşımında boş dön.
  return withTimeout(run().catch(() => [] as LichessActivityRow[]), LICHESS_ACTIVITY_TIMEOUT_MS, []);
}

async function fetchChessComMemberTacticsLifetime(username: string) {
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream(
      `https://www.chess.com/callback/member/stats/puzzles/${encodeURIComponent(username)}?type=rated`,
      { headers: { Accept: 'application/json', Referer: profileUrl } },
      CHESSCOM_FETCH_TIMEOUT_MS,
    );
    if (!upstream.ok) return null;
    const data = await upstream.json();
    return tacticsLifetimeFromMemberStats(parseChessComTacticsLifetimeFromMemberPayload(data));
  } catch {
    return null;
  }
}

async function fetchChessComPuzzlesRated(username: string) {
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream(
      `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
      { headers: { Accept: 'application/json', Referer: profileUrl } },
      CHESSCOM_FETCH_TIMEOUT_MS,
    );
    if (!upstream.ok) return { attempts: [], lifetimeFromBundle: null as ReturnType<typeof tacticsLifetimeFromMemberStats> };
    const data = await upstream.json();
    return {
      attempts: parseChessComTactics2Puzzles(data, 'rated'),
      lifetimeFromBundle: tacticsLifetimeFromMemberStats(parseChessComTacticsLifetimeFromTactics2Bundle(data)),
    };
  } catch {
    return { attempts: [], lifetimeFromBundle: null as ReturnType<typeof tacticsLifetimeFromMemberStats> };
  }
}

async function loadChessComUserData(
  username: string,
  months: Array<{ year: string; month: string }>,
) {
  const monthFetches = months.map(async ({ year, month }) => {
    const key = `${username}:${year}-${month.padStart(2, '0')}`;
    try {
      const result = await fetchChessComMonthGames(username, year, month);
      return { key, games: result.games ?? [] };
    } catch {
      return { key, games: [] };
    }
  });

  const [ratedBundle, lifetimeMember, ...monthResults] = await Promise.all([
    fetchChessComPuzzlesRated(username),
    fetchChessComMemberTacticsLifetime(username),
    ...monthFetches,
  ]);
  const lifetime = lifetimeMember ?? ratedBundle.lifetimeFromBundle;

  const monthGames = new Map<string, Awaited<ReturnType<typeof fetchChessComMonthGames>>['games']>();
  for (const row of monthResults) {
    monthGames.set(row.key, row.games);
  }

  return { rated: ratedBundle.attempts, lifetime, monthGames };
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let students: StudentInput[] = [];
  let days: string[] = [];
  try {
    ({ students, days } = parseBody(req));
  } catch {
    res.status(400).json({ error: 'Geçersiz istek gövdesi' });
    return;
  }

  if (students.length === 0 || days.length === 0) {
    res.status(400).json({ error: 'students ve days gerekli' });
    return;
  }
  if (students.length > 80) {
    res.status(400).json({ error: 'En fazla 80 öğrenci' });
    return;
  }

  const uniqueDays = [...new Set(days.map((d) => d.slice(0, 10)))].sort();
  const months = uniqueYearMonths(uniqueDays);

  const lichessActivityByUser = new Map<string, LichessActivityRow[]>();
  const chessPuzzlesByUser = new Map<string, Awaited<ReturnType<typeof loadChessComUserData>>['rated']>();
  const chessLifetimeByUser = new Map<string, Awaited<ReturnType<typeof fetchChessComMemberTacticsLifetime>>>();
  const chessMonthGamesByUserMonth = new Map<string, Awaited<ReturnType<typeof fetchChessComMonthGames>>['games']>();

  const lichessUsers = [...new Set(students.map((s) => normalizeLichess(s.lichessUsername)).filter(Boolean))];
  const chessUsers = [...new Set(students.map((s) => normalizeChessCom(s.chessComUsername)).filter(Boolean))];

  await Promise.all(
    lichessUsers.map(async (username) => {
      lichessActivityByUser.set(username, await fetchLichessActivity(username));
    }),
  );

  await Promise.all(
    chessUsers.map(async (username) => {
      const loaded = await loadChessComUserData(username, months);
      chessPuzzlesByUser.set(username, loaded.rated);
      chessLifetimeByUser.set(username, loaded.lifetime);
      for (const [key, games] of loaded.monthGames.entries()) {
        chessMonthGamesByUserMonth.set(key, games);
      }
    }),
  );

  const stats: Record<string, Record<string, PlatformDayStatsPayload>> = {};

  for (const student of students) {
    const sid = String(student.id ?? '').trim();
    if (!sid) continue;

    const lichessUser = normalizeLichess(student.lichessUsername);
    const chessUser = normalizeChessCom(student.chessComUsername);
    const activities = lichessUser ? lichessActivityByUser.get(lichessUser) ?? [] : [];
    const ratedPuzzles = chessUser ? chessPuzzlesByUser.get(chessUser) ?? [] : [];

    stats[sid] = {};
    for (const day of uniqueDays) {
      const lichessGames = lichessUser ? lichessGamesForDayFromActivity(activities, day) : 0;
      const lichessPuzzles = lichessUser
        ? lichessPuzzleStatsForDayFromActivity(activities, day)
        : { count: 0, passed: 0, failed: 0 };

      let chessGames = 0;
      let chessPuzzles = { count: 0, passed: 0, failed: 0 };
      let activityTimeSeconds = 0;
      if (chessUser) {
        const [year, month] = day.split('-');
        const monthKey = `${chessUser}:${year}-${month}`;
        const monthGames = chessMonthGamesByUserMonth.get(monthKey) ?? [];
        chessGames = chessComGamesForDay(monthGames, chessUser, day);
        const listStats = chessComPuzzleStatsForDay(ratedPuzzles, day);
        const lifetime = chessLifetimeByUser.get(chessUser);
        chessPuzzles = lifetime
          ? preferRicherChessComDayStats(
              listStats,
              chessComDailyStatsFromLifetimeTracker(chessUser, day, lifetime),
            )
          : listStats;
        activityTimeSeconds += computeChessComActivityTimeSeconds(
          chessUser,
          day,
          ratedPuzzles,
          monthGames,
          lifetime,
          chessPuzzles.count,
        );
      }

      if (lichessUser && lichessGames > 0) {
        activityTimeSeconds += await fetchLichessGamesTimeSecondsForDay(lichessUser, day, process.env);
      }

      stats[sid][day] = buildPlatformDayStats(
        {
          games: lichessGames,
          puzzles: lichessPuzzles,
          error: lichessUser ? activities.length === 0 : undefined,
        },
        {
          games: chessGames,
          puzzles: chessPuzzles,
          error: chessUser ? ratedPuzzles.length === 0 && chessGames === 0 : undefined,
        },
        activityTimeSeconds,
      );
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.status(200).json({ stats, days: uniqueDays });
}
