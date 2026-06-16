import React from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { ChessBoardFrame } from '../components/chess/ChessBoardFrame';
import { CHESSBOARD_NO_NOTATION } from './chessBoardUi';

export const ENGINE_LINE_PREVIEW_SIZE = 176;
export const ENGINE_LINE_PREVIEW_OFFSET = 12;

export type PvHoverState = { lineIndex: number; plyIndex: number } | null;
export type LinePreviewState = { fen: string; x: number; y: number } | null;

export function fenAfterUciPlies(startFen: string, uciMoves: string[], plies: number): string | null {
  try {
    const game = new Chess(startFen);
    const n = Math.min(Math.max(0, plies), uciMoves.length);
    for (let i = 0; i < n; i++) {
      const uci = uciMoves[i];
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      const m = game.move({ from: from as `${string}${string}`, to: to as `${string}${string}`, promotion: promo as 'q' | 'r' | 'b' | 'n' | undefined });
      if (!m) break;
    }
    return game.fen();
  } catch {
    return null;
  }
}

export function uciPvToSanList(fen: string, uciMoves: string[]): string[] {
  try {
    const game = new Chess(fen);
    const result: string[] = [];
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      try {
        const m = game.move({ from: from as `${string}${string}`, to: to as `${string}${string}`, promotion: promo as 'q' | 'r' | 'b' | 'n' | undefined });
        if (m) result.push(m.san);
        else break;
      } catch {
        break;
      }
    }
    return result;
  } catch {
    return uciMoves.slice(0, 8);
  }
}

export type PvMoveListTheme = 'study' | 'classroom';

type InteractiveMovesProps = {
  fen: string;
  pvMoves: string[];
  lineIndex: number;
  hovered: PvHoverState;
  onHoverPly: (lineIndex: number, plyIndex: number | null, clientX: number, clientY: number) => void;
  onClickPly?: (lineIndex: number, plyIndex: number) => void;
  maxMoves?: number;
  theme?: PvMoveListTheme;
};

export function EnginePvInteractiveMoves({
  fen,
  pvMoves,
  lineIndex,
  hovered,
  onHoverPly,
  onClickPly,
  maxMoves = 12,
  theme = 'study',
}: InteractiveMovesProps): React.ReactNode[] {
  const sanMoves = uciPvToSanList(fen, pvMoves);
  const parts = fen.split(' ');
  const startNum = parseInt(parts[5] ?? '1', 10) || 1;
  const isBlack = parts[1] === 'b';
  const nodes: React.ReactNode[] = [];
  const isClassroom = theme === 'classroom';

  for (let i = 0; i < Math.min(sanMoves.length, maxMoves); i++) {
    const plyFromStart = i;
    const isWhiteTurn = isBlack ? plyFromStart % 2 !== 0 : plyFromStart % 2 === 0;
    const moveNum = isBlack
      ? startNum + Math.floor((plyFromStart + 1) / 2)
      : startNum + Math.floor(plyFromStart / 2);
    const isHovered = hovered?.lineIndex === lineIndex && hovered?.plyIndex === i;

    if (i === 0 && isBlack && !isWhiteTurn) {
      nodes.push(
        <span key={`n-${i}`} className={isClassroom ? 'text-slate-500 mr-0.5' : 'text-[#999] mr-0.5'}>
          {startNum}...
        </span>,
      );
    } else if (isWhiteTurn) {
      nodes.push(
        <span key={`n-${i}`} className={isClassroom ? 'text-slate-500 mr-0.5' : 'text-[#999] mr-0.5'}>
          {moveNum}.
        </span>,
      );
    }

    const hoverClass = isHovered
      ? isClassroom
        ? 'bg-indigo-500/40 text-white font-bold'
        : 'bg-sky-500/35 text-white font-bold'
      : i === 0
        ? isClassroom
          ? 'font-bold text-white hover:bg-indigo-500/20'
          : 'font-bold text-[#e8e8e8] hover:bg-white/10'
        : isClassroom
          ? 'text-slate-400 hover:bg-indigo-500/15 hover:text-white'
          : 'text-[#bababa] hover:bg-white/10 hover:text-white';

    nodes.push(
      <button
        type="button"
        key={`m-${i}`}
        className={`mr-0.5 px-1 py-0.5 rounded cursor-pointer transition-colors font-mono leading-tight ${hoverClass} ${
          isClassroom ? 'text-[11px]' : 'text-[12px]'
        }`}
        onMouseEnter={(e) => onHoverPly(lineIndex, i, e.clientX, e.clientY)}
        onMouseMove={(e) => onHoverPly(lineIndex, i, e.clientX, e.clientY)}
        onMouseLeave={() => onHoverPly(lineIndex, null, 0, 0)}
        onClick={(e) => {
          e.stopPropagation();
          onClickPly?.(lineIndex, i);
        }}
      >
        {sanMoves[i]}
      </button>,
    );
  }

  if (sanMoves.length > maxMoves) {
    nodes.push(
      <span key="more" className={isClassroom ? 'text-[#8b827a] ml-0.5' : 'text-[#666] ml-0.5'}>
        …
      </span>,
    );
  }

  return nodes;
}

type PreviewPortalProps = {
  preview: LinePreviewState;
  boardOrientation?: 'white' | 'black';
  squareDark?: string;
  squareLight?: string;
};

export function EngineLinePreviewPortal({
  preview,
  boardOrientation = 'white',
  squareDark = '#5d768e',
  squareLight = '#c1c9d2',
}: PreviewPortalProps) {
  if (!preview || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[200] rounded-lg border border-white/15 bg-[#1e293b] shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/10 overflow-hidden"
      style={{
        left: Math.max(
          8,
          Math.min(preview.x + ENGINE_LINE_PREVIEW_OFFSET, window.innerWidth - ENGINE_LINE_PREVIEW_SIZE - 8),
        ),
        top: Math.max(
          8,
          Math.min(preview.y + ENGINE_LINE_PREVIEW_OFFSET, window.innerHeight - ENGINE_LINE_PREVIEW_SIZE - 8),
        ),
        width: ENGINE_LINE_PREVIEW_SIZE,
      }}
    >
      <ChessBoardFrame boardOrientation={boardOrientation} hideCoordinates className="pointer-events-none">
        <Chessboard
          key={preview.fen}
          options={{
            // FEN içindeki '/' querySelector için geçersiz — sabit id kullan
            id: 'engine-pv-preview-hover',
            position: preview.fen,
            boardOrientation,
            arePiecesDraggable: false,
            allowDragging: false,
            darkSquareStyle: { backgroundColor: squareDark },
            lightSquareStyle: { backgroundColor: squareLight },
            ...CHESSBOARD_NO_NOTATION,
          }}
        />
      </ChessBoardFrame>
    </div>,
    document.body,
  );
}

export function EngineLinePreviewInline({
  fen,
  boardOrientation = 'white',
  squareDark = '#5d768e',
  squareLight = '#c1c9d2',
  className = '',
}: {
  fen: string | null;
  boardOrientation?: 'white' | 'black';
  squareDark?: string;
  squareLight?: string;
  className?: string;
}) {
  if (!fen) return null;
  return (
    <div className={`rounded-lg border border-white/10 bg-[#1e293b] overflow-hidden shrink-0 ${className}`}>
      <ChessBoardFrame boardOrientation={boardOrientation} hideCoordinates className="pointer-events-none w-[140px]">
        <Chessboard
          key={fen}
          options={{
            id: 'engine-pv-preview-inline',
            position: fen,
            boardOrientation,
            arePiecesDraggable: false,
            allowDragging: false,
            darkSquareStyle: { backgroundColor: squareDark },
            lightSquareStyle: { backgroundColor: squareLight },
            ...CHESSBOARD_NO_NOTATION,
          }}
        />
      </ChessBoardFrame>
    </div>
  );
}

export function buildPvHoverHandler(args: {
  rootFen: string;
  pvLines: { pv: string[] }[];
  setHovered: (h: PvHoverState) => void;
  setPreview: (p: LinePreviewState) => void;
  onHoverMove?: (move: { from: string; to: string } | null) => void;
}) {
  const { rootFen, pvLines, setHovered, setPreview, onHoverMove } = args;
  return (lineIndex: number, plyIndex: number | null, clientX: number, clientY: number) => {
    if (plyIndex === null) {
      setHovered(null);
      setPreview(null);
      onHoverMove?.(null);
      return;
    }
    const line = pvLines[lineIndex];
    if (!line?.pv?.length) return;
    setHovered({ lineIndex, plyIndex });
    const previewFen = fenAfterUciPlies(rootFen, line.pv, plyIndex + 1);
    if (previewFen) {
      setPreview({ fen: previewFen, x: clientX, y: clientY });
    }
    const uci = line.pv[plyIndex];
    if (uci && uci.length >= 4) {
      onHoverMove?.({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    }
  };
}
