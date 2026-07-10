import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { ArrowLeft, Plus, RotateCcw, Trash2, FlipHorizontal2 } from 'lucide-react';
import { ChessBoardFrame } from './chess/ChessBoardFrame';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';
import {
  DEFAULT_FEN,
  LICHESS_PIECE,
  makeBuilderGame,
  parseCastlingFromFen,
  parsePieceFromChessboardDrag,
  parseTurnFromFen,
  updateFenMeta,
} from '../lib/studyUtils';

function pickSquare(arg: unknown): string | null {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'square' in arg) {
    const sq = (arg as { square?: unknown }).square;
    return typeof sq === 'string' ? sq : null;
  }
  return null;
}

export type BoardPositionBuilderApplyPayload =
  | { kind: 'fen'; fen: string }
  | { kind: 'pgn'; pgn: string };

type BoardPositionBuilderProps = {
  open: boolean;
  initialFen?: string;
  boardOrientation?: 'white' | 'black';
  onClose?: () => void;
  onApply: (payload: BoardPositionBuilderApplyPayload) => void;
  /** Sidebar içinde kompakt görünüm */
  embedded?: boolean;
};

export function BoardPositionBuilder({
  open,
  initialFen = DEFAULT_FEN,
  boardOrientation = 'white',
  onClose,
  onApply,
  embedded = false,
}: BoardPositionBuilderProps) {
  const [builderFen, setBuilderFen] = useState(initialFen);
  const [fenInput, setFenInput] = useState(initialFen);
  const [pgnInput, setPgnInput] = useState('');
  const [builderTool, setBuilderTool] = useState<string>('cursor');
  const [turn, setTurn] = useState<'w' | 'b'>(() => parseTurnFromFen(initialFen));
  const [castling, setCastling] = useState(() => parseCastlingFromFen(initialFen));
  const [orientation, setOrientation] = useState<'white' | 'black'>(boardOrientation);
  const builderToolRef = useRef('cursor');
  builderToolRef.current = builderTool;

  useEffect(() => {
    if (!open) return;
    const fen = initialFen || DEFAULT_FEN;
    setBuilderFen(fen);
    setFenInput(fen);
    setPgnInput('');
    setBuilderTool('cursor');
    setTurn(parseTurnFromFen(fen));
    setCastling(parseCastlingFromFen(fen));
    setOrientation(boardOrientation);
  }, [open, initialFen, boardOrientation]);

  useEffect(() => {
    if (!open) return;
    setFenInput(builderFen);
    setTurn(parseTurnFromFen(builderFen));
    setCastling(parseCastlingFromFen(builderFen));
  }, [builderFen, open]);

  const applyBuilderAtSquare = useCallback((square: string) => {
    setBuilderFen((prev) => {
      const tool = builderToolRef.current;
      const game = makeBuilderGame(prev);
      const occupied = !!game.get(square as Square);

      if (tool === 'cursor') {
        if (occupied) {
          game.remove(square as Square);
          return game.fen();
        }
        return prev;
      }
      if (tool === 'trash') {
        try {
          game.remove(square as Square);
        } catch {
          /* boş kare */
        }
        return game.fen();
      }
      const color = tool[0] as 'w' | 'b';
      const type = tool[1].toLowerCase() as 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
      try {
        game.remove(square as Square);
        game.put({ type, color }, square as Square);
        return game.fen();
      } catch {
        return prev;
      }
    });
  }, []);

  const setFenWithMeta = useCallback((fen: string, nextTurn?: 'w' | 'b', nextCastling?: typeof castling) => {
    const t = nextTurn ?? parseTurnFromFen(fen);
    const c = nextCastling ?? parseCastlingFromFen(fen);
    const updated = updateFenMeta(fen, t, c);
    setBuilderFen(updated);
    setFenInput(updated);
    setTurn(t);
    setCastling(c);
  }, []);

  const handleLoadFenInput = useCallback(() => {
    try {
      const g = new Chess(fenInput.trim());
      setFenWithMeta(g.fen());
    } catch {
      /* geçersiz FEN — sessizce yoksay */
    }
  }, [fenInput, setFenWithMeta]);

  const handleApply = useCallback(() => {
    const pgn = pgnInput.trim();
    if (pgn) {
      onApply({ kind: 'pgn', pgn });
      return;
    }
    onApply({ kind: 'fen', fen: builderFen });
  }, [pgnInput, builderFen, onApply]);

  const boardOptions = useMemo(
    () => ({
      position: builderFen,
      boardOrientation: orientation,
      darkSquareStyle: { backgroundColor: '#5d768e' },
      lightSquareStyle: { backgroundColor: '#c1c9d2' },
      ...CHESSBOARD_ANIMATION,
      ...CHESSBOARD_NO_NOTATION,
      showAnimations: false,
      animationDurationInMs: 0,
      onSquareClick: (arg: unknown) => {
        const square = pickSquare(arg);
        if (square) applyBuilderAtSquare(square);
      },
      onPieceClick: (arg: unknown) => {
        const p = arg as { isSparePiece?: boolean; square?: string } | null;
        if (!p?.square || p.isSparePiece) return;
        applyBuilderAtSquare(p.square);
      },
      onSquareRightClick: (arg: unknown) => {
        const square = pickSquare(arg);
        if (!square) return;
        setBuilderFen((prev) => {
          const game = makeBuilderGame(prev);
          const piece = game.get(square as Square);
          if (!piece) return prev;
          game.remove(square as Square);
          const newColor = piece.color === 'w' ? 'b' : 'w';
          const pt = String(piece.type).toLowerCase();
          if (!/[pnbrqk]/.test(pt)) return prev;
          try {
            game.put(
              { type: pt as 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: newColor },
              square as Square,
            );
            return game.fen();
          } catch {
            return prev;
          }
        });
      },
      onPieceDrop: (args: unknown) => {
        const a = args as { piece?: unknown; sourceSquare?: string; targetSquare?: string | null } | null;
        const sourceSquare = a?.sourceSquare;
        const targetSquare = a?.targetSquare;
        if (!sourceSquare || !targetSquare) return false;
        const parsed = parsePieceFromChessboardDrag(a?.piece);
        if (!parsed) return false;
        setBuilderFen((prev) => {
          const game = makeBuilderGame(prev);
          game.remove(sourceSquare as Square);
          game.remove(targetSquare as Square);
          game.put({ type: parsed.type, color: parsed.color }, targetSquare as Square);
          return game.fen();
        });
        return true;
      },
    }),
    [applyBuilderAtSquare, builderFen, orientation],
  );

  if (!open) return null;
  if (!embedded && typeof document === 'undefined') return null;

  const pieceBtn = (p: string, compact = false) => (
    <button
      key={p}
      type="button"
      onClick={() => setBuilderTool(builderTool === p ? 'cursor' : p)}
      className={`aspect-square rounded-lg flex items-center justify-center transition-all ${
        builderTool === p ? 'bg-indigo-500/25 ring-2 ring-indigo-500' : 'hover:bg-white/10 bg-white/5'
      }`}
      title={p}
    >
      <img
        src={LICHESS_PIECE(p)}
        alt={p}
        className={compact ? 'w-6 h-6' : 'w-9 h-9 lg:w-10 lg:h-10'}
      />
    </button>
  );

  const castlingPanel = (compact = false) => (
    <div>
      <p className={`font-bold text-slate-500 uppercase tracking-widest mb-2 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        Rok hakları
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <p className={`text-slate-400 font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Beyaz</p>
          {([
            ['K', 'O-O'] as const,
            ['Q', 'O-O-O'] as const,
          ]).map(([key, label]) => (
            <label
              key={key}
              className={`flex items-center gap-1.5 text-slate-300 cursor-pointer ${compact ? 'text-[10px]' : 'text-[12px]'}`}
            >
              <input
                type="checkbox"
                checked={castling[key]}
                onChange={(e) => {
                  const next = { ...castling, [key]: e.target.checked };
                  setFenWithMeta(builderFen, turn, next);
                }}
                className="accent-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className={`text-slate-400 font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Siyah</p>
          {([
            ['k', 'O-O'] as const,
            ['q', 'O-O-O'] as const,
          ]).map(([key, label]) => (
            <label
              key={key}
              className={`flex items-center gap-1.5 text-slate-300 cursor-pointer ${compact ? 'text-[10px]' : 'text-[12px]'}`}
            >
              <input
                type="checkbox"
                checked={castling[key]}
                onChange={(e) => {
                  const next = { ...castling, [key]: e.target.checked };
                  setFenWithMeta(builderFen, turn, next);
                }}
                className="accent-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const boardBlock = (compact = false) => (
    <div className={compact ? 'w-full aspect-square' : 'w-full max-w-[min(72vh,100%)] aspect-square'}>
      <ChessBoardFrame
        boardOrientation={orientation}
        className="w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-lg cursor-crosshair"
        boardClassName="overflow-hidden"
      >
        <div className="absolute inset-0">
          <Chessboard options={boardOptions} />
        </div>
      </ChessBoardFrame>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-2.5 flex-1 min-h-0 rounded-xl border border-white/[0.08] bg-slate-900/50 p-2.5 overflow-y-auto custom-scrollbar">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tahta yapıcı</p>

        <div className="space-y-1.5">
          <div className="grid grid-cols-6 gap-1">
            {['wP', 'wB', 'wN', 'wR', 'wQ', 'wK'].map((p) => pieceBtn(p, true))}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {['bP', 'bB', 'bN', 'bR', 'bQ', 'bK'].map((p) => pieceBtn(p, true))}
          </div>
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setBuilderTool(builderTool === 'trash' ? 'cursor' : 'trash')}
            className={`p-1.5 rounded-lg border transition-colors ${
              builderTool === 'trash'
                ? 'bg-rose-600/25 border-rose-500/40 text-rose-200'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
            title="Silgi"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white"
            title="Tahtayı çevir"
          >
            <FlipHorizontal2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFenWithMeta(DEFAULT_FEN)}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white"
            title="Başlangıç konumu"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFenWithMeta('8/8/8/8/8/8/8/8 w - - 0 1')}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-rose-300"
            title="Tahtayı temizle"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {boardBlock(true)}

        {builderTool !== 'cursor' ? (
          <p className="text-[10px] text-indigo-300/80 text-center">
            {builderTool === 'trash' ? 'Silmek için kareye tıklayın' : 'Yerleştirmek için kareye tıklayın'}
          </p>
        ) : (
          <p className="text-[9px] text-slate-600 text-center leading-snug">
            Sağ tık: renk değiştir · Sürükle: taşı taşı
          </p>
        )}

        <select
          value={turn}
          onChange={(e) => {
            const t = e.target.value as 'w' | 'b';
            setFenWithMeta(builderFen, t, castling);
          }}
          className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-2 text-white text-[11px] outline-none focus:border-indigo-500/50"
        >
          <option value="w">Sıra beyazda</option>
          <option value="b">Sıra siyahta</option>
        </select>

        {castlingPanel(true)}

        <button
          type="button"
          onClick={handleApply}
          className="w-full py-2.5 rounded-xl premium-gradient text-white font-bold text-[12px] shadow-md shadow-indigo-500/20 shrink-0"
        >
          Canlı tahtaya uygula
        </button>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-[#0d0f12] flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/90 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-white font-bold text-[15px]">
          <Plus className="w-4 h-4 text-indigo-400" />
          Kurulum Konumu
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <aside className="shrink-0 border-b md:border-b-0 md:border-r border-white/10 bg-slate-900/40 p-3 md:p-4 md:w-52 lg:w-56 xl:w-64 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Beyaz taşlar</p>
          <div className="grid grid-cols-6 md:grid-cols-3 gap-1.5 mb-4">
            {['wP', 'wB', 'wN', 'wR', 'wQ', 'wK'].map((p) => pieceBtn(p))}
          </div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Siyah taşlar</p>
          <div className="grid grid-cols-6 md:grid-cols-3 gap-1.5 mb-4">
            {['bP', 'bB', 'bN', 'bR', 'bQ', 'bK'].map((p) => pieceBtn(p))}
          </div>
          <select
            value={turn}
            onChange={(e) => {
              const t = e.target.value as 'w' | 'b';
              setFenWithMeta(builderFen, t, castling);
            }}
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-[13px] outline-none focus:border-indigo-500/50 mb-3"
          >
            <option value="w">Hamle sırası beyazda</option>
            <option value="b">Hamle sırası siyahta</option>
          </select>
          <div className="flex md:flex-col gap-2">
            <button
              type="button"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white text-[12px]"
              title="Tahtayı çevir"
            >
              <FlipHorizontal2 className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">Çevir</span>
            </button>
            <button
              type="button"
              onClick={() => setFenWithMeta(DEFAULT_FEN)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white text-[12px]"
              title="Başlangıç konumu"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">Sıfırla</span>
            </button>
            <button
              type="button"
              onClick={() => setFenWithMeta('8/8/8/8/8/8/8/8 w - - 0 1')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-rose-300 text-[12px]"
              title="Tahtayı temizle"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">Temizle</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 md:p-6 min-w-0">
          {boardBlock(false)}
          {builderTool !== 'cursor' ? (
            <p className="mt-2 text-[11px] text-indigo-300/80 text-center">
              {builderTool === 'trash' ? 'Silmek için kareye tıklayın' : 'Yerleştirmek için kareye tıklayın'}
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-slate-600 text-center hidden md:block">
              Sağ tık: taş rengini değiştir · Sürükle: taşı taşı
            </p>
          )}
        </div>

        <aside className="shrink-0 border-t md:border-t-0 md:border-l border-white/10 bg-slate-900/40 p-3 md:p-4 md:w-64 lg:w-72 xl:w-80 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          {castlingPanel(false)}

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">FEN</p>
            <input
              type="text"
              value={fenInput}
              onChange={(e) => setFenInput(e.target.value)}
              onBlur={handleLoadFenInput}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-slate-300 font-mono focus:border-indigo-500/50 outline-none"
              placeholder="FEN"
            />
          </div>

          <div className="space-y-2 flex-1 min-h-[6rem] flex flex-col">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PGN</p>
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="PGN Gir"
              className="flex-1 min-h-[5rem] w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-[13px] text-slate-300 focus:border-indigo-500/50 outline-none resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleApply}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[14px] shadow-lg shadow-emerald-900/30 transition-colors shrink-0"
          >
            Yükle
          </button>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
