export type ExternalGamePlatform = 'lichess' | 'chesscom';

export type ChessComGameFormat = 'live' | 'daily' | 'computer';

export type ParsedExternalGameLink = {
  platform: ExternalGamePlatform;
  gameId: string;
  url: string;
  chessComFormat?: ChessComGameFormat;
};

const LICHESS_GAME_ID = /^[a-zA-Z0-9]{8}$/;
const CHESSCOM_GAME_ID = /^\d{5,14}$/;

function normalizeInput(raw: string): string {
  return String(raw ?? '').trim();
}

/** iframe veya ham metinden paylaşılabilir URL çıkarır */
export function normalizeExternalGamePasteInput(input: string): string {
  const trimmed = normalizeInput(input);
  if (!trimmed) return '';

  const iframeSrc = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  if (iframeSrc) return iframeSrc.trim();

  const emboardUrl = trimmed.match(
    /https?:\/\/(?:www\.)?chess\.com\/emboard\?[^\s"'<>]+/i,
  )?.[0];
  if (emboardUrl) return emboardUrl;

  const emboardId = trimmed.match(/emboard\?[^"'\s>]*\bid=(\d{5,14})/i)?.[1];
  if (emboardId) return `https://www.chess.com/emboard?id=${emboardId}`;

  return trimmed;
}

function chessComParsed(
  format: ChessComGameFormat,
  gameId: string,
  url?: string,
): ParsedExternalGameLink {
  return {
    platform: 'chesscom',
    gameId,
    url: url ?? `https://www.chess.com/game/${format}/${gameId}`,
    chessComFormat: format,
  };
}

function parseChessComPath(parts: string[], url: URL): ParsedExternalGameLink | null {
  const gameIdx = parts.indexOf('game');
  if (gameIdx >= 0) {
    const kind = parts[gameIdx + 1];
    const id = parts[gameIdx + 2] ?? '';
    if ((kind === 'live' || kind === 'daily' || kind === 'computer') && CHESSCOM_GAME_ID.test(id)) {
      return chessComParsed(kind, id, url.href);
    }
  }

  const analysisIdx = parts.indexOf('analysis');
  if (analysisIdx >= 0 && parts[analysisIdx + 1] === 'game') {
    const kind = parts[analysisIdx + 2];
    const id = parts[analysisIdx + 3] ?? '';
    if ((kind === 'live' || kind === 'daily' || kind === 'computer') && CHESSCOM_GAME_ID.test(id)) {
      return chessComParsed(kind, id, url.href);
    }
  }

  const liveIdx = parts.indexOf('live');
  if (liveIdx >= 0 && CHESSCOM_GAME_ID.test(parts[liveIdx + 1] ?? '')) {
    const id = parts[liveIdx + 1]!;
    return chessComParsed('live', id, `https://www.chess.com/game/live/${id}`);
  }

  return null;
}

export function parseExternalGameLink(input: string): ParsedExternalGameLink | null {
  const text = normalizeInput(input);
  if (!text) return null;

  if (LICHESS_GAME_ID.test(text)) {
    return {
      platform: 'lichess',
      gameId: text,
      url: `https://lichess.org/${text}`,
    };
  }

  if (CHESSCOM_GAME_ID.test(text)) {
    return chessComParsed('live', text);
  }

  let url: URL;
  try {
    url = new URL(text.includes('://') ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'lichess.org') {
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    if (LICHESS_GAME_ID.test(last)) {
      return { platform: 'lichess', gameId: last, url: `https://lichess.org/${last}` };
    }
    const embedIdx = parts.indexOf('embed');
    if (embedIdx >= 0 && LICHESS_GAME_ID.test(parts[embedIdx + 1] ?? '')) {
      const id = parts[embedIdx + 1]!;
      return { platform: 'lichess', gameId: id, url: `https://lichess.org/${id}` };
    }
  }

  if (host === 'chess.com') {
    if (url.pathname.includes('emboard')) {
      const id = url.searchParams.get('id')?.trim() ?? '';
      if (CHESSCOM_GAME_ID.test(id)) {
        return chessComParsed('computer', id, `https://www.chess.com/game/computer/${id}`);
      }
    }
    const parts = url.pathname.split('/').filter(Boolean);
    return parseChessComPath(parts, url);
  }

  return null;
}

export function isChessComPuzzleUrl(input: string): boolean {
  const text = normalizeInput(input).toLowerCase();
  return text.includes('/puzzles/') || text.includes('/puzzle/');
}
