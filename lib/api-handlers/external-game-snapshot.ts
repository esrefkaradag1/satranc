import type { ExternalGameSnapshot } from '../externalGameSnapshot';
import { normalizeExternalGamePasteInput, parseExternalGameLink, type ExternalGamePlatform, type ParsedExternalGameLink } from '../externalGameLink';
import { fetchLichessGameSnapshot, fetchLichessOAuthLiveSnapshot } from '../lichessLiveGameServer';
import {
  fetchStudentChessComCurrentActivity,
  fetchStudentExternalGameAuto,
  fetchStudentLivePlatformStatus,
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
      const result = await fetchStudentChessComCurrentActivity(studentId, { sharedGameUrl });
      res.status(200).json(result);
      return;
    }

    if (mode === 'live-platforms') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      try {
        const status = await fetchStudentLivePlatformStatus(studentId);
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
      const result = await fetchStudentExternalGameAuto(studentId);
      res.status(200).json(result);
      return;
    }

    if (mode === 'activity') {
      if (!studentId) {
        res.status(400).json({ error: 'studentId gerekli' });
        return;
      }
      const result = await fetchStudentActivityAuto(studentId);
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
