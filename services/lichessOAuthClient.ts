import type { LichessPuzzleActivityRow, LichessPuzzleDashboard } from '../lib/lichessOAuthServer';
import { puzzleStatsFromActivityRows } from '../lib/lichessOAuthServer';

export type { LichessPuzzleActivityRow, LichessPuzzleDashboard };
export type PlatformLichessPuzzleRow = {
  source: 'lichess';
  attempt: LichessPuzzleActivityRow;
};

export function isStudentLichessOAuthConnected(
  student: { lichessOauthConnectedAt?: string | null },
): boolean {
  return !!String(student.lichessOauthConnectedAt ?? '').trim();
}

export async function fetchLichessOAuthStatus(studentId: string): Promise<{
  connected: boolean;
  lichessUsername?: string;
}> {
  try {
    const res = await fetch(`/api/lichess-oauth-status?studentId=${encodeURIComponent(studentId)}`);
    if (!res.ok) return { connected: false };
    return (await res.json()) as { connected: boolean; lichessUsername?: string };
  } catch {
    return { connected: false };
  }
}

export async function disconnectLichessOAuth(studentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/lichess-oauth-disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || 'Bağlantı kaldırılamadı' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export async function fetchLichessPuzzleDashboard(
  studentId: string,
  days = 30,
): Promise<{ connected: boolean; dashboard?: LichessPuzzleDashboard; error?: string }> {
  try {
    const res = await fetch(
      `/api/lichess-puzzle-dashboard?studentId=${encodeURIComponent(studentId)}&days=${encodeURIComponent(String(days))}`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      dashboard?: LichessPuzzleDashboard;
      error?: string;
    };
    if (res.status === 404) return { connected: false };
    if (!res.ok) return { connected: !!data.connected, error: data.error || 'Bulmaca özeti alınamadı' };
    return { connected: true, dashboard: data.dashboard };
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export async function fetchLichessOAuthDayPuzzleStats(
  studentId: string,
  dayIso: string,
): Promise<{
  connected: boolean;
  count: number;
  passed: number;
  failed: number;
}> {
  try {
    const res = await fetch(
      `/api/lichess-puzzle-activity?studentId=${encodeURIComponent(studentId)}&day=${encodeURIComponent(dayIso)}&max=200`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      puzzles?: LichessPuzzleActivityRow[];
    };
    if (!res.ok) return { connected: false, count: 0, passed: 0, failed: 0 };
    if (data.connected === false) return { connected: false, count: 0, passed: 0, failed: 0 };
    const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
    const stats = puzzleStatsFromActivityRows(puzzles);
    return { connected: true, ...stats };
  } catch {
    return { connected: false, count: 0, passed: 0, failed: 0 };
  }
}

function pickLichessGoalPuzzles(
  puzzles: LichessPuzzleActivityRow[],
  puzzleTarget: number,
): LichessPuzzleActivityRow[] {
  if (puzzleTarget <= 0) return puzzles;
  const sorted = [...puzzles].sort((a, b) => a.date - b.date);
  const passed = sorted.filter((p) => p.win);
  if (passed.length >= puzzleTarget) return passed.slice(0, puzzleTarget);
  const failed = sorted.filter((p) => !p.win);
  return [...passed, ...failed].slice(0, puzzleTarget);
}

export async function fetchLichessPuzzlesForDay(
  studentId: string,
  dayIso: string,
  puzzleTarget?: number,
  student?: { lichessOauthConnectedAt?: string | null },
): Promise<PlatformLichessPuzzleRow[]> {
  if (student && !isStudentLichessOAuthConnected(student)) return [];
  try {
    const max = puzzleTarget && puzzleTarget > 0 ? Math.max(puzzleTarget, 20) : 120;
    const res = await fetch(
      `/api/lichess-puzzle-activity?studentId=${encodeURIComponent(studentId)}&day=${encodeURIComponent(dayIso)}&max=${max}`,
    );
    const data = (await res.json().catch(() => ({}))) as {
      puzzles?: LichessPuzzleActivityRow[];
    };
    if (!res.ok || !Array.isArray(data.puzzles)) return [];
    const picked = pickLichessGoalPuzzles(data.puzzles, puzzleTarget ?? 0);
    return picked.map((attempt) => ({ source: 'lichess' as const, attempt }));
  } catch {
    return [];
  }
}
