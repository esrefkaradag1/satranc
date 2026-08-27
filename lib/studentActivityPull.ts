import type { ExternalGameSnapshot } from './externalGameSnapshot';
import {
  fetchStudentExternalGameAuto,
  type StudentExternalGameAutoResult,
} from './studentExternalGamePull';
import {
  chessComPuzzleAttemptToBoardSnapshot,
  CHESSCOM_PUZZLE_RECENT_MS,
  fetchChessComLatestPuzzleByUsername,
  fetchChessComPuzzleRecentStatus,
  isChessComPuzzleRecentlyActive,
  pickLatestChessComPuzzleAttempt,
} from './studentChessComPuzzlePull';
import {
  fetchStudentLichessCurrentPuzzle,
  fetchStudentLatestLichessPuzzle,
  type LichessPuzzleBoardSnapshot,
} from './studentLichessPuzzlePull';
import { getStudentPlatformPullProfile } from './studentPlatformPullProfile';
import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';

export type StudentActivityKind = 'game' | 'puzzle';

export type StudentActivityBoardSnapshot = {
  fen: string;
  moves: string[];
  baseFen: string;
  source: 'lichess' | 'chesscom';
  gameId: string;
  gameUrl: string;
  label: string;
  boardOrientation?: 'white' | 'black';
  activityKind: StudentActivityKind;
  updatedAt: string;
};

export type StudentActivityAutoResult = {
  ok: boolean;
  snapshot?: StudentActivityBoardSnapshot;
  method?: string;
  error?: string;
};

function fromExternalGame(snapshot: ExternalGameSnapshot): StudentActivityBoardSnapshot {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: snapshot.source === 'chesscom' ? 'chesscom' : 'lichess',
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label ?? (snapshot.source === 'chesscom' ? 'Chess.com' : 'Lichess'),
    activityKind: 'game',
    updatedAt: new Date().toISOString(),
  };
}

function fromLichessPuzzle(snapshot: LichessPuzzleBoardSnapshot): StudentActivityBoardSnapshot {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: 'lichess',
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label,
    activityKind: 'puzzle',
    updatedAt: snapshot.updatedAt,
  };
}

async function fetchChessComTactics2Bundle(username: string): Promise<unknown | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  const upstream = await fetchChessComUpstream(
    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(trimmed)}`,
    {
      headers: {
        Accept: 'application/json',
        Referer: profileUrl,
      },
    },
    12000,
  );
  if (!upstream.ok) return null;
  return upstream.json();
}

async function fetchRecentChessComPuzzle(username: string): Promise<StudentActivityBoardSnapshot | null> {
  const bundle = await fetchChessComTactics2Bundle(username);
  if (!bundle) return null;
  const attempt = pickLatestChessComPuzzleAttempt(bundle);
  if (!isChessComPuzzleRecentlyActive(attempt, bundle) || !attempt) return null;
  const snap = await chessComPuzzleAttemptToBoardSnapshot(attempt);
  if (!snap) return null;
  return {
    fen: snap.fen,
    moves: snap.moves,
    baseFen: snap.baseFen,
    source: 'chesscom',
    gameId: snap.gameId,
    gameUrl: snap.gameUrl,
    label: snap.label,
    boardOrientation: snap.boardOrientation,
    activityKind: 'puzzle',
    updatedAt: snap.updatedAt,
  };
}

async function fetchRecentLichessPuzzle(studentId: string): Promise<StudentActivityBoardSnapshot | null> {
  const result = await fetchStudentLatestLichessPuzzle(studentId);
  if (!result.ok || !result.snapshot || !result.attempt) return null;
  if (Date.now() - result.attempt.date >= CHESSCOM_PUZZLE_RECENT_MS) return null;
  return fromLichessPuzzle(result.snapshot);
}

/** Canlı oyun + bulmaca — öğrencinin platformdaki güncel aktivitesi */
export async function fetchStudentActivityAuto(studentId: string): Promise<StudentActivityAutoResult> {
  const profile = await getStudentPlatformPullProfile(studentId);
  if (!profile) {
    return { ok: false, error: 'Öğrenci profili bulunamadı' };
  }

  let gameResult: StudentExternalGameAutoResult = { ok: false };
  try {
    gameResult = await fetchStudentExternalGameAuto(studentId);
    if (gameResult.ok && gameResult.snapshot) {
      return {
        ok: true,
        snapshot: fromExternalGame(gameResult.snapshot),
        method: gameResult.method,
      };
    }
  } catch (err) {
    gameResult = {
      ok: false,
      error: err instanceof Error ? err.message : 'Oyun çekilemedi',
    };
  }

  if (profile.lichessOauthConnected) {
    try {
      const current = await fetchStudentLichessCurrentPuzzle(studentId);
      if (current.ok && current.snapshot) {
        return {
          ok: true,
          snapshot: fromLichessPuzzle(current.snapshot),
          method: 'lichess-puzzle-current',
        };
      }
    } catch {
      /* sonraki yöntem */
    }
  }

  if (profile.chessComUsername) {
    try {
      const ccPuzzle = await fetchRecentChessComPuzzle(profile.chessComUsername);
      if (ccPuzzle) {
        return { ok: true, snapshot: ccPuzzle, method: 'chesscom-puzzle-recent' };
      }
    } catch {
      /* sonraki yöntem */
    }
  }

  if (profile.lichessOauthConnected) {
    try {
      const lichessPuzzle = await fetchRecentLichessPuzzle(studentId);
      if (lichessPuzzle) {
        return { ok: true, snapshot: lichessPuzzle, method: 'lichess-puzzle-recent' };
      }
    } catch {
      /* bitti */
    }
  }

  if (!profile.lichessUsername && !profile.chessComUsername && !profile.lichessOauthConnected) {
    return {
      ok: false,
      error: 'Öğrencide Lichess/Chess.com kullanıcı adı veya Lichess OAuth yok',
    };
  }

  return {
    ok: false,
    error: gameResult.error
      || 'Aktif oyun veya bulmaca bulunamadı. Lichess bulmaca için OAuth (puzzle:read) gerekir.',
  };
}

export async function fetchStudentChessComPuzzleIfRecent(
  studentId: string,
): Promise<StudentActivityAutoResult> {
  const profile = await getStudentPlatformPullProfile(studentId);
  if (!profile?.chessComUsername) {
    return { ok: false, error: 'Chess.com kullanıcı adı yok' };
  }
  const recent = await fetchChessComPuzzleRecentStatus(profile.chessComUsername);
  if (!recent) {
    return { ok: false, error: 'Son 20 dakikada Chess.com bulmacası yok' };
  }
  const result = await fetchChessComLatestPuzzleByUsername(profile.chessComUsername);
  if (!result.ok || !result.snapshot) {
    return { ok: false, error: result.error || 'Bulmaca alınamadı' };
  }
  const snap = result.snapshot;
  return {
    ok: true,
    snapshot: {
      fen: snap.fen,
      moves: snap.moves,
      baseFen: snap.baseFen,
      source: 'chesscom',
      gameId: snap.gameId,
      gameUrl: snap.gameUrl,
      label: snap.label,
      boardOrientation: snap.boardOrientation,
      activityKind: 'puzzle',
      updatedAt: snap.updatedAt,
    },
    method: 'chesscom-puzzle-latest',
  };
}
