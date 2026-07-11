import { fetchChessComGameSnapshotFromParsed } from './chesscomLiveGameServer';
import { parseExternalGameLink } from './externalGameLink';
import {
  snapshotFromPgn,
  type ExternalGameSnapshot,
} from './externalGameSnapshot';
import { fetchChessComPuzzleRecentStatus } from './studentChessComPuzzlePull';
import { fetchLichessPuzzleRecentStatus } from './studentLichessPuzzlePull';
import { fetchLichessGameSnapshot, fetchLichessOAuthLiveSnapshot } from './lichessLiveGameServer';
import {
  getStudentPlatformPullProfile,
  type StudentPlatformPullProfile,
} from './studentPlatformPullProfile';

export type { StudentPlatformPullProfile };

export type StudentExternalGameAutoResult = {
  ok: boolean;
  snapshot?: ExternalGameSnapshot;
  method?: 'lichess-oauth' | 'lichess-username' | 'chesscom-to-move';
  error?: string;
};

function parseNdjson(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, unknown> => x != null);
}

function snapshotFromLichessNdjsonGame(game: Record<string, unknown>): ExternalGameSnapshot | null {
  const id = String(game.id ?? '').trim();
  if (!id) return null;
  const speed = typeof game.speed === 'string' ? game.speed : undefined;
  const status = String(game.status ?? '');
  const isFinished = status !== 'started' && status !== 'created';
  // games/user export'unda `moves` alanı SAN dizisidir ("d4 d5 Bf4 ..."), UCI değil.
  // lastFen=true ile mevcut konum `lastFen` alanında gelir.
  const movesSan = typeof game.moves === 'string' ? game.moves.trim() : '';
  const lastFen =
    (typeof game.lastFen === 'string' && game.lastFen.trim())
    || (typeof game.fen === 'string' && game.fen.trim())
    || '';
  const meta = {
    source: 'lichess' as const,
    gameId: id,
    gameUrl: `https://lichess.org/${id}`,
    label: speed,
    isFinished,
  };
  if (movesSan) {
    const fromSan = snapshotFromPgn(movesSan, meta);
    if (fromSan) {
      return lastFen ? { ...fromSan, fen: lastFen } : fromSan;
    }
  }
  if (lastFen) {
    return { fen: lastFen, moves: [], baseFen: lastFen, ...meta };
  }
  return null;
}

async function fetchLichessOngoingByUsername(username: string): Promise<ExternalGameSnapshot | null> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  // Sadece DEVAM EDEN oyunu iste (ongoing=true). Bitmiş oyunu canlıymış gibi göstermeyelim.
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(trimmed)}?max=1&ongoing=true&lastFen=true&moves=true&sort=dateDesc`,
    {
      headers: { Accept: 'application/x-ndjson' },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) return null;
  const games = parseNdjson(await res.text());
  const ongoing = games.find((g) => {
    const status = String(g.status ?? '');
    return status === 'started' || status === 'created';
  });
  if (!ongoing) return null;
  const id = String(ongoing.id ?? '').trim();
  if (!id) return null;
  // Canlı akıştan güncel konum + UCI hamleleri al; olmazsa ndjson SAN'ından üret.
  const fromStream = await fetchLichessGameSnapshot(id);
  if (fromStream && !fromStream.isFinished) return fromStream;
  const fromNdjson = snapshotFromLichessNdjsonGame(ongoing);
  if (fromNdjson) return fromNdjson;
  return fromStream;
}

async function fetchChessComOngoingByUsername(username: string): Promise<ExternalGameSnapshot | null> {
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
  const data = (await res.json()) as { games?: Array<{ url?: string; uuid?: string }> };
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

export { fetchStudentChessComCurrentActivity, fetchStudentChessComLiveGame } from './studentChessComActivityPull';

export type StudentLivePlatformStatus = {
  lichessLive: boolean;
  chesscomLive: boolean;
  lichessPuzzleRecent: boolean;
  chesscomPuzzleRecent: boolean;
};

export async function fetchStudentLivePlatformStatus(studentId: string): Promise<StudentLivePlatformStatus> {
  try {
    const profile = await getStudentPlatformPullProfile(studentId);
    if (!profile) {
      return {
        lichessLive: false,
        chesscomLive: false,
        lichessPuzzleRecent: false,
        chesscomPuzzleRecent: false,
      };
    }

    let lichessLive = false;
    let lichessPuzzleRecent = false;
    if (profile.lichessOauthConnected) {
      try {
        const oauth = await fetchLichessOAuthLiveSnapshot(studentId);
        lichessLive = !!(oauth.connected && oauth.playing && oauth.playing.length > 0);
      } catch {
        lichessLive = false;
      }
    }
    if (!lichessLive && profile.lichessUsername) {
      try {
        const snap = await fetchLichessOngoingByUsername(profile.lichessUsername);
        lichessLive = !!snap && !snap.isFinished;
      } catch {
        lichessLive = false;
      }
    }

    if (profile.lichessOauthConnected) {
      try {
        lichessPuzzleRecent = await fetchLichessPuzzleRecentStatus(studentId);
      } catch {
        lichessPuzzleRecent = false;
      }
    }

    let chesscomLive = false;
    let chesscomPuzzleRecent = false;
    if (profile.chessComUsername) {
      try {
        const [snap, puzzleRecent] = await Promise.all([
          fetchChessComOngoingByUsername(profile.chessComUsername),
          fetchChessComPuzzleRecentStatus(profile.chessComUsername),
        ]);
        chesscomLive = !!snap && !snap.isFinished;
        chesscomPuzzleRecent = puzzleRecent;
      } catch {
        chesscomLive = false;
        chesscomPuzzleRecent = false;
      }
    }

    return { lichessLive, chesscomLive, lichessPuzzleRecent, chesscomPuzzleRecent };
  } catch {
    return {
      lichessLive: false,
      chesscomLive: false,
      lichessPuzzleRecent: false,
      chesscomPuzzleRecent: false,
    };
  }
}

/** Bulmaca çek mantığı: öğrenci profilinden platform oyununu otomatik çeker */
export async function fetchStudentExternalGameAuto(
  studentId: string,
): Promise<StudentExternalGameAutoResult> {
  const profile = await getStudentPlatformPullProfile(studentId);
  if (!profile) {
    return { ok: false, error: 'Öğrenci profili bulunamadı' };
  }

  if (profile.lichessOauthConnected) {
    const oauth = await fetchLichessOAuthLiveSnapshot(studentId);
    if (oauth.snapshot) {
      return { ok: true, snapshot: oauth.snapshot, method: 'lichess-oauth' };
    }
  }

  if (profile.lichessUsername) {
    const snap = await fetchLichessOngoingByUsername(profile.lichessUsername);
    if (snap) {
      return { ok: true, snapshot: snap, method: 'lichess-username' };
    }
  }

  if (profile.chessComUsername) {
    const snap = await fetchChessComOngoingByUsername(profile.chessComUsername);
    if (snap) {
      return { ok: true, snapshot: snap, method: 'chesscom-to-move' };
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
    error: 'Devam eden oyun bulunamadı (Lichess OAuth bağlantısı hızlandırır)',
  };
}
