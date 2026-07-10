import { fetchChessComUpstream } from './chesscomUpstreamFetch.mjs';
import { decodeChessComTcn } from './chesscomTcn';
import { snapshotFromTcnMoves, type ExternalGameSnapshot } from './externalGameSnapshot';
import type { ChessComGameFormat, ParsedExternalGameLink } from './externalGameLink';

type ChessComLiveGameResponse = {
  game?: {
    id?: number | string;
    uuid?: string;
    moveList?: string;
    plyCount?: number;
    isFinished?: boolean;
    isLiveGame?: boolean;
    initialSetup?: string;
    pgnheader?: Record<string, string>;
    white?: { username?: string; rating?: number };
    black?: { username?: string; rating?: number };
    timeClass?: string;
  };
};

const FORMAT_LABELS: Record<ChessComGameFormat, string> = {
  live: 'Canlı',
  daily: 'Günlük',
  computer: 'Bot',
};

function chessComInitialFen(initialSetup: string | undefined): string | undefined {
  const raw = String(initialSetup ?? '').trim();
  if (!raw) return undefined;
  if (raw.includes('/')) return raw.split(/\s+/).slice(0, 6).join(' ');
  return undefined;
}

function chessComGameUrl(format: ChessComGameFormat, gameId: string): string {
  return `https://www.chess.com/game/${format}/${gameId}`;
}

function snapshotFromChessComCallback(
  game: NonNullable<ChessComLiveGameResponse['game']>,
  format: ChessComGameFormat,
  gameId: string,
): ExternalGameSnapshot | null {
  if (!game.moveList) return null;
  const tcnMoves = decodeChessComTcn(game.moveList);
  const white = game.pgnheader?.White ?? game.white?.username ?? 'Beyaz';
  const black = game.pgnheader?.Black ?? game.black?.username ?? 'Siyah';
  const label = [FORMAT_LABELS[format], game.timeClass, `${white} — ${black}`].filter(Boolean).join(' · ');

  return snapshotFromTcnMoves(tcnMoves, {
    source: 'chesscom',
    gameId,
    gameUrl: chessComGameUrl(format, gameId),
    label,
    isFinished: !!game.isFinished,
    initialFen: chessComInitialFen(game.initialSetup),
  });
}

export async function fetchChessComGameSnapshot(
  gameId: string,
  format: ChessComGameFormat = 'live',
): Promise<ExternalGameSnapshot | null> {
  const id = String(gameId ?? '').trim();
  if (!id) return null;

  const upstream = await fetchChessComUpstream(
    `https://www.chess.com/callback/${format}/game/${encodeURIComponent(id)}`,
    {
      headers: {
        Referer: chessComGameUrl(format, id),
      },
    },
    12000,
  );
  if (!upstream.ok) return null;

  const data = (await upstream.json()) as ChessComLiveGameResponse;
  const game = data.game;
  if (!game) return null;
  return snapshotFromChessComCallback(game, format, id);
}

export async function fetchChessComGameSnapshotAuto(gameId: string): Promise<ExternalGameSnapshot | null> {
  const id = String(gameId ?? '').trim();
  if (!id) return null;
  const formats: ChessComGameFormat[] = ['live', 'computer', 'daily'];
  for (const format of formats) {
    const snap = await fetchChessComGameSnapshot(id, format);
    if (snap) return snap;
  }
  return null;
}

export async function fetchChessComGameSnapshotFromParsed(
  parsed: ParsedExternalGameLink,
): Promise<ExternalGameSnapshot | null> {
  if (parsed.platform !== 'chesscom') return null;
  if (parsed.chessComFormat) {
    return fetchChessComGameSnapshot(parsed.gameId, parsed.chessComFormat);
  }
  return fetchChessComGameSnapshotAuto(parsed.gameId);
}

/** @deprecated fetchChessComGameSnapshot kullanın */
export async function fetchChessComLiveGameSnapshot(gameId: string): Promise<ExternalGameSnapshot | null> {
  return fetchChessComGameSnapshotAuto(gameId);
}

export async function fetchChessComUsernameLiveSnapshot(username: string): Promise<{
  snapshot?: ExternalGameSnapshot;
  error?: string;
}> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return { error: 'Chess.com kullanıcı adı yok' };
  return {
    error: 'Bot oyunu için öğrenci PGN, FEN veya Embed kodu paylaşmalı (Paylaş menüsü)',
  };
}
