import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Puzzle, Student } from '../../types';
import StudentPuzzlePlayModal, { type HomeworkAttemptRecord } from '../StudentPuzzlePlayModal';
import {
  PRACTICE_HOMEWORK_ID,
  PRACTICE_RATING_BANDS,
  applyPracticeResult,
  loadPracticeRatingBand,
  loadPracticeState,
  pickNextPracticePuzzle,
  savePracticeRatingBand,
  savePracticeState,
  type PracticeRatingBandId,
  type StudentPuzzlePracticeState,
} from '../../lib/studentPuzzlePractice';

type Props = {
  student: Student;
  pool: Puzzle[];
  viewAs?: 'student' | 'parent';
};

export function StudentPuzzlePracticePanel({ student, pool, viewAs = 'student' }: Props) {
  const studentId = student.id;
  const seedRating = student.elo && student.elo > 400 ? student.elo : undefined;
  const [practice, setPractice] = useState<StudentPuzzlePracticeState>(() =>
    loadPracticeState(studentId, seedRating),
  );
  const [ratingBand, setRatingBand] = useState<PracticeRatingBandId>(() =>
    loadPracticeRatingBand(studentId),
  );
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{
    puzzle: Puzzle;
    openKey: string;
  } | null>(null);

  useEffect(() => {
    setPractice(loadPracticeState(studentId, seedRating));
    setRatingBand(loadPracticeRatingBand(studentId));
    setLastDelta(null);
  }, [studentId, seedRating]);

  const accuracy = useMemo(() => {
    const total = practice.solved + practice.failed;
    if (total <= 0) return null;
    return Math.round((practice.solved / total) * 100);
  }, [practice.solved, practice.failed]);

  const recentHistory = practice.history.slice(0, 8);
  const bandMeta = PRACTICE_RATING_BANDS.find((b) => b.id === ratingBand) ?? PRACTICE_RATING_BANDS[1]!;

  const startPracticePuzzle = useCallback(() => {
    setPracticeError(null);
    const next = pickNextPracticePuzzle(pool, practice.rating, practice.recentPuzzleIds, ratingBand);
    if (!next) {
      setPracticeError('Bu rating aralığında bulmaca bulunamadı. Başka bir aralık deneyin.');
      return;
    }
    setPlaying({ puzzle: next, openKey: `${next.id}-${Date.now()}` });
  }, [pool, practice.rating, practice.recentPuzzleIds, ratingBand]);

  const handleBandChange = (bandId: PracticeRatingBandId) => {
    setRatingBand(bandId);
    savePracticeRatingBand(studentId, bandId);
  };

  const handleAttempt = useCallback(
    (record: HomeworkAttemptRecord) => {
      const puzzle = playing?.puzzle;
      if (!puzzle) return;
      const { state, delta } = applyPracticeResult(practice, puzzle, record.correct);
      setPractice(state);
      savePracticeState(studentId, state);
      setLastDelta(delta);
    },
    [playing?.puzzle, practice, studentId],
  );

  const readOnly = viewAs === 'parent';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-500/35 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-300" />
              Bulmaca Çöz
            </p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-lg">
              Ödevlerden bağımsız serbest antrenman. Rating aralığı seçin; doğru ve yanlışlarda yerel rating güncellenir.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rating</p>
            <p className="text-3xl font-black text-white tabular-nums leading-none mt-0.5">
              {practice.rating}
            </p>
            {lastDelta != null ? (
              <p
                className={`text-xs font-bold tabular-nums mt-1 inline-flex items-center gap-0.5 ${
                  lastDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {lastDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {lastDelta >= 0 ? `+${lastDelta}` : lastDelta}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Rating aralığı</p>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_RATING_BANDS.map((band) => (
              <button
                key={band.id}
                type="button"
                disabled={readOnly}
                onClick={() => handleBandChange(band.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  ratingBand === band.id
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                } disabled:opacity-60`}
              >
                {band.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Seçili: {bandMeta.label} · bankada {pool.filter((p) => p.source === 'lichess' || p.lichessId).length} bulmaca
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-black/25 border border-white/5 px-2.5 py-2 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Doğru</p>
            <p className="text-lg font-black text-emerald-400 tabular-nums">{practice.solved}</p>
          </div>
          <div className="rounded-lg bg-black/25 border border-white/5 px-2.5 py-2 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Yanlış</p>
            <p className="text-lg font-black text-rose-400 tabular-nums">{practice.failed}</p>
          </div>
          <div className="rounded-lg bg-black/25 border border-white/5 px-2.5 py-2 text-center">
            <p className="text-[9px] font-bold text-slate-500 uppercase">Doğruluk</p>
            <p className="text-lg font-black text-indigo-300 tabular-nums">
              {accuracy != null ? `%${accuracy}` : '—'}
            </p>
          </div>
        </div>

        {!readOnly ? (
          <button
            type="button"
            onClick={startPracticePuzzle}
            disabled={pool.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Target className="w-4 h-4" />
            Bulmaca çöz
          </button>
        ) : (
          <p className="text-xs text-slate-500 text-center">Veli görünümünde bulmaca oynanamaz.</p>
        )}

        {practiceError ? <p className="text-xs text-rose-300 text-center">{practiceError}</p> : null}

        {recentHistory.length > 0 ? (
          <ul className="space-y-1 max-h-32 overflow-y-auto pr-1 border-t border-white/5 pt-2">
            {recentHistory.map((h) => (
              <li
                key={`${h.at}-${h.puzzleId}`}
                className="flex items-center gap-2 text-[11px] text-slate-400"
              >
                {h.correct ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                )}
                <span className="truncate flex-1 min-w-0 text-slate-300">
                  {h.puzzleTitle || h.puzzleId}
                </span>
                <span className="tabular-nums text-slate-500 shrink-0">{h.puzzleRating}</span>
                <span
                  className={`tabular-nums font-bold shrink-0 ${
                    h.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {h.delta >= 0 ? `+${h.delta}` : h.delta}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {playing && !readOnly ? (
        <StudentPuzzlePlayModal
          key={playing.openKey}
          puzzle={playing.puzzle}
          homeworkId={PRACTICE_HOMEWORK_ID}
          studentId={studentId}
          onClose={() => setPlaying(null)}
          onAttemptRecord={handleAttempt}
          nextPuzzle={pickNextPracticePuzzle(pool, practice.rating, practice.recentPuzzleIds, ratingBand)}
          onPlayNext={(puzzle) => setPlaying({ puzzle, openKey: `${puzzle.id}-${Date.now()}` })}
        />
      ) : null}
    </div>
  );
}
