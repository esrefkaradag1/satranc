import { getStudentLichessToken } from './lichessOAuthServer';
import { fetchLichessGamePgn } from '../services/chessPlatformService';
import {
  snapshotFromLichessStreamLine,
  snapshotFromPgn,
  type ExternalGameSnapshot,
} from './externalGameSnapshot';

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

export type LichessPlayingGame = {
  gameId: string;
  fullId?: string;
  color?: 'white' | 'black';
  speed?: string;
  variant?: string;
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
      speed?: string;
      variant?: { key?: string };
    }>;
  };
  const rows = Array.isArray(data.nowPlaying) ? data.nowPlaying : [];
  return rows
    .map((row) => {
      const gameId = String(row.fullId ?? row.gameId ?? '').trim();
      if (!gameId) return null;
      return {
        gameId,
        fullId: row.fullId,
        color: row.color === 'black' ? 'black' : row.color === 'white' ? 'white' : undefined,
        speed: row.speed,
        variant: row.variant?.key,
      } satisfies LichessPlayingGame;
    })
    .filter((x): x is LichessPlayingGame => x != null);
}

async function fetchLichessSnapshotFromStream(gameId: string): Promise<ExternalGameSnapshot | null> {
  const id = gameId.trim();
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
    if (snap) best = snap;
    if (line.type === 'gameFull' || line.type === 'gameState') break;
  }
  return best;
}

export async function fetchLichessGameSnapshot(gameId: string): Promise<ExternalGameSnapshot | null> {
  const id = gameId.trim();
  if (!id) return null;

  const fromStream = await fetchLichessSnapshotFromStream(id);
  if (fromStream && fromStream.moves.length > 0) return fromStream;

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
    const snapshot = await fetchLichessGameSnapshot(primary.gameId);
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
