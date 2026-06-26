import { makeBuilderGame } from './studyUtils';

export type TerminalPvLine = {
  multipv: number;
  depth: number;
  score: number;
  mate: number | null;
  pv: string[];
  nodes: number;
  nps: number;
};

export type TerminalKind = 'checkmate' | 'stalemate' | 'draw';

export type TerminalEval = {
  kind: TerminalKind;
  /** Beyaz lehine mi (mat kazanan taraf beyazsa true) */
  whiteAdvantage: boolean;
  label: string;
};

/** Oyun bittiyse motor yerine gösterilecek sentetik değerlendirme */
export function getTerminalEval(fen: string): TerminalEval | null {
  try {
    const g = makeBuilderGame(fen);
    if (!g.isGameOver()) return null;

    if (g.isCheckmate()) {
      const winnerIsWhite = g.turn() === 'b';
      return {
        kind: 'checkmate',
        whiteAdvantage: winnerIsWhite,
        label: winnerIsWhite ? 'Beyaz mat' : 'Siyah mat',
      };
    }
    if (g.isStalemate()) {
      return { kind: 'stalemate', whiteAdvantage: false, label: 'Pat' };
    }
    return { kind: 'draw', whiteAdvantage: false, label: 'Berabere' };
  } catch {
    return null;
  }
}

/** Terminal pozisyon için tek satırlık sentetik PV */
export function buildTerminalPvLines(terminal: TerminalEval, numPv: number): TerminalPvLine[] {
  const mate =
    terminal.kind === 'checkmate'
      ? (terminal.whiteAdvantage ? 1 : -1)
      : 0;
  const score =
    terminal.kind === 'checkmate'
      ? (terminal.whiteAdvantage ? 100 : -100)
      : 0;

  const base: TerminalPvLine = {
    multipv: 1,
    depth: 1,
    score,
    mate: terminal.kind === 'checkmate' ? mate : null,
    pv: [],
    nodes: 0,
    nps: 0,
  };

  return Array.from({ length: Math.max(1, numPv) }, (_, i) => ({
    ...base,
    multipv: i + 1,
  }));
}
