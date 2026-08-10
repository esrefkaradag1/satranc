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
  preferRicherChessComDayStats,
  tacticsLifetimeFromMemberStats,
} from '../chesscomDailyTacticsTracker';
import { computeChessComActivityTimeSeconds } from '../platformActivityTime';
import { fetchLichessGamesTimeSecondsForDay } from '../lichessDayGamesFetch';
import { istanbulDayKey, shiftIstanbulDayKey } from '../homeworkDayUtils';
import {
  enrichChessComPuzzlesWithLifetime,
  loadTacticsLifetimeSnapshots,
  saveTacticsLifetimeSnapshots,
  supabaseFromEnv,
} from '../chesscomTacticsLifetimeStore';
import {
  fetchChessComPuzzleDailyChart,
  chessComPuzzleStatsFromDailyChart,
  type ChessComPuzzleDailyChartRow,
} from '../chesscomPuzzleDailyChart';

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

  const [ratedBundle, lifetimeMember, dailyChart, ...monthResults] = await Promise.all([
    fetchChessComPuzzlesRated(username),
    fetchChessComMemberTacticsLifetime(username),
    fetchChessComPuzzleDailyChart(username),
    ...monthFetches,
  ]);
  const lifetime = lifetimeMember ?? ratedBundle.lifetimeFromBundle;

  const monthGames = new Map<string, Awaited<ReturnType<typeof fetchChessComMonthGames>>['games']>();
  for (const row of monthResults) {
    monthGames.set(row.key, row.games);
  }

  return { rated: ratedBundle.attempts, lifetime, dailyChart, monthGames };
}

async function loadActivityPuzzleEnrichment(
  studentIds: string[],
  days: string[],
): Promise<Record<string, Record<string, { chessCom: { count: number; passed: number; failed: number }; lichess: { count: number; passed: number; failed: number } }>>> {
  const out: Record<string, Record<string, { chessCom: { count: number; passed: number; failed: number }; lichess: { count: number; passed: number; failed: number } }>> = {};
  const sb = supabaseFromEnv();
  if (!sb) return out;
  const ids = [...new Set(studentIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const isoDays = [...new Set(days.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (ids.length === 0 || isoDays.length === 0) return out;
  try {
    const { data, error } = await sb
      .from('chess_platform_day_activity')
      .select('student_id, day, records')
      .in('student_id', ids)
      .in('day', isoDays);
    if (error || !data) return out;
    for (const row of data) {
      const sid = String((row as { student_id: string }).student_id);
      const day = String((row as { day: string }).day).slice(0, 10);
      const records = (row as { records?: { chessComPuzzles?: Array<{ passed?: boolean }>; lichessPuzzles?: Array<{ win?: boolean }> } }).records;
      const cc = Array.isArray(records?.chessComPuzzles) ? records.chessComPuzzles : [];
      const li = Array.isArray(records?.lichessPuzzles) ? records.lichessPuzzles : [];
      const ccPassed = cc.filter((a) => a.passed).length;
      const liPassed = li.filter((a) => a.win).length;
      (out[sid] ??= {})[day] = {
        chessCom: { count: cc.length, passed: ccPassed, failed: cc.length - ccPassed },
        lichess: { count: li.length, passed: liPassed, failed: li.length - liPassed },
      };
    }
  } catch {
    /* tablo yoksa sessizce atla */
  }
  return out;
}

export async function computePlatformWeekStats(
  students: StudentInput[],
  days: string[],
): Promise<{ stats: Record<string, Record<string, PlatformDayStatsPayload>>; days: string[] }> {
  const uniqueDays = [...new Set(days.map((d) => d.slice(0, 10)))].sort();
  const months = uniqueYearMonths(uniqueDays);

  const lichessActivityByUser = new Map<string, LichessActivityRow[]>();
  const chessPuzzlesByUser = new Map<string, Awaited<ReturnType<typeof loadChessComUserData>>['rated']>();
  const chessLifetimeByUser = new Map<string, NonNullable<Awaited<ReturnType<typeof loadChessComUserData>>['lifetime']>>();
  const chessDailyChartByUser = new Map<string, Record<string, ChessComPuzzleDailyChartRow>>();
  const chessMonthGamesByUserMonth = new Map<string, Awaited<ReturnType<typeof fetchChessComMonthGames>>['games']>();

  const lichessUsers = [...new Set(students.map((s) => normalizeLichess(s.lichessUsername)).filter(Boolean))];
  const chessUsers = [...new Set(students.map((s) => normalizeChessCom(s.chessComUsername)).filter(Boolean))];
  const today = istanbulDayKey();
  const yesterday = shiftIstanbulDayKey(today, -1);
  const studentIds = students.map((s) => String(s.id ?? '').trim()).filter(Boolean);

  const [activityEnrichment, lifetimeSnaps] = await Promise.all([
    loadActivityPuzzleEnrichment(studentIds, uniqueDays),
    loadTacticsLifetimeSnapshots(chessUsers, [yesterday, ...uniqueDays.filter((d) => d !== yesterday)]),
  ]);

  // Lichess: "Only make one request at a time" — öğrencileri sıralı çek.
  // Chess.com ayrı API; paralel kalabilir.
  await Promise.all([
    (async () => {
      for (const username of lichessUsers) {
        lichessActivityByUser.set(username, await fetchLichessActivity(username));
      }
    })(),
    Promise.all(
      chessUsers.map(async (username) => {
        const loaded = await loadChessComUserData(username, months);
        chessPuzzlesByUser.set(username, loaded.rated);
        if (loaded.lifetime) chessLifetimeByUser.set(username, loaded.lifetime);
        if (loaded.dailyChart) chessDailyChartByUser.set(username, loaded.dailyChart);
        for (const [key, games] of loaded.monthGames.entries()) {
          chessMonthGamesByUserMonth.set(key, games);
        }
      }),
    ),
  ]);

  const lifetimeToSave: Array<{ username: string; day: string; counts: NonNullable<Awaited<ReturnType<typeof loadChessComUserData>>['lifetime']> }> = [];
  for (const [username, lifetime] of chessLifetimeByUser.entries()) {
    // Bugünün kapanış snapshot'ı — gece senkronu ve günlük delta için.
    if (uniqueDays.includes(today)) {
      lifetimeToSave.push({ username, day: today, counts: lifetime });
    }
  }

  // Günün listede görünen bulmacalarını aktivite önbelleğine yaz — antrenör detay
  // açmasa bile ertesi gün Chess.com penceresinden düşmeden önce kilitle.
  type RatedAttempt = Awaited<ReturnType<typeof loadChessComUserData>>['rated'][number];
  const activityUpserts: Array<{ student_id: string; day: string; chessComPuzzles: RatedAttempt[] }> = [];

  const stats: Record<string, Record<string, PlatformDayStatsPayload>> = {};
  const skipLichessGameTimeFetch = students.length > 6;

  for (const student of students) {
    const sid = String(student.id ?? '').trim();
    if (!sid) continue;

    const lichessUser = normalizeLichess(student.lichessUsername);
    const chessUser = normalizeChessCom(student.chessComUsername);
    const activities = lichessUser ? lichessActivityByUser.get(lichessUser) ?? [] : [];
    const ratedPuzzles = chessUser ? chessPuzzlesByUser.get(chessUser) ?? [] : [];
    const lifetime = chessUser ? chessLifetimeByUser.get(chessUser) : undefined;

    stats[sid] = {};
    for (const day of uniqueDays) {
      const lichessGames = lichessUser ? lichessGamesForDayFromActivity(activities, day) : 0;
      let lichessPuzzles = lichessUser
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
        chessPuzzles = chessComPuzzleStatsForDay(ratedPuzzles, day);

        // Profil grafiği (günlük Passed/Failed) — son 25 listesinden bağımsız geçmiş günler.
        const chartByDay = chessDailyChartByUser.get(chessUser) ?? {};
        chessPuzzles = preferRicherChessComDayStats(
          chessPuzzles,
          chessComPuzzleStatsFromDailyChart(chartByDay, day),
        );

        const dayRated = ratedPuzzles.filter((a) => {
          try {
            const ms = new Date(a.date).getTime();
            if (!Number.isFinite(ms)) return false;
            return istanbulDayKey(new Date(ms)) === day;
          } catch {
            return false;
          }
        });
        if (dayRated.length > 0) {
          activityUpserts.push({ student_id: sid, day, chessComPuzzles: dayRated });
        }

        // Kayıtlı detay listesi (antrenör detayı açınca biriken) listeden düşenleri kurtarır.
        const fromActivity = activityEnrichment[sid]?.[day]?.chessCom;
        if (fromActivity && fromActivity.count > 0) {
          chessPuzzles = preferRicherChessComDayStats(chessPuzzles, fromActivity);
        }

        // Bugün: dünkü lifetime snapshot farkı — listede olmayan ek denemeleri yakalar.
        if (day === today && lifetime) {
          const opening = lifetimeSnaps[chessUser]?.[yesterday];
          chessPuzzles = enrichChessComPuzzlesWithLifetime(chessPuzzles, opening, lifetime);
        }

        const chartTime = chartByDay[day]?.totalTimeSeconds ?? 0;
        const computedTime = computeChessComActivityTimeSeconds(
          chessUser,
          day,
          ratedPuzzles,
          monthGames,
          null,
          chessPuzzles.count,
        );
        const gamesOnlyTime = computeChessComActivityTimeSeconds(
          chessUser,
          day,
          [],
          monthGames,
          null,
          0,
        );
        activityTimeSeconds += Math.max(computedTime, gamesOnlyTime + chartTime);
      }

      const fromLiActivity = activityEnrichment[sid]?.[day]?.lichess;
      if (fromLiActivity && fromLiActivity.count > 0) {
        lichessPuzzles = preferRicherChessComDayStats(lichessPuzzles, fromLiActivity);
      }

      if (lichessUser && lichessGames > 0) {
        if (skipLichessGameTimeFetch) {
          activityTimeSeconds += lichessGames * 480;
        } else {
          activityTimeSeconds += await fetchLichessGamesTimeSecondsForDay(lichessUser, day, process.env);
        }
      }
      if (lichessPuzzles.count > 0) {
        activityTimeSeconds += lichessPuzzles.count * 45;
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

  if (lifetimeToSave.length > 0) {
    await saveTacticsLifetimeSnapshots(lifetimeToSave);
  }

  // Aktivite upsert: mevcut daha zengin kaydı ezmeden id ile birleştir.
  if (activityUpserts.length > 0) {
    const sb = supabaseFromEnv();
    if (sb) {
      for (const row of activityUpserts) {
        try {
          const { data: existing } = await sb
            .from('chess_platform_day_activity')
            .select('records')
            .eq('student_id', row.student_id)
            .eq('day', row.day)
            .maybeSingle();
          const prevRecords = (existing as { records?: { chessComPuzzles?: RatedAttempt[]; lichessPuzzles?: unknown[] } } | null)?.records;
          const prevCc = Array.isArray(prevRecords?.chessComPuzzles) ? prevRecords.chessComPuzzles : [];
          const prevLi = Array.isArray(prevRecords?.lichessPuzzles) ? prevRecords.lichessPuzzles : [];
          const map = new Map<number, RatedAttempt>();
          for (const p of prevCc) {
            if (p?.id != null) map.set(p.id, p);
          }
          for (const p of row.chessComPuzzles) {
            if (p?.id != null) map.set(p.id, p);
          }
          const merged = Array.from(map.values());
          if (merged.length === 0 && prevLi.length === 0) continue;
          await sb.from('chess_platform_day_activity').upsert({
            student_id: row.student_id,
            day: row.day,
            records: { chessComPuzzles: merged, lichessPuzzles: prevLi },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'student_id,day' });
        } catch (e) {
          console.warn('[platform-week-stats] activity upsert:', e);
        }
      }
    }
  }

  return { stats, days: uniqueDays };
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

  try {
    const result = await computePlatformWeekStats(students, days);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(result);
  } catch (err) {
    console.error('[platform-week-stats] handler error:', err);
    res.status(500).json({
      error: 'Platform verisi hesaplanamadı',
      stats: {},
      days: [...new Set(days.map((d) => String(d).slice(0, 10)))],
    });
  }
}
