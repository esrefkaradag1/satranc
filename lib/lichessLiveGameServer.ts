import { getStudentLichessToken } from './lichessOAuthServer';
import { fetchLichessGamePgn } from '../services/chessPlatformService';
import {
  snapshotFromLichessStreamLine,
  snapshotFromPgn,
  type ExternalGameSnapshot,
} from './externalGameSnapshot';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

/** fullId = gameId + color suffix (ör. rCRw1AuOvonq) — stream/export için sadece gameId */
export function normalizeLichessGameId(raw: string): string {
  const id = String(raw ?? '').trim();
  if (!id) return '';
  if (/^[a-zA-Z0-9]{8}$/.test(id)) return id;
  if (/^[a-zA-Z0-9]{12}$/.test(id)) return id.slice(0, 8);
  const m = id.match(/([a-zA-Z0-9]{8})/);
  return m?.[1] ?? id;
}

export type LichessPlayingGame = {
  gameId: string;
  fullId?: string;
  color?: 'white' | 'black';
  speed?: string;
  variant?: string;
  fen?: string;
  lastMove?: string;
  isMyTurn?: boolean;
};

export async function fetchLichessPlayingGames(token: string): Promise<LichessPlayingGame[]> {
  const res = await fetch('https://lichess.org/api/account/playing', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    nowPlaying?: Array<{
      gameId?: string;
      fullId?: string;
      color?: string;
      fen?: string;
      lastMove?: string;
      isMyTurn?: boolean;
      speed?: string;
      variant?: { key?: string };
    }>;
  };
  const rows = Array.isArray(data.nowPlaying) ? data.nowPlaying : [];
  return rows
    .map((row) => {
      const bare = normalizeLichessGameId(String(row.gameId ?? '').trim())
        || normalizeLichessGameId(String(row.fullId ?? '').trim());
      if (!bare) return null;
      return {
        gameId: bare,
        fullId: row.fullId,
        color: row.color === 'black' ? 'black' : row.color === 'white' ? 'white' : undefined,
        speed: row.speed,
        variant: row.variant?.key,
        fen: typeof row.fen === 'string' ? row.fen.trim() : undefined,
        lastMove: typeof row.lastMove === 'string' ? row.lastMove.trim() : undefined,
        isMyTurn: row.isMyTurn === true,
      } satisfies LichessPlayingGame;
    })
    .filter((x): x is LichessPlayingGame => x != null);
}

/** account/playing FEN'inden acil fallback snapshot (hamle listesi olmayabilir) */
function snapshotFromPlayingRow(row: LichessPlayingGame): ExternalGameSnapshot | null {
  const fen = row.fen?.trim();
  if (!fen || !fen.includes('/')) return null;
  return {
    fen,
    moves: [],
    baseFen: fen,
    source: 'lichess',
    gameId: row.gameId,
    gameUrl: `https://lichess.org/${row.gameId}`,
    label: [row.speed, row.variant].filter(Boolean).join(' · ') || undefined,
    isFinished: false,
  };
}

async function fetchLichessSnapshotFromStream(gameId: string): Promise<ExternalGameSnapshot | null> {
  const id = normalizeLichessGameId(gameId);
  if (!id) return null;
  const res = await fetch(`https://lichess.org/api/stream/game/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/x-ndjson' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const lines = parseNdjson(text);
  let best: ExternalGameSnapshot | null = null;
  for (const line of lines) {
    const snap = snapshotFromLichessStreamLine(line, {
      gameId: id,
      gameUrl: `https://lichess.org/${id}`,
      label: typeof line.speed === 'string' ? line.speed : undefined,
    });
    if (snap) {
      best = snap;
      /** gameFull yeterli konum verdiyse dur; aksi halde gameState de dene */
      if (snap.moves.length > 0 || snap.fen !== START_FEN) break;
    }
    if (line.type === 'gameState' && best) break;
  }
  return best;
}

export async function fetchLichessGameSnapshot(gameId: string): Promise<ExternalGameSnapshot | null> {
  const id = normalizeLichessGameId(gameId);
  if (!id) return null;

  const fromStream = await fetchLichessSnapshotFromStream(id);
  if (fromStream && (fromStream.moves.length > 0 || fromStream.fen.includes('/'))) {
    return fromStream;
  }

  const pgn = await fetchLichessGamePgn(id);
  if (pgn) {
    const fromPgn = snapshotFromPgn(pgn, {
      source: 'lichess',
      gameId: id,
      gameUrl: `https://lichess.org/${id}`,
    });
    if (fromPgn) return fromPgn;
  }

  return fromStream;
}

export async function fetchLichessOAuthLiveSnapshot(studentId: string): Promise<{
  connected: boolean;
  snapshot?: ExternalGameSnapshot;
  playing?: LichessPlayingGame[];
  error?: string;
}> {
  const token = await getStudentLichessToken(studentId);
  if (!token) return { connected: false, error: 'Lichess OAuth bağlı değil' };

  try {
    const playing = await fetchLichessPlayingGames(token);
    if (playing.length === 0) {
      return { connected: true, playing: [], error: 'Devam eden Lichess oyunu yok' };
    }
    const primary = playing[0]!;
    let snapshot = await fetchLichessGameSnapshot(primary.gameId);
    if (!snapshot) {
      snapshot = snapshotFromPlayingRow(primary);
    }
    if (!snapshot) {
      return { connected: true, playing, error: 'Oyun konumu alınamadı' };
    }
    return {
      connected: true,
      playing,
      snapshot: {
        ...snapshot,
        label: [primary.speed, primary.variant].filter(Boolean).join(' · ') || snapshot.label,
      },
    };
  } catch (err) {
    return {
      connected: true,
      error: err instanceof Error ? err.message : 'Lichess canlı oyun alınamadı',
    };
  }
}
