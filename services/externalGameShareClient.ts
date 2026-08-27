import type { ExternalGameSnapshot } from '../lib/externalGameSnapshot';
import { normalizeExternalGamePasteInput } from '../lib/externalGameLink';

export type ExternalGameSnapshotResponse = {
  ok?: boolean;
  parsed?: { platform: string; gameId: string; url: string };
  snapshot?: ExternalGameSnapshot;
  error?: string;
};

export type LichessOAuthLiveResponse = {
  connected: boolean;
  snapshot?: ExternalGameSnapshot;
  playing?: Array<{ gameId: string; speed?: string; variant?: string }>;
  error?: string;
};

export async function fetchExternalGameSnapshotByLink(link: string): Promise<ExternalGameSnapshotResponse> {
  try {
    const qs = new URLSearchParams({ mode: 'link', link: normalizeExternalGamePasteInput(link) });
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as ExternalGameSnapshotResponse;
    if (!res.ok) return { error: data.error || 'Oyun alınamadı' };
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export type StudentExternalGameAutoResponse = {
  ok: boolean;
  snapshot?: ExternalGameSnapshot;
  method?: 'lichess-oauth' | 'lichess-username' | 'chesscom-to-move';
  error?: string;
};

export async function fetchStudentExternalGameAuto(studentId: string): Promise<StudentExternalGameAutoResponse> {
  try {
    const qs = new URLSearchParams({ mode: 'auto', studentId });
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as StudentExternalGameAutoResponse;
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Oyun çekilemedi (HTTP ${res.status})`,
      };
    }
    if (data.ok === false) {
      return {
        ok: false,
        error: data.error || 'Aktif oyun bulunamadı',
      };
    }
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export async function fetchLichessOAuthLiveSnapshot(studentId: string): Promise<LichessOAuthLiveResponse> {
  try {
    const qs = new URLSearchParams({ mode: 'lichess-oauth', studentId });
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as LichessOAuthLiveResponse;
    if (!res.ok) return { connected: false, error: data.error || 'Lichess canlı oyun alınamadı' };
    return data;
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export type ChessComLiveResponse = {
  ok: boolean;
  snapshot?: ExternalGameSnapshot;
  method?: 'chesscom-to-move' | 'chesscom-shared-link';
  error?: string;
};

export async function fetchChessComLiveSnapshot(
  studentId: string,
  sharedGameUrl?: string,
): Promise<ChessComLiveResponse> {
  try {
    const qs = new URLSearchParams({ mode: 'chesscom-live', studentId });
    const link = String(sharedGameUrl ?? '').trim();
    if (link) qs.set('sharedGameUrl', link);
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as ChessComLiveResponse;
    if (!res.ok) return { ok: false, error: data.error || 'Chess.com canlı oyun alınamadı' };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export type StudentLivePlatformStatus = {
  lichessLive: boolean;
  chesscomLive: boolean;
  lichessPuzzleRecent: boolean;
  chesscomPuzzleRecent: boolean;
};

export type StudentActivityAutoResponse = {
  ok: boolean;
  snapshot?: {
    fen: string;
    moves: string[];
    baseFen: string;
    source: 'lichess' | 'chesscom';
    gameId: string;
    gameUrl: string;
    label: string;
    boardOrientation?: 'white' | 'black';
    activityKind: 'game' | 'puzzle';
    updatedAt: string;
  };
  method?: string;
  error?: string;
};

export async function fetchStudentActivityAuto(studentId: string): Promise<StudentActivityAutoResponse> {
  try {
    const qs = new URLSearchParams({ mode: 'activity', studentId });
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as StudentActivityAutoResponse;
    if (!res.ok) {
      return { ok: false, error: data.error || `Aktivite çekilemedi (HTTP ${res.status})` };
    }
    if (data.ok === false) {
      return { ok: false, error: data.error || 'Aktif oyun/bulmaca bulunamadı' };
    }
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export async function fetchStudentLivePlatformStatus(studentId: string): Promise<StudentLivePlatformStatus> {
  try {
    const qs = new URLSearchParams({ mode: 'live-platforms', studentId });
    const res = await fetch(`/api/external-game-snapshot?${qs.toString()}`);
    const data = (await res.json().catch(() => ({}))) as StudentLivePlatformStatus;
    if (!res.ok) return { lichessLive: false, chesscomLive: false, lichessPuzzleRecent: false, chesscomPuzzleRecent: false };
    return {
      lichessLive: !!data.lichessLive,
      chesscomLive: !!data.chesscomLive,
      lichessPuzzleRecent: !!data.lichessPuzzleRecent,
      chesscomPuzzleRecent: !!data.chesscomPuzzleRecent,
    };
  } catch {
    return { lichessLive: false, chesscomLive: false, lichessPuzzleRecent: false, chesscomPuzzleRecent: false };
  }
}

export function activitySnapshotToStudentBoard(
  snapshot: NonNullable<StudentActivityAutoResponse['snapshot']>,
): {
  fen: string;
  moves: string[];
  baseFen: string;
  source: 'lichess' | 'chesscom';
  gameId: string;
  gameUrl: string;
  label?: string;
  boardOrientation?: 'white' | 'black';
  activityKind: 'game' | 'puzzle';
  updatedAt: string;
} {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: snapshot.source,
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label,
    boardOrientation: snapshot.boardOrientation,
    activityKind: snapshot.activityKind,
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
  };
}
export function externalSnapshotToStudentBoard(
  snapshot: ExternalGameSnapshot,
): {
  fen: string;
  moves: string[];
  baseFen: string;
  source: ExternalGameSnapshot['source'];
  gameId: string;
  gameUrl: string;
  label?: string;
  updatedAt: string;
} {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: snapshot.source,
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label,
    updatedAt: new Date().toISOString(),
  };
}
