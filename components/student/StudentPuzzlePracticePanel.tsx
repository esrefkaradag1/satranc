import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  CheckCircle2,
  Play,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Puzzle, Student } from '../../types';
import StudentPuzzlePlayModal, { type HomeworkAttemptRecord } from '../StudentPuzzlePlayModal';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import { puzzlePlayPreviewState } from '../../lib/puzzlePlayUtils';
import {
  PRACTICE_HOMEWORK_ID,
  applyPracticeResult,
  countPuzzlesInBand,
  estimatePuzzleRating,
  listPuzzlesForPractice,
  loadPracticeState,
  pickNextPracticePuzzle,
  practiceLevelProgress,
  savePracticeState,
  type StudentPuzzlePracticeState,
} from '../../lib/studentPuzzlePractice';

type Props = {
  student: Student;
  pool: Puzzle[];
  viewAs?: 'student' | 'parent';
};

const BOARD_PREVIEW_OPTS = (fen: string, orientation: 'white' | 'black') => ({
  position: fen,
  boardOrientation: orientation,
  darkSquareStyle: { backgroundColor: '#779952' },
  lightSquareStyle: { backgroundColor: '#edeed1' },
  allowDragging: false,
  showNotation: false,
});

export function StudentPuzzlePracticePanel({ student, pool, viewAs = 'student' }: Props) {
  const studentId = student.id;
  const [practice, setPractice] = useState<StudentPuzzlePracticeState>(() =>
    loadPracticeState(studentId),
  );
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{
    puzzle: Puzzle;
    openKey: string;
  } | null>(null);

  useEffect(() => {
    setPractice(loadPracticeState(studentId));
    setLastDelta(null);
    setLastPoints(null);
  }, [studentId]);

  const level = useMemo(() => practiceLevelProgress(practice.rating), [practice.rating]);
  const bandCount = useMemo(() => countPuzzlesInBand(pool, level.band), [pool, level.band]);
  const visiblePuzzles = useMemo(
    () => listPuzzlesForPractice(pool, practice.rating, 60),
    [pool, practice.rating],
  );

  const accuracy = useMemo(() => {
    const total = practice.solved + practice.failed;
    if (total <= 0) return null;
    return Math.round((practice.solved / total) * 100);
  }, [practice.solved, practice.failed]);

  const recentHistory = practice.history.slice(0, 6);
  const readOnly = viewAs === 'parent';
  const solvedIds = useMemo(() => new Set(practice.history.filter((h) => h.correct).map((h) => h.puzzleId)), [practice.history]);

  const openPuzzle = useCallback((puzzle: Puzzle) => {
    setPracticeError(null);
    setPlaying({ puzzle, openKey: `${puzzle.id}-${Date.now()}` });
  }, []);

  const startPracticePuzzle = useCallback(() => {
    setPracticeError(null);
    const next = pickNextPracticePuzzle(pool, practice.rating, practice.recentPuzzleIds);
    if (!next) {
      setPracticeError(
        bandCount > 0
          ? 'Tüm bulmacalar bu seviyede oynandı. Biraz sonra tekrar deneyin.'
          : 'Bu seviye için henüz bulmaca yok. Antrenörünüzden Lichess bankası import etmesini isteyin.',
      );
      return;
    }
    openPuzzle(next);
  }, [pool, practice.rating, practice.recentPuzzleIds, bandCount, openPuzzle]);

  const handleAttempt = useCallback(
    (record: HomeworkAttemptRecord) => {
      const puzzle = playing?.puzzle;
      if (!puzzle) return;
      const { state, delta, pointsEarned } = applyPracticeResult(practice, puzzle, record.correct);
      setPractice(state);
      savePracticeState(studentId, state);
      setLastDelta(delta);
      setLastPoints(pointsEarned);
    },
    [playing?.puzzle, practice, studentId],
  );

  return (
    <div className="space-y-5 w-full max-w-6xl mx-auto pb-8">
      <div className="rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/20 via-violet-600/10 to-slate-900/80 p-5 shadow-xl shadow-indigo-950/30 max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Bulmaca Çöz
            </p>
            <h2 className="text-xl font-black text-white mt-1">{level.band.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Seviye {level.band.label}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Rating</p>
            <p className="text-4xl font-black text-white tabular-nums leading-none">{practice.rating}</p>
            {lastDelta != null ? (
              <p className={`text-xs font-bold mt-1 inline-flex items-center gap-0.5 ${lastDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {lastDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {lastDelta >= 0 ? `+${lastDelta}` : lastDelta}
                {lastPoints != null ? <span className="text-amber-300 ml-1">+{lastPoints} puan</span> : null}
              </p>
            ) : null}
          </div>
        </div>

        {level.nextBand ? (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1.5">
              <span>Sonraki seviye: {level.nextBand.title}</span>
              <span>%{level.progressPct}</span>
            </div>
            <div className="h-2.5 rounded-full bg-black/30 overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all duration-500"
                style={{ width: `${level.progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-300/90 font-medium flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            En üst seviyedesin — harika!
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-xl bg-black/25 border border-white/5 px-2 py-2.5 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Puan</p>
            <p className="text-xl font-black text-amber-300 tabular-nums flex items-center justify-center gap-1">
              <Star className="w-3.5 h-3.5" />
              {practice.points}
            </p>
          </div>
          <div className="rounded-xl bg-black/25 border border-white/5 px-2 py-2.5 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Doğru</p>
            <p className="text-xl font-black text-emerald-400 tabular-nums">{practice.solved}</p>
          </div>
          <div className="rounded-xl bg-black/25 border border-white/5 px-2 py-2.5 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Doğruluk</p>
            <p className="text-xl font-black text-indigo-300 tabular-nums">
              {accuracy != null ? `%${accuracy}` : '—'}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          Bu seviyede {bandCount.toLocaleString('tr-TR')} bulmaca · listede {visiblePuzzles.length}
        </p>

        {!readOnly ? (
          <button
            type="button"
            onClick={startPracticePuzzle}
            disabled={pool.length === 0}
            className="mt-4 w-full inline-flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-base font-black shadow-lg shadow-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Play className="w-5 h-5 fill-current" />
            Rastgele Bulmaca
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-500 text-center">Veli görünümünde bulmaca oynanamaz.</p>
        )}

        {practiceError ? (
          <p className="text-xs text-rose-300 text-center mt-3 leading-relaxed">{practiceError}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-white">Seviyene uygun bulmacalar</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {level.band.label} bandı · rating {practice.rating}
            </p>
          </div>
        </div>

        {visiblePuzzles.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-dashed border-white/10 bg-slate-900/30">
            <p className="text-sm text-slate-400">Henüz bulmaca yok.</p>
            <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
              Antrenörünüz kulüp panelinden Lichess bankası import ettiğinde burada görünür.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {visiblePuzzles.map((puzzle) => {
              const preview = puzzlePlayPreviewState(puzzle);
              const rating = estimatePuzzleRating(puzzle);
              const done = solvedIds.has(puzzle.id);
              return (
                <div
                  key={puzzle.id}
                  className="bg-slate-900/70 rounded-xl border border-white/5 flex flex-col overflow-hidden shadow-lg group hover:border-indigo-500/30 transition-colors"
                >
                  <div className="relative aspect-square bg-slate-800/50">
                    {puzzle.imageData ? (
                      <img src={puzzle.imageData} alt={puzzle.title} className="w-full h-full object-contain" />
                    ) : (
                      <ChessBoardFrame hideCoordinates boardOrientation={preview.orientation}>
                        <Chessboard options={BOARD_PREVIEW_OPTS(preview.fen, preview.orientation)} />
                      </ChessBoardFrame>
                    )}
                    {!readOnly ? (
                      <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => openPuzzle(puzzle)}
                          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-black uppercase tracking-wider shadow-xl"
                        >
                          Oyna
                        </button>
                      </div>
                    ) : null}
                    {done ? (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-[9px] font-black text-white uppercase">
                        Çözüldü
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5 sm:p-3 flex-1 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-white truncate" title={puzzle.title}>
                      {puzzle.title}
                    </h4>
                    <div className="flex flex-wrap gap-1 mt-auto">
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[9px] font-black tabular-nums">
                        ~{rating}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-[9px] font-bold">
                        {puzzle.points}p
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                          puzzle.difficulty === 'Kolay'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : puzzle.difficulty === 'Orta'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {puzzle.difficulty}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recentHistory.length > 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-4 max-w-lg">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Son denemeler</p>
          <ul className="space-y-2">
            {recentHistory.map((h) => (
              <li
                key={`${h.at}-${h.puzzleId}`}
                className="flex items-center gap-2 text-xs text-slate-400"
              >
                {h.correct ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span className="truncate flex-1 min-w-0 text-slate-300">
                  {h.puzzleTitle || h.puzzleId}
                </span>
                <span className="tabular-nums text-slate-500 shrink-0">{h.puzzleRating}</span>
                <span className={`tabular-nums font-bold shrink-0 ${h.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {h.delta >= 0 ? `+${h.delta}` : h.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {playing && !readOnly ? (
        <StudentPuzzlePlayModal
          key={playing.openKey}
          puzzle={playing.puzzle}
          homeworkId={PRACTICE_HOMEWORK_ID}
          studentId={studentId}
          onClose={() => setPlaying(null)}
          onAttemptRecord={handleAttempt}
          nextPuzzle={pickNextPracticePuzzle(pool, practice.rating, practice.recentPuzzleIds)}
          onPlayNext={(puzzle) => setPlaying({ puzzle, openKey: `${puzzle.id}-${Date.now()}` })}
        />
      ) : null}
    </div>
  );
}
