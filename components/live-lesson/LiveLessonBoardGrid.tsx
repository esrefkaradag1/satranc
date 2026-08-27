import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  ChevronLeft,
  ChevronRight,
  ChevronFirst,
  ChevronLast,
  Eye,
  RefreshCw,
  Search,
  LayoutGrid,
  Grid2X2,
  Grid3X3,
  Download,
  Plus,
  Sparkles,
} from 'lucide-react';
import type { Student } from '../../types';
import type { LiveStudentBoardSnapshot } from '../LiveLesson';
import { CHESSBOARD_NO_NOTATION } from '../../lib/chessBoardUi';
import { applyMove, makeBuilderGame } from '../../lib/studyUtils';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const BOARD_THEMES = [
  { dark: '#4a6fa5', light: '#c8d4e8' },
  { dark: '#8b6914', light: '#f0d9b5' },
  { dark: '#769656', light: '#eeeed2' },
  { dark: '#6b5b7a', light: '#d4c4e0' },
  { dark: '#5d768e', light: '#c1c9d2' },
  { dark: '#779952', light: '#edeed1' },
] as const;

export type GridLayoutMode = 1 | 4 | 9;

function normalizeStudentId(id: string | null | undefined): string {
  return String(id ?? '').trim();
}

function fenAtPly(baseFen: string, moves: string[], ply: number | null): string {
  try {
    const game = makeBuilderGame(baseFen.trim() || START_FEN);
    const total = moves.length;
    const target = ply ?? total;
    for (let i = 0; i < Math.min(target, total); i++) {
      const m = moves[i];
      if (!m) break;
      if (!applyMove(game, m)) break;
    }
    return game.fen();
  } catch {
    return baseFen.trim() || START_FEN;
  }
}

function studentPlatformLabel(student: Student, snap?: LiveStudentBoardSnapshot): string {
  if (snap?.source === 'lichess') return 'Lichess.org';
  if (snap?.source === 'chesscom') return 'Chess.com';
  if (student.chessComUsername?.trim()) return 'Chess.com';
  if (student.lichessUsername?.trim()) return 'Lichess.org';
  return 'SatrancEdu';
}

function snapshotLinkLabel(snap?: LiveStudentBoardSnapshot): string | null {
  if (!snap?.gameUrl?.trim()) return null;
  const url = snap.gameUrl.toLowerCase();
  if (url.includes('/puzzles/') || url.includes('/training/') || snap.label?.toLowerCase().includes('bulmaca')) {
    return 'bulmaca';
  }
  return 'canlı';
}

function studentRating(student: Student): string {
  if (student.elo > 0) return String(student.elo);
  if (student.ukd > 0) return String(student.ukd);
  return '—';
}

type Props = {
  students: Student[];
  studentBoards: Record<string, LiveStudentBoardSnapshot>;
  coachBoardFen: string;
  boardsPerPage: GridLayoutMode;
  page: number;
  onPageChange: (page: number) => void;
  onBoardsPerPageChange: (n: GridLayoutMode) => void;
  focusedStudentId: string | null;
  onFocusStudent: (studentId: string) => void;
  onFollowStudent: (studentId: string) => void;
  autoFollow: boolean;
  onAutoFollowChange: (v: boolean) => void;
  autoPageTransition: boolean;
  onAutoPageTransitionChange: (v: boolean) => void;
  onRefresh: () => void;
  onPullAllStudents: () => void;
  onPullStudent: (studentId: string) => void;
  onPullAllStudentPuzzles: () => void;
  onPullStudentPuzzle: (studentId: string) => void;
  pullLoading?: boolean;
  pullingStudentIds?: Set<string>;
  pullingPuzzleStudentIds?: Set<string>;
  autoPull: boolean;
  onAutoPullChange: (v: boolean) => void;
  onOpenAllAnalysis: () => void;
  onAddBoard: () => void;
  onlineStudentIds?: Set<string>;
};

function GridToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-indigo-500' : 'bg-slate-600'}`}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function LiveLessonBoardGrid({
  students,
  studentBoards,
  coachBoardFen,
  boardsPerPage,
  page,
  onPageChange,
  onBoardsPerPageChange,
  focusedStudentId,
  onFocusStudent,
  onFollowStudent,
  autoFollow,
  onAutoFollowChange,
  autoPageTransition,
  onAutoPageTransitionChange,
  onRefresh,
  onPullAllStudents,
  onPullStudent,
  onPullAllStudentPuzzles,
  onPullStudentPuzzle,
  pullLoading = false,
  pullingStudentIds,
  pullingPuzzleStudentIds,
  autoPull,
  onAutoPullChange,
  onOpenAllAnalysis,
  onAddBoard,
  onlineStudentIds,
}: Props) {
  const [replayByStudent, setReplayByStudent] = useState<Record<string, number | null>>({});

  const gridStudents = useMemo(
    () => students.filter((s) => normalizeStudentId(s.id).length > 0),
    [students],
  );

  const totalPages = Math.max(1, Math.ceil(gridStudents.length / boardsPerPage));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageStudents = gridStudents.slice(
    safePage * boardsPerPage,
    safePage * boardsPerPage + boardsPerPage,
  );

  const gridCols =
    boardsPerPage === 1 ? 'grid-cols-1' : boardsPerPage === 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  useEffect(() => {
    if (!autoPageTransition || totalPages <= 1) return;
    const id = window.setInterval(() => {
      onPageChange((safePage + 1) % totalPages);
    }, 12000);
    return () => window.clearInterval(id);
  }, [autoPageTransition, totalPages, safePage, onPageChange]);

  const setStudentReplay = useCallback((sid: string, ply: number | null) => {
    setReplayByStudent((prev) => ({ ...prev, [sid]: ply }));
  }, []);

  if (gridStudents.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 w-full">
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-slate-500 max-w-md leading-relaxed">
            Henüz derse alınmış öğrenci yok. Katılımcılar sekmesinden öğrencileri derse alın veya{' '}
            <button type="button" onClick={onAddBoard} className="text-indigo-400 hover:text-indigo-300 font-semibold">
              tahta ekleyin
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 w-full">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-0.5 py-1 border-b border-white/[0.06] pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-slate-800/50 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tahtaları yenile
          </button>
          <button
            type="button"
            onClick={onPullAllStudents}
            disabled={pullLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/20 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-600/30 hover:text-white disabled:opacity-40"
          >
            <Download className={`w-3.5 h-3.5 ${pullLoading ? 'animate-pulse' : ''}`} />
            Oyunu çek
          </button>
          <button
            type="button"
            onClick={onPullAllStudentPuzzles}
            disabled={pullLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-600/20 text-[10px] font-semibold text-violet-200 hover:bg-violet-600/30 hover:text-white disabled:opacity-40"
          >
            <Sparkles className={`w-3.5 h-3.5 ${pullLoading ? 'animate-pulse' : ''}`} />
            Bulmaca çek
          </button>
          <button
            type="button"
            onClick={onOpenAllAnalysis}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-slate-800/50 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Search className="w-3.5 h-3.5" />
            Tüm analizi aç
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-500 hidden sm:inline">Tahta düzeni</span>
            <div className="flex items-center rounded-lg border border-white/10 bg-slate-900/60 p-0.5">
              {([
                [1, LayoutGrid, '1 tahta'],
                [4, Grid2X2, '2×2'],
                [9, Grid3X3, '3×3'],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  onClick={() => onBoardsPerPageChange(mode)}
                  className={`p-1.5 rounded-md transition-colors ${
                    boardsPerPage === mode
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer" title="Lichess/Chess.com oyun ve bulmacaları 3 sn'de bir çeker">
            <span className="text-[10px] font-semibold text-slate-500">Otomatik çek</span>
            <GridToggle on={autoPull} onToggle={() => onAutoPullChange(!autoPull)} />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] font-semibold text-slate-500">Otomatik takip</span>
            <GridToggle on={autoFollow} onToggle={() => onAutoFollowChange(!autoFollow)} />
          </label>
        </div>
      </div>

      {/* Grid */}
      <div className={`grid ${gridCols} gap-2 sm:gap-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar p-0.5`}>
        {pageStudents.map((student, idx) => {
          const sid = normalizeStudentId(student.id);
          const snap = studentBoards[sid];
          const baseFen = snap?.baseFen?.trim() || START_FEN;
          const moves = snap?.moves ?? [];
          const replayPly = replayByStudent[sid] ?? null;
          const displayPly = replayPly ?? moves.length;
          const fen = moves.length > 0 ? fenAtPly(baseFen, moves, replayPly) : snap?.fen?.trim() || coachBoardFen || START_FEN;
          const isFocused = focusedStudentId === sid;
          const slot = safePage * boardsPerPage + idx + 1;
          const theme = BOARD_THEMES[idx % BOARD_THEMES.length];
          const isOnline = onlineStudentIds?.has(sid) ?? true;
          const statusBar = isOnline ? 'bg-emerald-500' : 'bg-amber-500';
          const linkLabel = snapshotLinkLabel(snap);
          const boardOrientation = snap?.boardOrientation ?? 'white';

          return (
            <div
              key={student.id}
              className={`rounded-xl border overflow-hidden flex min-h-[240px] sm:min-h-[260px] ${
                isFocused
                  ? 'border-indigo-500/45 ring-1 ring-indigo-500/25 bg-[#111827]/90'
                  : 'border-white/[0.08] bg-[#111827]/70'
              }`}
            >
              <div className={`w-1 shrink-0 ${statusBar}`} aria-hidden />

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-white/[0.06] bg-slate-900/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 tabular-nums w-4">{slot}</span>
                    <div className="w-7 h-7 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-white truncate leading-tight">{student.name}</p>
                      <p className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                        <span className="font-semibold text-slate-400 tabular-nums">{studentRating(student)}</span>
                        <span className="text-slate-600">·</span>
                        <span>{studentPlatformLabel(student, snap)}</span>
                        {linkLabel && snap?.gameUrl ? (
                          <a
                            href={snap.gameUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 truncate max-w-[6rem]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {linkLabel}
                          </a>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {moves.length > 0 ? `${Math.min(displayPly, moves.length)}:${String(moves.length).padStart(2, '0')}` : '--:--'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onFocusStudent(sid);
                    if (autoFollow) onFollowStudent(sid);
                  }}
                  className="flex-1 min-h-[120px] p-2 flex items-center justify-center bg-slate-950/30"
                >
                  <div className="w-full max-w-[min(100%,240px)] aspect-square rounded-md overflow-hidden border border-white/10 shadow-lg pointer-events-none">
                    <Chessboard
                      options={{
                        id: `live-grid-${sid}`,
                        position: fen,
                        allowDragging: false,
                        showAnimations: false,
                        animationDurationInMs: 0,
                        showNotation: CHESSBOARD_NO_NOTATION.showNotation,
                        boardOrientation,
                        darkSquareStyle: { backgroundColor: theme.dark },
                        lightSquareStyle: { backgroundColor: theme.light },
                      }}
                    />
                  </div>
                </button>

                <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-white/[0.06] bg-slate-900/60">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={() => setStudentReplay(sid, 0)}
                      title="Başa dön"
                    >
                      <ChevronFirst className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={() => setStudentReplay(sid, Math.max(0, displayPly - 1))}
                      title="Önceki"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 px-1 min-w-[3rem] text-center">
                      {moves.length > 0 ? `${displayPly} / ${moves.length}` : '0 / 0'}
                    </span>
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={() => setStudentReplay(sid, Math.min(moves.length, displayPly + 1))}
                      title="Sonraki"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                      onClick={() => setStudentReplay(sid, null)}
                      title="Son konum"
                    >
                      <ChevronLast className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pullingStudentIds?.has(sid)}
                      onClick={() => onPullStudent(sid)}
                      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-[10px] font-semibold disabled:opacity-40"
                      title="Platformdan oyunu çek"
                    >
                      <Download className={`w-3 h-3 ${pullingStudentIds?.has(sid) ? 'animate-pulse' : ''}`} />
                    </button>
                    <button
                      type="button"
                      disabled={pullingPuzzleStudentIds?.has(sid)}
                      onClick={() => onPullStudentPuzzle(sid)}
                      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-violet-500/20 text-violet-300 hover:text-violet-100 hover:bg-violet-500/10 text-[10px] font-semibold disabled:opacity-40"
                      title="Son Lichess bulmacasını çek"
                    >
                      <Sparkles className={`w-3 h-3 ${pullingPuzzleStudentIds?.has(sid) ? 'animate-pulse' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFocusStudent(sid);
                        onFollowStudent(sid);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold"
                    >
                      <Eye className="w-3 h-3" />
                      Takip et
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {pageStudents.length < boardsPerPage
          ? Array.from({ length: boardsPerPage - pageStudents.length }).map((_, i) => (
              <div
                key={`slot-${i}`}
                className={`hidden ${boardsPerPage > 1 ? 'sm:flex' : 'flex'} rounded-xl border border-dashed border-white/[0.06] bg-slate-900/20 min-h-[240px] items-center justify-center`}
              >
                <p className="text-[11px] text-slate-600">Boş slot</p>
              </div>
            ))
          : null}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-semibold">Sayfa</span>
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => onPageChange(safePage - 1)}
            className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPageChange(i)}
                className={`w-7 h-7 rounded-lg text-[11px] font-bold tabular-nums ${
                  i === safePage ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-white/10'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => onPageChange(safePage + 1)}
            className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-slate-600 tabular-nums ml-1">
            {safePage + 1} / {totalPages}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="whitespace-nowrap">Her sayfada</span>
            <select
              value={boardsPerPage}
              onChange={(e) => onBoardsPerPageChange(Number(e.target.value) as GridLayoutMode)}
              className="rounded-lg border border-white/10 bg-slate-900 text-slate-200 text-[10px] px-2 py-1 outline-none"
            >
              <option value={1}>1 tahta</option>
              <option value={4}>4 tahta</option>
              <option value={9}>9 tahta</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="whitespace-nowrap">Otomatik sayfa geçişi</span>
            <GridToggle
              on={autoPageTransition}
              onToggle={() => onAutoPageTransitionChange(!autoPageTransition)}
            />
          </label>
          <button
            type="button"
            onClick={onAddBoard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl premium-gradient text-white text-[11px] font-bold shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            Tahta ekle
          </button>
        </div>
      </div>
    </div>
  );
}
