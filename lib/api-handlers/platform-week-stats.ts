import { fetchChessComMonthGames } from '../chesscomMonthGamesFetch';
import { fetchChessComUpstream } from '../chesscomUpstreamFetch.mjs';
import { parseChessComTactics2Puzzles } from '../chesscomPuzzleParse';
import { lichessProxyRequest } from '../lichessProxyThrottle.mjs';
import {
  buildPlatformDayStats,
  chessComGamesForDay,
  chessComPuzzleStatsForDay,
  lichessGamesForDayFromActivity,
  lichessPuzzleStatsForDayFromActivity,
  uniqueYearMonths,
  type PlatformDayStatsPayload,
} from '../platformWeekStatsDerive';
import type { LichessActivity } from '../../services/chessPlatformService';

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

async function fetchLichessActivity(username: string): Promise<LichessActivity[]> {
  const qs = new URLSearchParams();
  qs.set('soft', '1');
  const upstream = await lichessProxyRequest(`user/${username}/activity`, qs, 'application/json', process.env);
  if (upstream.rateLimited || upstream.status === 429) return [];
  if (upstream.status < 200 || upstream.status >= 300) return [];
  try {
    const data = JSON.parse(upstream.body);
    return Array.isArray(data) ? (data as LichessActivity[]) : [];
  } catch {
    return [];
  }
}

async function fetchChessComPuzzlesRated(username: string) {
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  const upstream = await fetchChessComUpstream(
    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
    { headers: { Accept: 'application/json', Referer: profileUrl } },
    12000,
  );
  if (!upstream.ok) return [];
  try {
    const data = await upstream.json();
    return parseChessComTactics2Puzzles(data, 'rated');
  } catch {
    return [];
  }
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

  const lichessActivityByUser = new Map<string, LichessActivity[]>();
  const chessPuzzlesByUser = new Map<string, Awaited<ReturnType<typeof fetchChessComPuzzlesRated>>>();
  const chessMonthGamesByUserMonth = new Map<string, Awaited<ReturnType<typeof fetchChessComMonthGames>>['games']>();

  const lichessUsers = [...new Set(students.map((s) => normalizeLichess(s.lichessUsername)).filter(Boolean))];
  const chessUsers = [...new Set(students.map((s) => normalizeChessCom(s.chessComUsername)).filter(Boolean))];

  for (const username of lichessUsers) {
    lichessActivityByUser.set(username, await fetchLichessActivity(username));
  }

  for (const username of chessUsers) {
    chessPuzzlesByUser.set(username, await fetchChessComPuzzlesRated(username));
    for (const { year, month } of months) {
      const key = `${username}:${year}-${month.padStart(2, '0')}`;
      const result = await fetchChessComMonthGames(username, year, month);
      chessMonthGamesByUserMonth.set(key, result.games ?? []);
    }
  }

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
      if (chessUser) {
        const [year, month] = day.split('-');
        const monthKey = `${chessUser}:${year}-${month}`;
        const monthGames = chessMonthGamesByUserMonth.get(monthKey) ?? [];
        chessGames = chessComGamesForDay(monthGames, chessUser, day);
        chessPuzzles = chessComPuzzleStatsForDay(ratedPuzzles, day);
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
      );
    }
  }

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.status(200).json({ stats, days: uniqueDays });
}
