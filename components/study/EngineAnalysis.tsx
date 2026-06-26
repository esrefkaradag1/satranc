import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Settings2, ChevronDown, Plus, FlipHorizontal, BarChart2, Info, Menu, Share2, Download, Highlighter, Hand } from 'lucide-react';
import { Chess } from 'chess.js';
import { useStockfish, type PvLine } from '../../hooks/useStockfish';
import { CHESSBOARD_NO_NOTATION, pvLineToEvalBarPawns } from '../../lib/chessBoardUi';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import type { StudentPlaysColor } from '../../lib/studyTypes';
import { studentPlaysColorLabel } from '../../lib/studyUtils';

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
    studentPlaysColor?: StudentPlaysColor;
    onStudentPlaysColorChange?: (value: StudentPlaysColor) => void;
  };
  /** Tahta tercihleri paneli (StudyBoardSettingsPanel) */
  onOpenBoardPrefs?: () => void;
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
    if (m === 0) return '#';
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

/** Boş PV satırı için durum metni — mat / zorunlu hatta "analiz ediliyor" takılmasın */
function emptyPvLineLabel(
  lineIndex: number,
  pvLines: (PvLine | null)[],
  depth: number,
  ready: boolean,
  loading: boolean,
  error: string | null,
): string {
  if (error) return error;
  if (loading) return 'Motor başlatılıyor...';
  if (!ready) return 'bekleniyor...';

  const main = pvLines[0];
  if (!main) return 'analiz ediliyor...';

  if (lineIndex === 0) return 'analiz ediliyor...';

  const mainDepth = main.depth || depth;
  if (main.mate !== null && mainDepth >= 4) {
    return 'zorunlu mat hattı';
  }
  if (mainDepth >= 10 || depth >= 10) {
    return 'alternatif yok';
  }

  return 'analiz ediliyor...';
}

function anchorPopupStyle(anchor: DOMRect, width = 320): React.CSSProperties {
  const w = Math.min(width, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.right - w, window.innerWidth - w - 8));
  return {
    position: 'fixed',
    top: anchor.bottom + 6,
    left,
    width: w,
    zIndex: 250,
  };
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
    <div
      className="w-[min(20rem,calc(100vw-1rem))] max-h-[min(70vh,520px)] overflow-y-auto bg-[#2b2926] border border-[rgba(255,255,255,0.05)] rounded-lg shadow-2xl"
      onClick={e => e.stopPropagation()}
    >
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
  studentPlaysColor?: StudentPlaysColor;
  onStudentPlaysColorChange?: (value: StudentPlaysColor) => void;
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
  studentPlaysColor,
  onStudentPlaysColorChange,
}) => {
  const studentMoveOptions: StudentPlaysColor[] = ['both', 'white', 'black', 'none'];
  return (
    <div
      className="w-[min(18rem,calc(100vw-1rem))] max-h-[min(70vh,540px)] overflow-y-auto glass-card rounded-2xl border border-white/10 shadow-2xl p-3 space-y-3"
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

      {onStudentPlaysColorChange && (
        <div className="space-y-1">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.22em] px-1">Öğrenci</p>
          <div className="px-1 pb-1">
            <p className="text-[10px] text-slate-500 font-bold mb-2 flex items-center gap-1.5">
              <Hand className="w-3.5 h-3.5" />
              Taş oynatma hakkı
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {studentMoveOptions.map((opt) => {
                const active = (studentPlaysColor ?? 'both') === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onStudentPlaysColorChange(opt)}
                    className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border ${
                      active
                        ? 'text-indigo-100 bg-indigo-500/20 border-indigo-400/40'
                        : 'text-slate-400 bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {studentPlaysColorLabel(opt)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
  onOpenBoardPrefs,
}) => {
  const [linePreview, setLinePreview] = useState<{ fen: string; x: number; y: number } | null>(null);
  const [hoveredPvMove, setHoveredPvMove] = useState<{ lineIndex: number; plyIndex: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [engineSettingsAnchor, setEngineSettingsAnchor] = useState<DOMRect | null>(null);
  const [boardSettingsAnchor, setBoardSettingsAnchor] = useState<DOMRect | null>(null);
  const [engine, setEngine] = useState<'lite'>('lite');
  const [numPv, setNumPv] = useState(3);
  const [threads, setThreads] = useState(1);
  const [hash, setHash] = useState(16);
  const engineSettingsBtnRef = useRef<HTMLButtonElement>(null);
  const boardSettingsBtnRef = useRef<HTMLButtonElement>(null);
  const prevFenRef = useRef('');
  const readyOnceRef = useRef(false);
  const [evalHistory, setEvalHistory] = useState<number[]>([]);

  const { ready, loading, error, pvLines, depth, analyseFen } = useStockfish({
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
    const fenChanged = fen !== prevFenRef.current;
    const becameReady = ready && !readyOnceRef.current;
    if (!fenChanged && !becameReady) return;
    prevFenRef.current = fen;
    if (ready) readyOnceRef.current = true;
    analyseFen(fen);
  }, [fen, enabled, ready, analyseFen]);

  // Motor kapatıldığında yalnızca hover/önizlemeyi temizle (paylaşılan worker abonelikle yönetilir)
  useEffect(() => {
    if (!enabled) {
      setLinePreview(null);
      setHoveredPvMove(null);
      onHoverPreviewFen?.(null);
      onHoverMove?.(null);
    }
  }, [enabled, onHoverPreviewFen, onHoverMove]);

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
    if (!showSettings && !showBoardSettings) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (engineSettingsBtnRef.current?.contains(t)) return;
      if (boardSettingsBtnRef.current?.contains(t)) return;
      setShowSettings(false);
      setShowBoardSettings(false);
      setEngineSettingsAnchor(null);
      setBoardSettingsAnchor(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings, showBoardSettings]);

  const openEngineSettings = () => {
    setShowBoardSettings(false);
    setBoardSettingsAnchor(null);
    setShowSettings((v) => {
      const next = !v;
      setEngineSettingsAnchor(next ? (engineSettingsBtnRef.current?.getBoundingClientRect() ?? null) : null);
      return next;
    });
  };

  const openLegacyBoardSettings = () => {
    setShowSettings(false);
    setEngineSettingsAnchor(null);
    setShowBoardSettings((v) => {
      const next = !v;
      setBoardSettingsAnchor(next ? (boardSettingsBtnRef.current?.getBoundingClientRect() ?? null) : null);
      return next;
    });
  };

  const turn = (fen.split(' ')[1] ?? 'w') as 'w' | 'b';
  const mainLine = pvLines[0] ?? null;
  const mainScore = mainLine ? formatScore(mainLine, turn) : '0.0';

  const hasFreshLines = !!mainLine && depth > 0;
  const filledPvCount = pvLines.filter((l): l is PvLine => l !== null).length;

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

      {/* Header — ayar butonları dar panelde her zaman görünür */}
      <div className="flex items-center gap-1.5 px-2 py-2 min-h-[52px] bg-[#0f172a]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
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

          <span className="text-lg font-bold text-white tracking-tight tabular-nums shrink-0">
            {enabled ? mainScore : '—'}
          </span>

          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-tighter leading-tight truncate">
              SF 18 · LITE <span className="text-white opacity-40">NNUE</span>
            </span>
            <div className="flex items-center gap-1 min-w-0">
              <Plus className="w-2.5 h-2.5 text-[#3b82f6] shrink-0" />
              <span className="text-[10px] text-slate-500 font-bold font-mono leading-tight truncate">
                {enabled ? `D ${depth}` : 'KAPALI'}
              </span>
              {enabled && depth > 0 && (
                <span className="text-[8px] bg-indigo-500 text-white px-1 py-0.5 rounded font-extrabold leading-none shrink-0">
                  {filledPvCount}/{numPv}
                </span>
              )}
            </div>
          </div>

          {enabled && evalHistory.length >= 2 ? (
            <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[72px] overflow-hidden">
              <BarChart2 className="w-3 h-3 text-indigo-400/70 shrink-0" />
              <EvalSparkline scores={evalHistory} />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {onOpenBoardPrefs && (
            <button
              type="button"
              onClick={onOpenBoardPrefs}
              className="p-1.5 text-[#999] hover:text-white hover:bg-white/10 transition-colors rounded"
              title="Tahta ayarları (h)"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          {boardSettings && (
            <button
              ref={boardSettingsBtnRef}
              type="button"
              onClick={openLegacyBoardSettings}
              className={`p-1.5 transition-colors rounded ${showBoardSettings ? 'text-white bg-[#555]' : 'text-[#999] hover:text-white hover:bg-white/10'}`}
              title="Tahta araçları"
            >
              <Highlighter className="w-4 h-4" />
            </button>
          )}
          <button
            ref={engineSettingsBtnRef}
            type="button"
            onClick={openEngineSettings}
            className={`p-1.5 transition-colors rounded ${showSettings ? 'text-white bg-indigo-600/80' : 'text-[#999] hover:text-white hover:bg-white/10'}`}
            title="Motor ayarları"
            aria-label="Motor ayarları"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showSettings && engineSettingsAnchor && typeof document !== 'undefined' && createPortal(
        <div style={anchorPopupStyle(engineSettingsAnchor, 320)}>
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
        </div>,
        document.body,
      )}

      {showBoardSettings && boardSettingsAnchor && boardSettings && typeof document !== 'undefined' && createPortal(
        <div style={anchorPopupStyle(boardSettingsAnchor, 288)}>
          <BoardSettingsPopup
            showEvalBar={boardSettings.showEvalBar}
            onToggleEvalBar={() => { boardSettings.onToggleEvalBar(); }}
            showEngineHint={boardSettings.showEngineHint}
            onToggleEngineHint={() => { boardSettings.onToggleEngineHint(); }}
            practiceMode={boardSettings.practiceMode}
            onTogglePracticeMode={() => { boardSettings.onTogglePracticeMode(); }}
            onFlipBoard={() => { boardSettings.onFlipBoard(); setShowBoardSettings(false); setBoardSettingsAnchor(null); }}
            onOpenBoardBuilder={() => { boardSettings.onOpenBoardBuilder(); setShowBoardSettings(false); setBoardSettingsAnchor(null); }}
            drawingEnabled={boardSettings.drawingEnabled}
            onToggleDrawing={() => { boardSettings.onToggleDrawing(); }}
            onOpenMultiboard={() => { boardSettings.onOpenMultiboard(); setShowBoardSettings(false); setBoardSettingsAnchor(null); }}
            onOpenShare={() => { boardSettings.onOpenShare(); setShowBoardSettings(false); setBoardSettingsAnchor(null); }}
            onDownloadPgn={() => { boardSettings.onDownloadPgn(); setShowBoardSettings(false); setBoardSettingsAnchor(null); }}
            canDownloadPgn={boardSettings.canDownloadPgn ?? true}
            studentPlaysColor={boardSettings.studentPlaysColor}
            onStudentPlaysColorChange={boardSettings.onStudentPlaysColorChange}
          />
        </div>,
        document.body,
      )}

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
                  <span className="text-[11px] text-[#555] italic truncate">
                    {emptyPvLineLabel(i, pvLines, depth, ready, loading, error)}
                  </span>
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
                    {line.pv.length > 0 ? (
                      <InteractiveMoveList
                        fen={fen}
                        pvMoves={line.pv}
                        lineIndex={i}
                        hovered={hoveredPvMove}
                        onHoverPly={handlePvHover}
                        onClickPly={handlePvClick}
                      />
                    ) : (
                      <span className="text-[#999] italic text-[11px]">
                        {line.mate !== null ? 'Oyun bitti' : 'Hamle yok'}
                      </span>
                    )}
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
