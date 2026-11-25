import type { ExternalGameSnapshot } from '../externalGameSnapshot';
import { normalizeExternalGamePasteInput, parseExternalGameLink, type ExternalGamePlatform, type ParsedExternalGameLink } from '../externalGameLink';
import { fetchLichessGameSnapshot, fetchLichessOAuthLiveSnapshot } from '../lichessLiveGameServer';
import {
  fetchStudentChessComCurrentActivity,
  fetchStudentExternalGameAuto,
  fetchStudentLivePlatformStatus,
  type StudentPlatformPullHints,
} from '../studentExternalGamePull';
import { fetchStudentActivityAuto } from '../studentActivityPull';
import { fetchChessComGameSnapshotFromParsed } from '../chesscomLiveGameServer';

type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
};

function queryParam(q: Record<string, string | string[] | undefined>, key: string): string {
  const raw = q[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

function profileHintsFromQuery(
  q: Record<string, string | string[] | undefined>,
): StudentPlatformPullHints {
  const lichessUsername = queryParam(q, 'lichessUsername');
  const chessComUsername = queryParam(q, 'chessComUsername');
  return {
    ...(lichessUsername ? { lichessUsername } : {}),
    ...(chessComUsername ? { chessComUsername } : {}),
  };
}

/**
 * Aynı öğrenci için kısa süreli önbellek + aynı anda tek istek (in-flight birleştirme).
 * Her öğrenci tarayıcısı birkaç sn'de bir sorduğundan sunucu Lichess/Chess.com'a aynı sorguyu
 * tekrar tekrar atıp 429 yiyordu. Oyun bulunduysa kısa, bulunamadıysa uzun süre aynı yanıt verilir.
 */
const SNAPSHOT_FOUND_TTL_MS = 3_000;
const SNAPSHOT_MISS_TTL_MS = 20_000;
const SNAPSHOT_CACHE_MAX = 500;
const snapshotCache = new Map<string, { at: number; found: boolean; value: unknown }>();
const snapshotInflight = new Map<string, Promise<unknown>>();

async function coalescedSnapshot(key: string, load: () => Promise<unknown>): Promise<unknown> {
  const hit = snapshotCache.get(key);
  if (hit && Date.now() - hit.at < (hit.found ? SNAPSHOT_FOUND_TTL_MS : SNAPSHOT_MISS_TTL_MS)) {
    return hit.value;
  }
  const pending = snapshotInflight.get(key);
  if (pending) return pending;
  const task = (async () => {
    try {
      const value = await load();
      const found = !!(value && typeof value === 'object' && (value as { ok?: boolean }).ok);
      if (snapshotCache.size >= SNAPSHOT_CACHE_MAX) snapshotCache.clear();
      snapshotCache.set(key, { at: Date.now(), found, value });
      return value;
    } finally {
      snapshotInflight.delete(key);
    }
  })();
  snapshotInflight.set(key, task);
  return task;
}

function hintsKey(h: StudentPlatformPullHints): string {
  return `${h.lichessUsername ?? ''}|${h.chessComUsername ?? ''}`;
}

async function snapshotForPlatform(
  parsed: ParsedExternalGameLink,
): Promise<ExternalGameSnapshot | null> {
  if (parsed.platform === 'lichess') return fetchLichessGameSnapshot(parsed.gameId);
  return fetchChessComGameSnapshotFromParsed(parsed);
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Yalnızca GET desteklenir' });
    return;
  }

  const mode = queryParam(req.query, 'mode') || 'link';
  const studentId = queryParam(req.query, 'studentId');
  const link = queryParam(req.query, 'link');
  const platform = queryParam(req.query, 'platform') as ExternalGamePlatform | '';
  const gameId = queryParam(req.query, 'gameId');
  const profileHints = profileHintsFromQuery(req.query);

  try {
    if (mode === 'lichess-oauth') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      const result = await fetchLichessOAuthLiveSnapshot(studentId);
      res.status(200).json(result);
      return;
    }

    if (mode === 'chesscom-live') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      const sharedGameUrl = queryParam(req.query, 'sharedGameUrl');
      const result = await fetchStudentChessComCurrentActivity(studentId, {
        sharedGameUrl,
        hints: profileHints,
      });
      res.status(200).json(result);
      return;
    }

    if (mode === 'live-platforms') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      try {
        const status = await fetchStudentLivePlatformStatus(studentId, profileHints);
        res.status(200).json(status);
      } catch {
        res.status(200).json({
          lichessLive: false,
          chesscomLive: false,
          lichessPuzzleRecent: false,
          chesscomPuzzleRecent: false,
        });
      }
      return;
    }

    if (mode === 'auto') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      const result = await coalescedSnapshot(
        `auto|${studentId}|${hintsKey(profileHints)}`,
        () => fetchStudentExternalGameAuto(studentId, profileHints),
      );
      res.status(200).json(result);
      return;
    }

    if (mode === 'activity') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      const result = await coalescedSnapshot(
        `activity|${studentId}|${hintsKey(profileHints)}`,
        () => fetchStudentActivityAuto(studentId, profileHints),
      );
      res.status(200).json(result);
      return;
    }

    const normalizedLink = link ? normalizeExternalGamePasteInput(link) : '';
    let parsed = normalizedLink ? parseExternalGameLink(normalizedLink) : null;
    if (!parsed && platform && gameId) {
      parsed = {
        platform: platform === 'chesscom' ? 'chesscom' : 'lichess',
        gameId,
        url: platform === 'chesscom'
          ? `https://www.chess.com/game/live/${gameId}`
          : `https://lichess.org/${gameId}`,
      };
    }

    if (!parsed) {
      res.status(400).json({ error: 'Geçerli Lichess veya Chess.com oyun linki gerekli' });
      return;
    }

    const snapshot = await snapshotForPlatform(parsed);
    if (!snapshot) {
      res.status(404).json({ error: 'Oyun konumu alınamadı', parsed });
      return;
    }

    res.status(200).json({
      ok: true,
      parsed,
      snapshot: {
        ...snapshot,
        gameUrl: parsed.url,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Dış oyun anlık görüntüsü alınamadı',
    });
  }
}
