/** Chess.com günlük bulmaca grafiği — son ~25 listesinden bağımsız geçmiş günler. */

import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';
import { istanbulDayKey } from './homeworkDayUtils';
import type { DayPuzzleStats } from './platformWeekStatsDerive';

export type ChessComPuzzleDailyChartRow = DayPuzzleStats & {
  totalTimeSeconds: number;
  dayCloseRating: number | null;
  timestamp: number;
};

type ChartUpstreamPayload = {
  dailyStats?: Array<{
    timestamp?: number;
    totalPassed?: number;
    totalFailed?: number;
    totalTime?: number;
    dayCloseRating?: number | null;
  }>;
};

function parseChartPayload(data: ChartUpstreamPayload | null | undefined): Record<string, ChessComPuzzleDailyChartRow> {
  const out: Record<string, ChessComPuzzleDailyChartRow> = {};
  for (const row of data?.dailyStats ?? []) {
    const ts = Number(row.timestamp);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const passed = Math.max(0, Math.round(Number(row.totalPassed) || 0));
    const failed = Math.max(0, Math.round(Number(row.totalFailed) || 0));
    const count = passed + failed;
    if (count <= 0 && !(Number(row.totalTime) > 0)) continue;
    const day = istanbulDayKey(new Date(ts));
    const next: ChessComPuzzleDailyChartRow = {
      count,
      passed,
      failed,
      totalTimeSeconds: Math.max(0, Math.round(Number(row.totalTime) || 0)),
      dayCloseRating: row.dayCloseRating == null ? null : Number(row.dayCloseRating),
      timestamp: ts,
    };
    // Aynı gün birden fazla satır gelirse daha zengin olanı tut.
    const prev = out[day];
    if (!prev || next.count > prev.count) out[day] = next;
  }
  return out;
}

/**
 * Endpoint: GET /callback/tactics/stats/{username}/chart
 * Chess.com profilindeki yeşil/kırmızı günlük çubuklar buradan gelir
 * (Attempts / Passed / Failed / Time / End Rating).
 *
 * Tarayıcıda CORS engeli olduğu için /api/chesscom-puzzle-chart proxy kullanılır.
 */
export async function fetchChessComPuzzleDailyChart(
  username: string,
  opts?: { timeoutMs?: number },
): Promise<Record<string, ChessComPuzzleDailyChartRow>> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return {};
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  try {
    // Client: aynı origin proxy (CORS yok). Server: doğrudan Chess.com.
    if (typeof window !== 'undefined') {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(
          `/api/chesscom-puzzle-chart?username=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, headers: { Accept: 'application/json' } },
        );
        if (!res.ok) return {};
        return parseChartPayload(await res.json() as ChartUpstreamPayload);
      } finally {
        window.clearTimeout(timer);
      }
    }

    const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
    const upstream = await fetchChessComUpstream(
      `https://www.chess.com/callback/tactics/stats/${encodeURIComponent(trimmed)}/chart`,
      {
        headers: {
          Accept: 'application/json',
          Referer: profileUrl,
        },
      },
      timeoutMs,
    );
    if (!upstream.ok) return {};
    return parseChartPayload(await upstream.json() as ChartUpstreamPayload);
  } catch {
    return {};
  }
}

export function chessComPuzzleStatsFromDailyChart(
  chartByDay: Record<string, ChessComPuzzleDailyChartRow>,
  dayIso: string,
): DayPuzzleStats {
  const row = chartByDay[dayIso.slice(0, 10)];
  if (!row) return { count: 0, passed: 0, failed: 0 };
  return { count: row.count, passed: row.passed, failed: row.failed };
}
