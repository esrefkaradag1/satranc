import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Settings2, ChevronDown, Plus, FlipHorizontal, BarChart2, Info, Menu, Share2, Download, Highlighter } from 'lucide-react';
import { Chess } from 'chess.js';
import { useStockfish, type PvLine } from '../../hooks/useStockfish';
import { CHESSBOARD_NO_NOTATION, pvLineToEvalBarPawns } from '../../lib/chessBoardUi';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';

const ENGINE_LINE_PREVIEW_SIZE = 176;
const ENGINE_LINE_PREVIEW_OFFSET = 14;

function EvalSparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const width = 100;
  const height = 22;
  const min = Math.min(...scores, -2);
  const max = Math.max(...scores, 2);
  const range = max - min || 1;
  const midY = height - ((0 - min) / range) * height;
  const pts = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * width;
      const y = height - ((Math.max(-8, Math.min(8, s)) - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden title="Değerlendirme kararsızlığı">
      <line x1={0} y1={midY} x2={width} y2={midY} stroke="currentColor" strokeWidth={0.5} className="text-white/15" strokeDasharray="2 2" />
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={pts} className="text-indigo-400/90" />
    </svg>
  );
}

interface EngineAnalysisProps {
  fen: string;
  enabled: boolean;
  onToggle: () => void;
  boardOrientation?: 'white' | 'black';
  /** PV satırı hover olduğunda mini-board için preview FEN (eski API; yüzen önizleme tercih edilir) */
  onHoverPreviewFen?: (fen: string | null) => void;
  /** PV satırı hover olduğunda ana tahtada ok çizilmesi için hamle bilgisi */
  onHoverMove?: (move: { from: string; to: string } | null) => void;
  /** Analiz satırındaki bir hamleye tıklanınca o ana kadar olan PV'yi tahtaya aktar */
  onPvMoveClick?: (payload: { uciMoves: string[]; plyIndex: number }) => void;
  /** En iyi hamle (PV[0]) değiştiğinde bildirim */
  onTopMoveUpdate?: (move: { from: string; to: string } | null) => void;
  /** Tahta solundaki avantaj çubuğu — sidebar motor skoru ile senkron */
  onEvalScoreChange?: (scorePawns: number) => void;
  /** StudyPage "tahta/çalışma" ayarları için dış panel kontrolleri */
  boardSettings?: {
    showEvalBar: boolean;
    onToggleEvalBar: () => void;
    showEngineHint: boolean;
    onToggleEngineHint: () => void;
    practiceMode: boolean;
    onTogglePracticeMode: () => void;
    onFlipBoard: () => void;
    onOpenBoardBuilder: () => void;
    drawingEnabled: boolean;
    onToggleDrawing: () => void;
    onOpenMultiboard: () => void;
    onOpenShare: () => void;
    onDownloadPgn: () => void;
    canDownloadPgn?: boolean;
  };
}

function uciToSan(fen: string, uciMoves: string[]): string[] {
  try {
    const game = new Chess(fen);
    const result: string[] = [];
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      try {
        const m = game.move({ from: from as any, to: to as any, promotion: promo as any });
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

function fenAfterUciPlies(startFen: string, uciMoves: string[], plies: number): string | null {
  try {
    const game = new Chess(startFen);
    const n = Math.min(Math.max(0, plies), uciMoves.length);
    for (let i = 0; i < n; i++) {
      const uci = uciMoves[i];
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.length > 4 ? uci[4] : undefined;
      const m = game.move({ from: from as any, to: to as any, promotion: promo as any });
      if (!m) break;
    }
    return game.fen();
  } catch {
    return null;
  }
}

function formatScore(line: PvLine, turn: 'w' | 'b'): string {
  const flip = turn === 'b' ? -1 : 1;
  if (line.mate !== null) {
    const m = line.mate * flip;
    return m > 0 ? `M${m}` : `-M${Math.abs(m)}`;
  }
  const s = line.score * flip;
  return s > 0 ? `+${s.toFixed(1)}` : s.toFixed(1);
}

function scoreColorClass(line: PvLine, turn: 'w' | 'b'): string {
  const flip = turn === 'b' ? -1 : 1;
  const s = line.mate !== null ? (line.mate * flip > 0 ? 5 : -5) : line.score * flip;
  if (s > 0.5) return 'text-white';
  if (s < -0.5) return 'text-slate-400';
  return 'text-slate-300';
}

function InteractiveMoveList({
  fen,
  pvMoves,
  lineIndex,
  hovered,
  onHoverPly,
  onClickPly,
}: {
  fen: string;
  pvMoves: string[];
  lineIndex: number;
  hovered: { lineIndex: number; plyIndex: number } | null;
  onHoverPly: (lineIndex: number, plyIndex: number | null, clientX: number, clientY: number) => void;
  onClickPly: (lineIndex: number, plyIndex: number) => void;
}): React.ReactNode[] {
  const sanMoves = uciToSan(fen, pvMoves);
  const parts = fen.split(' ');
  const startNum = parseInt(parts[5] ?? '1') || 1;
  const isBlack = parts[1] === 'b';
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < Math.min(sanMoves.length, 12); i++) {
    const plyFromStart = i;
    const isWhiteTurn = isBlack ? plyFromStart % 2 !== 0 : plyFromStart % 2 === 0;
    const moveNum = isBlack
      ? startNum + Math.floor((plyFromStart + 1) / 2)
      : startNum + Math.floor(plyFromStart / 2);
    const isHovered = hovered?.lineIndex === lineIndex && hovered?.plyIndex === i;

    if (i === 0 && isBlack && !isWhiteTurn) {
      nodes.push(
        <span key={`n-${i}`} className="text-[#999] mr-0.5">{startNum}...</span>
      );
    } else if (isWhiteTurn) {
      nodes.push(
        <span key={`n-${i}`} className="text-[#999] mr-0.5">{moveNum}.</span>
      );
    }
    nodes.push(
      <button
        type="button"
        key={`m-${i}`}
        className={`mr-0.5 px-1 py-0.5 rounded cursor-pointer transition-colors font-mono text-[12px] leading-tight ${
          isHovered
            ? 'bg-sky-500/35 text-white font-bold'
            : i === 0
              ? 'font-bold text-[#e8e8e8] hover:bg-white/10'
              : 'text-[#bababa] hover:bg-white/10 hover:text-white'
        }`}
        onMouseEnter={(e) => onHoverPly(lineIndex, i, e.clientX, e.clientY)}
        onMouseMove={(e) => onHoverPly(lineIndex, i, e.clientX, e.clientY)}
        onMouseLeave={() => onHoverPly(lineIndex, null, 0, 0)}
        onClick={(e) => {
          e.stopPropagation();
          onClickPly(lineIndex, i);
        }}
      >
        {sanMoves[i]}
      </button>
    );
  }
  return nodes;
}

interface SettingsPopupProps {
  engine: 'lite';
  onEngineChange: (v: 'lite') => void;
  numPv: number;
  onNumPvChange: (v: number) => void;
  threads: number;
  onThreadsChange: (v: number) => void;
  hash: number;
  onHashChange: (v: number) => void;
}

const SettingsPopup: React.FC<SettingsPopupProps> = ({
  engine, onEngineChange, numPv, onNumPvChange, threads, onThreadsChange, hash, onHashChange
}) => {
  const engines: { id: 'lite'; name: string }[] = [
    { id: 'lite', name: 'Stockfish 18 · lite-single' },
  ];

  return (
    <div className="absolute top-full right-0 mt-1 w-80 max-h-[min(70vh,520px)] overflow-y-auto bg-[#2b2926] border border-[rgba(255,255,255,0.05)] rounded-lg shadow-2xl z-50"
         onClick={e => e.stopPropagation()}>
      <div className="p-3 border-b border-[rgba(255,255,255,0.05)]">
        <label className="text-xs text-[#999] mb-1.5 block">Engine:</label>
        <div className="bg-[#1e1d1b] border border-[#444] rounded-md overflow-hidden">
          {engines.map((eng, i) => (
            <div
              key={i}
              onClick={() => onEngineChange(eng.id)}
              className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                eng.id === engine
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-[#bababa] hover:bg-[#333]'
              }`}
            >
              {eng.id === engine && <span className="mr-1">✓</span>}
              {eng.name}
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#bababa]">Çoklu varyantlar</span>
            <span className="text-xs text-[#bababa] font-mono">{numPv} / 5</span>
          </div>
          <input
            type="range" min={1} max={5} value={numPv}
            onChange={e => onNumPvChange(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#3b82f6]"
            style={{ background: `linear-gradient(to right, #3b82f6 ${(numPv - 1) / 4 * 100}%, #555 ${(numPv - 1) / 4 * 100}%)` }}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#bababa]">Çekirdek</span>
            <span className="text-xs text-[#bababa] font-mono">{threads} / 16</span>
          </div>
          <input
            type="range" min={1} max={16} value={threads}
            onChange={e => onThreadsChange(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#3b82f6]"
            style={{ background: `linear-gradient(to right, #3b82f6 ${(threads - 1) / 15 * 100}%, #555 ${(threads - 1) / 15 * 100}%)` }}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[#bababa]">Hafıza</span>
            <span className="text-xs text-[#bababa] font-mono">{hash}MB</span>
          </div>
          <input
            type="range" min={16} max={256} step={16} value={hash}
            onChange={e => onHashChange(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#3b82f6]"
            style={{ background: `linear-gradient(to right, #3b82f6 ${(hash - 16) / 240 * 100}%, #555 ${(hash - 16) / 240 * 100}%)` }}
          />
        </div>
      </div>
    </div>
  );
};

const BoardSettingsPopup: React.FC<{
  showEvalBar: boolean;
  onToggleEvalBar: () => void;
  showEngineHint: boolean;
  onToggleEngineHint: () => void;
  practiceMode: boolean;
  onTogglePracticeMode: () => void;
  onFlipBoard: () => void;
  onOpenBoardBuilder: () => void;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  onOpenMultiboard: () => void;
  onOpenShare: () => void;
  onDownloadPgn: () => void;
  canDownloadPgn?: boolean;
}> = ({
  showEvalBar,
  onToggleEvalBar,
  showEngineHint,
  onToggleEngineHint,
  practiceMode,
  onTogglePracticeMode,
  onFlipBoard,
  onOpenBoardBuilder,
  drawingEnabled,
  onToggleDrawing,
  onOpenMultiboard,
  onOpenShare,
  onDownloadPgn,
  canDownloadPgn = true,
}) => {
  return (
    <div
      className="absolute top-full right-0 mt-1 w-72 max-h-[min(70vh,540px)] overflow-y-auto glass-card rounded-2xl border border-white/10 shadow-2xl z-50 p-3 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-1">
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.22em] px-1">Tahta</p>
        <button type="button" onClick={onFlipBoard} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2">
          <FlipHorizontal className="w-4 h-4" /> Tahtayı Çevir (F)
        </button>
        <button type="button" onClick={onToggleEvalBar} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center justify-between">
          <span className="flex items-center gap-2"><BarChart2 className="w-4 h-4" /> Analiz Çubuğu</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${showEvalBar ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
            {showEvalBar ? 'Açık' : 'Kapalı'}
          </span>
        </button>
        <button type="button" onClick={onToggleEngineHint} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center justify-between">
          <span className="flex items-center gap-2"><Info className="w-4 h-4" /> Motor İpucu</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${showEngineHint ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
            {showEngineHint ? 'Açık' : 'Kapalı'}
          </span>
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.22em] px-1">Mod</p>
        <button type="button" onClick={onTogglePracticeMode} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center justify-between">
          <span>Pratik Modu</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${practiceMode ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
            {practiceMode ? 'Açık' : 'Kapalı'}
          </span>
        </button>
        <button type="button" onClick={onOpenBoardBuilder} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-indigo-300 hover:bg-indigo-500/10 transition-all">
          Tahta Tasarlayıcı
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.22em] px-1">Araçlar</p>
        <button type="button" onClick={onToggleDrawing} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center justify-between">
          <span className="flex items-center gap-2"><Highlighter className="w-4 h-4" /> Çizim</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${drawingEnabled ? 'text-indigo-200 bg-indigo-500/10 border-indigo-500/20' : 'text-slate-400 bg-white/5 border-white/10'}`}>
            {drawingEnabled ? 'Açık' : 'Kapalı'}
          </span>
        </button>
        <button type="button" onClick={onOpenMultiboard} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center gap-2">
          <Menu className="w-4 h-4" /> Çoklu Tahta
        </button>
        <button type="button" onClick={onOpenShare} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center gap-2">
          <Share2 className="w-4 h-4" /> Paylaş
        </button>
        {canDownloadPgn && (
          <button type="button" onClick={onDownloadPgn} className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/5 transition-all flex items-center gap-2">
            <Download className="w-4 h-4" /> PGN İndir
          </button>
        )}
      </div>
    </div>
  );
};

export const EngineAnalysis: React.FC<EngineAnalysisProps> = ({
  fen,
  enabled,
  onToggle,
  boardOrientation = 'white',
  onHoverPreviewFen,
  onHoverMove,
  onPvMoveClick,
  onTopMoveUpdate,
  onEvalScoreChange,
  boardSettings,
}) => {
  const [linePreview, setLinePreview] = useState<{ fen: string; x: number; y: number } | null>(null);
  const [hoveredPvMove, setHoveredPvMove] = useState<{ lineIndex: number; plyIndex: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [engine, setEngine] = useState<'lite'>('lite');
  const [numPv, setNumPv] = useState(3);
  const [threads, setThreads] = useState(1);
  const [hash, setHash] = useState(16);
  const settingsRef = useRef<HTMLDivElement>(null);
  const boardSettingsRef = useRef<HTMLDivElement>(null);
  const prevFenRef = useRef('');
  const [evalHistory, setEvalHistory] = useState<number[]>([]);

  const { ready, loading, error, pvLines, depth, analyseFen, stop } = useStockfish({
    numPv,
    enabled,
    threads,
    hash,
    engine,
  });

  // FEN değiştiğinde veya motor hazır olduğunda analiz başlat.
  // Paylaşılan motor servisi olduğu için unmount'ta stop çağırmıyoruz; FEN değişince
  // doğal olarak yeni analiz başlar ve eskisi durur.
  useEffect(() => {
    if (!enabled) return;
    prevFenRef.current = fen;
    analyseFen(fen);
  }, [fen, enabled, ready, analyseFen]);

  // Motor kapatıldığında durdur
  useEffect(() => {
    if (!enabled) {
      stop();
      setLinePreview(null);
      setHoveredPvMove(null);
      onHoverPreviewFen?.(null);
      onHoverMove?.(null);
    }
  }, [enabled, stop, onHoverPreviewFen, onHoverMove]);

  useEffect(() => () => { stop(); }, [stop]);

  const handlePvHover = (lineIndex: number, plyIndex: number | null, clientX: number, clientY: number) => {
    if (plyIndex === null) {
      setHoveredPvMove(null);
      setLinePreview(null);
      onHoverPreviewFen?.(null);
      onHoverMove?.(null);
      return;
    }
    const line = pvLines[lineIndex];
    if (!line?.pv?.length) return;
    setHoveredPvMove({ lineIndex, plyIndex });
    const previewFen = fenAfterUciPlies(fen, line.pv, plyIndex + 1);
    if (previewFen) {
      setLinePreview({ fen: previewFen, x: clientX, y: clientY });
      onHoverPreviewFen?.(previewFen);
    }
    const uci = line.pv[plyIndex];
    if (uci && uci.length >= 4) {
      onHoverMove?.({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    }
  };

  const handlePvClick = (lineIndex: number, plyIndex: number) => {
    const line = pvLines[lineIndex];
    if (!line?.pv?.length || plyIndex < 0 || plyIndex >= line.pv.length) return;
    setLinePreview(null);
    setHoveredPvMove(null);
    onHoverPreviewFen?.(null);
    onHoverMove?.(null);
    onPvMoveClick?.({ uciMoves: line.pv.slice(0, plyIndex + 1), plyIndex });
  };

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  useEffect(() => {
    if (!showBoardSettings) return;
    const handler = (e: MouseEvent) => {
      if (boardSettingsRef.current && !boardSettingsRef.current.contains(e.target as Node)) {
        setShowBoardSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBoardSettings]);

  const turn = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
  const mainLine = pvLines[0] ?? null;
  const mainScore = mainLine ? formatScore(mainLine, turn) : '0.0';

  const statusText = error
    ? error
    : loading
    ? 'Motor başlatılıyor...'
    : ready
    ? 'analiz ediliyor...'
    : 'bekleniyor...';
  
  const hasFreshLines = !!mainLine && depth > 0;

  useEffect(() => {
    if (!ready || !hasFreshLines || !mainLine?.pv || mainLine.pv.length === 0) {
      onTopMoveUpdate?.(null);
      return;
    }
    const m = mainLine.pv[0];
    if (typeof m !== 'string' || m.length < 4) {
      onTopMoveUpdate?.(null);
      return;
    }
    onTopMoveUpdate?.({ from: m.slice(0, 2), to: m.slice(2, 4) });
  }, [ready, fen, mainLine, mainLine?.pv?.[0], hasFreshLines, onTopMoveUpdate]);

  useEffect(() => {
    if (!enabled) {
      setEvalHistory([]);
      onEvalScoreChange?.(0);
      return;
    }
    if (!ready || !hasFreshLines || !mainLine) return;
    const score = pvLineToEvalBarPawns(mainLine, turn);
    setEvalHistory((prev) => {
      const next = [...prev, score];
      return next.length > 48 ? next.slice(-48) : next;
    });
    onEvalScoreChange?.(score);
  }, [enabled, ready, fen, mainLine, turn, hasFreshLines, onEvalScoreChange]);

  return (
    <div className="shrink-0 border-b border-white/5 bg-[#0f172a]">
      <div className="h-[3px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />

      {/* Header — sabit yükseklik; sparkline alanı her zaman rezerve */}
      <div className="flex items-center gap-2 px-2.5 h-[52px] bg-[#0f172a]">
        {/* Toggle */}
        <button type="button" onClick={onToggle} className="shrink-0" title={enabled ? 'Motor açık' : 'Motor kapalı'}>
          <div className={`w-9 h-5 rounded-full relative transition-all duration-300 ${
            enabled
              ? (ready ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : error ? 'bg-rose-600' : 'bg-amber-600')
              : 'bg-white/10'
          }`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${
              enabled ? 'right-0.5' : 'left-0.5'
            }`}>
              {enabled && ready ? (
                <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-indigo-600">
                  <path fill="currentColor" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              ) : enabled && loading ? (
                <div className="w-2 h-2 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              ) : null}
            </div>
          </div>
        </button>

        <span className="text-xl font-bold text-white tracking-tight tabular-nums min-w-[3.25rem] text-right">
          {enabled ? mainScore : '—'}
        </span>

        <div className="flex flex-col ml-1">
          <span className="text-[11px] text-indigo-400 font-extrabold uppercase tracking-tighter leading-tight">
            SF 18 · LITE <span className="text-white opacity-40">NNUE</span>
          </span>
          <div className="flex items-center gap-1">
            <Plus className="w-2.5 h-2.5 text-[#3b82f6]" />
            <span className="text-[11px] text-slate-500 font-bold font-mono leading-tight">
              {enabled ? `DERİNLİK ${depth}` : 'MOTOR KAPALI'}
            </span>
            {enabled && depth > 0 && (
              <span className="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-extrabold leading-none uppercase tracking-tighter shadow-sm">
                CLOUD
              </span>
            )}
          </div>
        </div>

        <div className="w-[108px] h-[22px] shrink-0 flex items-center justify-end gap-1">
          {enabled && evalHistory.length >= 2 ? (
            <>
              <BarChart2 className="w-3 h-3 text-indigo-400/70 shrink-0" />
              <EvalSparkline scores={evalHistory} />
            </>
          ) : null}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 relative" ref={boardSettingsRef}>
          {boardSettings && (
            <button
              type="button"
              onClick={() => { setShowBoardSettings(v => !v); setShowSettings(false); }}
              className={`p-1 transition-colors rounded ${showBoardSettings ? 'text-white bg-[#555]' : 'text-[#999] hover:text-white'}`}
              title="Ayarlar"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          {boardSettings && showBoardSettings && (
            <BoardSettingsPopup
              showEvalBar={boardSettings.showEvalBar}
              onToggleEvalBar={() => { boardSettings.onToggleEvalBar(); }}
              showEngineHint={boardSettings.showEngineHint}
              onToggleEngineHint={() => { boardSettings.onToggleEngineHint(); }}
              practiceMode={boardSettings.practiceMode}
              onTogglePracticeMode={() => { boardSettings.onTogglePracticeMode(); }}
              onFlipBoard={() => { boardSettings.onFlipBoard(); setShowBoardSettings(false); }}
              onOpenBoardBuilder={() => { boardSettings.onOpenBoardBuilder(); setShowBoardSettings(false); }}
              drawingEnabled={boardSettings.drawingEnabled}
              onToggleDrawing={() => { boardSettings.onToggleDrawing(); }}
              onOpenMultiboard={() => { boardSettings.onOpenMultiboard(); setShowBoardSettings(false); }}
              onOpenShare={() => { boardSettings.onOpenShare(); setShowBoardSettings(false); }}
              onDownloadPgn={() => { boardSettings.onDownloadPgn(); setShowBoardSettings(false); }}
              canDownloadPgn={boardSettings.canDownloadPgn ?? true}
            />
          )}
        </div>

        <div className="flex items-center gap-0.5 relative" ref={settingsRef}>
          <button type="button" className="p-1 text-[#999] hover:text-white transition-colors rounded">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setShowSettings(v => !v); setShowBoardSettings(false); }}
            className={`p-1 transition-colors rounded ${showSettings ? 'text-white bg-[#555]' : 'text-[#999] hover:text-white'}`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          {showSettings && (
            <SettingsPopup
              engine={engine}
              onEngineChange={setEngine}
              numPv={numPv}
              onNumPvChange={setNumPv}
              threads={threads}
              onThreadsChange={setThreads}
              hash={hash}
              onHashChange={setHash}
            />
          )}
        </div>
      </div>

      {/* PV Lines — sabit yükseklik; içerik kayar, alttaki hamle listesi oynamaz */}
      {enabled && (
        <div
          className="divide-y divide-[rgba(255,255,255,0.05)]/60 overflow-y-auto overscroll-contain custom-scrollbar"
          style={{ maxHeight: Math.max(1, numPv) * 32 }}
        >
          {Array.from({ length: numPv }).map((_, i) => {
            const line = pvLines[i];
            if (!line) {
              return (
                <div key={i} className="flex items-center px-2.5 h-8">
                  <div className="w-12 shrink-0">
                    <span className="text-[11px] text-[#555] font-mono">···</span>
                  </div>
                  <span className="text-[11px] text-[#555] italic truncate">{statusText}</span>
                </div>
              );
            }
            return (
              <div
                key={i}
                className="flex items-center px-2.5 h-8 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="w-12 shrink-0">
                  <span className={`text-[12px] font-bold font-mono tabular-nums ${scoreColorClass(line, turn)}`}>
                    {formatScore(line, turn)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <span className="text-[12px] leading-8 whitespace-nowrap font-mono inline-flex items-center max-w-full overflow-hidden text-ellipsis">
                    <InteractiveMoveList
                      fen={fen}
                      pvMoves={line.pv}
                      lineIndex={i}
                      hovered={hoveredPvMove}
                      onHoverPly={handlePvHover}
                      onClickPly={handlePvClick}
                    />
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#666] group-hover:text-[#999] shrink-0 ml-1 transition-colors opacity-60" />
              </div>
            );
          })}
        </div>
      )}

      {linePreview && typeof document !== 'undefined' && createPortal(
        <div
          className="pointer-events-none fixed z-[200] rounded-lg border border-white/15 bg-[#1e293b] shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-white/10 overflow-hidden"
          style={{
            left: Math.min(
              linePreview.x + ENGINE_LINE_PREVIEW_OFFSET,
              window.innerWidth - ENGINE_LINE_PREVIEW_SIZE - 8,
            ),
            top: Math.min(
              linePreview.y + ENGINE_LINE_PREVIEW_OFFSET,
              window.innerHeight - ENGINE_LINE_PREVIEW_SIZE - 8,
            ),
            width: ENGINE_LINE_PREVIEW_SIZE,
          }}
        >
          <ChessBoardFrame boardOrientation={boardOrientation} hideCoordinates className="pointer-events-none">
            <Chessboard
              options={{
                id: 'engine-line-preview-hover',
                position: linePreview.fen,
                boardOrientation,
                arePiecesDraggable: false,
                allowDragging: false,
                darkSquareStyle: { backgroundColor: '#5d768e' },
                lightSquareStyle: { backgroundColor: '#c1c9d2' },
                ...CHESSBOARD_NO_NOTATION,
              }}
            />
          </ChessBoardFrame>
        </div>,
        document.body,
      )}
    </div>
  );
};
