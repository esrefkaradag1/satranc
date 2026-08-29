import { fetchChessComGameSnapshotFromParsed } from './chesscomLiveGameServer';
import { parseExternalGameLink, isChessComPuzzleUrl } from './externalGameLink';
import type { ExternalGameSnapshot } from './externalGameSnapshot';
import { getStudentPlatformPullProfile, type StudentPlatformPullHints } from './studentPlatformPullProfile';

type ChessComToMoveGame = {
  url?: string;
  uuid?: string;
};

async function fetchChessComPlayingGame(username: string): Promise<ExternalGameSnapshot | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/playing`,
    {
      headers: { Accept: 'application/json', 'User-Agent': 'SatrancEdu/1.0' },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { games?: ChessComToMoveGame[] };
  const game = Array.isArray(data.games) ? data.games[0] : undefined;
  if (!game) return null;

  const link = game.url?.trim()
    || (game.uuid ? `https://www.chess.com/game/live/${game.uuid}` : '');
  const parsed = link ? parseExternalGameLink(link) : null;
  if (parsed?.platform === 'chesscom') {
    return fetchChessComGameSnapshotFromParsed(parsed);
  }
  return null;
}

async function fetchChessComToMoveGame(username: string): Promise<ExternalGameSnapshot | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/to-move`,
    {
      headers: { Accept: 'application/json', 'User-Agent': 'SatrancEdu/1.0' },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { games?: ChessComToMoveGame[] };
  const game = Array.isArray(data.games) ? data.games[0] : undefined;
  if (!game) return null;

  const link = game.url?.trim()
    || (game.uuid ? `https://www.chess.com/game/live/${game.uuid}` : '');
  const parsed = link ? parseExternalGameLink(link) : null;
  if (parsed?.platform === 'chesscom') {
    return fetchChessComGameSnapshotFromParsed(parsed);
  }
  return null;
}

export async function fetchChessComSnapshotByUrl(gameUrl: string): Promise<ExternalGameSnapshot | null> {
  const trimmed = String(gameUrl ?? '').trim();
  if (!trimmed || isChessComPuzzleUrl(trimmed)) return null;
  const parsed = parseExternalGameLink(trimmed);
  if (!parsed || parsed.platform !== 'chesscom') return null;
  return fetchChessComGameSnapshotFromParsed(parsed);
}

export type StudentChessComActivityResult = {
  ok: boolean;
  snapshot?: ExternalGameSnapshot;
  method?: 'chesscom-to-move' | 'chesscom-shared-link';
  error?: string;
};

/**
 * Chess.com'da öğrencinin o anki oyununu çeker.
 * Bot / günlük oyunlar için öğrencinin paylaştığı link gerekir (otomatik keşif yok).
 */
export async function fetchStudentChessComCurrentActivity(
  studentId: string,
  opts?: { sharedGameUrl?: string; hints?: StudentPlatformPullHints },
): Promise<StudentChessComActivityResult> {
  const profile = await getStudentPlatformPullProfile(studentId, opts?.hints);
  if (!profile?.chessComUsername) {
    return { ok: false, error: 'Chess.com kullanıcı adı tanımlı değil' };
  }

  const sharedUrl = String(opts?.sharedGameUrl ?? '').trim();
  if (sharedUrl) {
    const fromShare = await fetchChessComSnapshotByUrl(sharedUrl);
    if (fromShare) {
      return { ok: true, snapshot: fromShare, method: 'chesscom-shared-link' };
    }
  }

  const playing = await fetchChessComPlayingGame(profile.chessComUsername);
  if (playing && !playing.isFinished) {
    return { ok: true, snapshot: playing, method: 'chesscom-to-move' };
  }

  const live = await fetchChessComToMoveGame(profile.chessComUsername);
  if (live && !live.isFinished) {
    return { ok: true, snapshot: live, method: 'chesscom-to-move' };
  }

  return {
    ok: false,
    error:
      'Aktif Chess.com oyunu bulunamadı. Bot veya bulmaca için öğrenci oyun linkini paylaşmalı '
      + '(Chess.com → Paylaş → linki kopyala).',
  };
}

/** Eski isim — canlı PvP to-move */
export async function fetchStudentChessComLiveGame(studentId: string): Promise<StudentChessComActivityResult> {
  return fetchStudentChessComCurrentActivity(studentId);
}
