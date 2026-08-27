import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Grid,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Puzzle, Student } from '../types';
import type { LichessActivity } from '../services/chessPlatformService';
import { lichessActivityPuzzleCount } from '../lib/leaderboardUtils';
import { fetchPuzzleById } from '../services/lichessService';
import {
  fetchLichessOAuthNextPuzzle,
  fetchLichessOAuthStatus,
  fetchLichessPuzzlesForDay,
  type PlatformLichessPuzzleRow,
} from '../services/lichessOAuthClient';
import StudentPuzzlePlayModal, { type HomeworkAttemptRecord } from './StudentPuzzlePlayModal';
import LichessPuzzleDashboardSection from './LichessPuzzleDashboardSection';
import LichessOAuthConnect from './student/LichessOAuthConnect';
import {
  PRACTICE_HOMEWORK_ID,
  applyPracticeResult,
  estimatePuzzleRating,
  loadPracticeState,
  pickNextPracticePuzzle,
  savePracticeState,
  type StudentPuzzlePracticeState,
} from '../lib/studentPuzzlePractice';

type LichessPuzzlesSectionProps = {
  username?: string;
  studentId?: string;
  student?: Student;
  dailyPuzzle: Puzzle | null;
  /** Liste önizlemesi (kısa dilim) */
  practicePuzzles: Puzzle[];
  /** Serbest antrenman havuzu — tüm Lichess bankası */
  practicePool?: Puzzle[];
  loadingDaily?: boolean;
  activityRows?: LichessActivity[];
};

function formatAttemptTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const LichessPuzzlesSection: React.FC<LichessPuzzlesSectionProps> = ({
  username,
  studentId,
  student,
  dailyPuzzle,
  practicePuzzles,
  practicePool,
  loadingDaily = false,
  activityRows = [],
}) => {
  const pool = practicePool && practicePool.length > 0 ? practicePool : practicePuzzles;
  const seedRating = student?.elo && student.elo > 400 ? student.elo : undefined;

  const [playing, setPlaying] = useState<{
    puzzle: Puzzle;
    openKey: string;
    mode: 'practice' | 'other';
  } | null>(null);
  const [practice, setPractice] = useState<StudentPuzzlePracticeState>(() =>
    loadPracticeState(studentId?.trim() || '', seedRating),
  );
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(!!studentId?.trim());
  const [todayRows, setTodayRows] = useState<PlatformLichessPuzzleRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [rowPlayLoadingId, setRowPlayLoadingId] = useState<string | null>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!studentId?.trim()) return;
    setPractice(loadPracticeState(studentId, seedRating));
    setLastDelta(null);
  }, [studentId, seedRating]);

  const refreshOAuthStatus = useCallback(async () => {
    if (!studentId?.trim()) {
      setOauthConnected(false);
      setOauthLoading(false);
      return;
    }
    setOauthLoading(true);
    try {
      const status = await fetchLichessOAuthStatus(studentId);
      setOauthConnected(status.connected);
    } catch {
      setOauthConnected(false);
    } finally {
      setOauthLoading(false);
    }
  }, [studentId]);

  const loadTodayOAuthPuzzles = useCallback(async () => {
    if (!studentId?.trim() || !oauthConnected) {
      setTodayRows([]);
      return;
    }
    setTodayLoading(true);
    setTodayError(null);
    try {
      const rows = await fetchLichessPuzzlesForDay(studentId, todayIso, 0, student);
      setTodayRows(rows);
    } catch {
      setTodayRows([]);
      setTodayError('Bugünkü bulmacalar yüklenemedi');
    } finally {
      setTodayLoading(false);
    }
  }, [studentId, oauthConnected, todayIso, student]);

  useEffect(() => {
    void refreshOAuthStatus();
  }, [refreshOAuthStatus]);

  useEffect(() => {
    if (!oauthConnected) {
      setTodayRows([]);
      return;
    }
    void loadTodayOAuthPuzzles();
  }, [oauthConnected, loadTodayOAuthPuzzles]);

  const startPracticePuzzle = useCallback(() => {
    setPracticeError(null);
    setLastDelta(null);
    const next = pickNextPracticePuzzle(pool, practice.rating, practice.recentPuzzleIds);
    if (!next) {
      setPracticeError(
        pool.length === 0
          ? 'Henüz Lichess bulmaca bankası yok. Antrenör AI/CSV ile bulmaca yüklemeli.'
          : 'Uygun bulmaca bulunamadı. Daha fazla Lichess bulmacası yükleyin.',
      );
      return;
    }
    setPlaying({ puzzle: next, openKey: `practice:${next.id}:${Date.now()}`, mode: 'practice' });
  }, [pool, practice.rating, practice.recentPuzzleIds]);

  const handlePracticeAttempt = useCallback(
    (record: HomeworkAttemptRecord) => {
      if (!studentId?.trim()) return;
      const puzzle =
        playing?.puzzle
        ?? pool.find((p) => p.id === record.puzzleId)
        ?? null;
      if (!puzzle) return;
      setPractice((prev) => {
        const result = applyPracticeResult(prev, puzzle, record.correct);
        savePracticeState(studentId, result.state);
        setLastDelta(result.delta);
        return result.state;
      });
    },
    [studentId, playing?.puzzle, pool],
  );

  const handleTraining = async () => {
    if (!studentId?.trim()) return;
    setTrainingLoading(true);
    setTrainingError(null);
    try {
      const result = await fetchLichessOAuthNextPuzzle(studentId);
      if (!result.connected) {
        setTrainingError(result.error || 'Lichess hesabını bağlayın');
        return;
      }
      if (!result.puzzle) {
        setTrainingError(result.error || 'Bulmaca alınamadı');
        return;
      }
      setPlaying({ puzzle: result.puzzle, openKey: `training:${Date.now()}`, mode: 'other' });
    } finally {
      setTrainingLoading(false);
    }
  };

  const playOAuthRow = async (row: PlatformLichessPuzzleRow) => {
    const id = row.attempt.puzzleId;
    if (!id) return;
    setRowPlayLoadingId(id);
    try {
      const puzzle = await fetchPuzzleById(id);
      if (puzzle) {
        setPlaying({ puzzle, openKey: `oauth:${id}:${Date.now()}`, mode: 'other' });
      }
    } finally {
      setRowPlayLoadingId(null);
    }
  };

  const recentSolvedDays = useMemo(() => {
    return (activityRows ?? [])
      .map((row) => {
        const solved = lichessActivityPuzzleCount(row);
        if (solved <= 0) return null;
        const start = row.interval?.start;
        const date = start ? new Date(start).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—';
        return { date, solved, sortKey: start ?? 0 };
      })
      .filter((x): x is { date: string; solved: number; sortKey: number } => x != null)
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 14);
  }, [activityRows]);

  const recentHistory = practice.history.slice(0, 5);
  const accuracy = practice.solved + practice.failed > 0
    ? Math.round((practice.solved / (practice.solved + practice.failed)) * 100)
    : null;

  const profileUrl = username?.trim()
    ? `https://lichess.org/@/${encodeURIComponent(username.trim())}`
    : 'https://lichess.org/training';

  return (
    <div className="space-y-4">
      {studentId?.trim() ? (
        <LichessPuzzleDashboardSection studentId={studentId} days={30} />
      ) : null}

      {student ? (
        <LichessOAuthConnect
          student={student}
          compact
          onConnected={() => {
            void refreshOAuthStatus();
            void loadTodayOAuthPuzzles();
          }}
          onDisconnected={() => {
            setOauthConnected(false);
            setTodayRows([]);
          }}
        />
      ) : null}

      {/* Serbest antrenman — ödevden ayrı, yerel Elo */}
      {studentId?.trim() ? (
        <div className="rounded-xl border border-indigo-500/35 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-transparent p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Serbest antrenman
              </p>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed max-w-md">
                Ödev dışı. Seviyenize yakın Lichess bankası bulmacaları; doğru/yanlışta rating artar veya azalır.
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

          <button
            type="button"
            onClick={startPracticePuzzle}
            disabled={pool.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Target className="w-4 h-4" />
            Seviyeme yakın bulmaca çöz
          </button>
          <p className="text-[10px] text-slate-500 text-center">
            Bankada {pool.filter((p) => p.source === 'lichess' || p.lichessId).length} Lichess bulmacası
            {pool.length > 0 ? ` · hedef ~${practice.rating}` : ''}
          </p>
          {practiceError ? <p className="text-xs text-rose-300 text-center">{practiceError}</p> : null}

          {recentHistory.length > 0 ? (
            <ul className="space-y-1 max-h-28 overflow-y-auto pr-1 border-t border-white/5 pt-2">
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
      ) : null}

      <div className="rounded-xl bg-slate-800/60 border border-sky-500/25 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-sky-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lichess bulmacaları</span>
          </div>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Lichess&apos;te aç
          </a>
        </div>

        {studentId?.trim() ? (
          <div className="rounded-lg border border-[#81b64c]/30 bg-[#81b64c]/10 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-[#a5d46f] uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Platformda Lichess antrenmanı
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  İsteğe bağlı: hesabınız bağlıyken Lichess kendi kuyruğundan bulmaca çeker (sistem rating&apos;ine karışmaz).
                </p>
              </div>
              {oauthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : oauthConnected ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase">
                  <CheckCircle2 className="w-3 h-3" />
                  OAuth bağlı
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleTraining()}
              disabled={trainingLoading || oauthLoading || !oauthConnected}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#81b64c] hover:bg-[#9acd6a] text-[#1a1a18] text-sm font-black uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {trainingLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              Lichess bulmacası çöz
            </button>
            {!oauthConnected && !oauthLoading ? (
              <p className="text-[11px] text-amber-300/90">
                Önce yukarıdan Lichess hesabınızı bağlayın; ardından platform antrenmanı açılır.
              </p>
            ) : null}
            {trainingError ? <p className="text-xs text-rose-300">{trainingError}</p> : null}
          </div>
        ) : null}

        {loadingDaily ? (
          <p className="text-xs text-slate-500">Günün bulmacası yükleniyor…</p>
        ) : null}

        {dailyPuzzle ? (
          <button
            type="button"
            onClick={() => setPlaying({ puzzle: dailyPuzzle, openKey: `daily:${Date.now()}`, mode: 'other' })}
            className="w-full text-left rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/15 px-4 py-3 transition-colors"
          >
            <p className="text-xs font-bold text-sky-300 uppercase tracking-wide">Günün bulmacası</p>
            <p className="text-sm font-semibold text-white mt-1">{dailyPuzzle.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {dailyPuzzle.difficulty} · ~{estimatePuzzleRating(dailyPuzzle)} rating
            </p>
          </button>
        ) : null}

        {oauthConnected ? (
          <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-violet-300/90 uppercase tracking-wider">
                Bugün Lichess&apos;te çözülenler
              </p>
              <button
                type="button"
                onClick={() => void loadTodayOAuthPuzzles()}
                disabled={todayLoading}
                className="inline-flex items-center gap-1 text-[10px] text-violet-300 hover:text-violet-200 font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${todayLoading ? 'animate-spin' : ''}`} />
                Yenile
              </button>
            </div>
            {todayLoading ? (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                OAuth ile çekiliyor…
              </p>
            ) : todayError ? (
              <p className="text-xs text-rose-300">{todayError}</p>
            ) : todayRows.length === 0 ? (
              <p className="text-xs text-slate-500">Bugün henüz Lichess bulmacası yok.</p>
            ) : (
              <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {[...todayRows].reverse().map((row) => {
                  const { attempt } = row;
                  const loading = rowPlayLoadingId === attempt.puzzleId;
                  return (
                    <li
                      key={attempt.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/40 px-2.5 py-2"
                    >
                      <span className="shrink-0">
                        {attempt.win ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">
                          {attempt.rating != null ? `${attempt.rating} rating` : attempt.puzzleId}
                        </p>
                        <p className="text-[10px] text-slate-500">{formatAttemptTime(attempt.date)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void playOAuthRow(row)}
                        disabled={loading}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-600/80 hover:bg-sky-500 text-white text-[10px] font-bold disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Oyna
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {recentSolvedDays.length > 0 ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
            <p className="text-[10px] font-bold text-emerald-400/90 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Lichess&apos;te çözülenler (son günler)
            </p>
            <ul className="space-y-1 max-h-32 overflow-y-auto pr-1 text-xs text-slate-300">
              {recentSolvedDays.map((row) => (
                <li key={`${row.sortKey}-${row.date}`} className="flex justify-between gap-2">
                  <span>{row.date}</span>
                  <span className="font-bold text-emerald-300 tabular-nums">{row.solved} doğru</span>
                </li>
              ))}
            </ul>
          </div>
        ) : username?.trim() ? (
          <p className="text-xs text-slate-500">
            Son iki haftada Lichess bulmaca aktivitesi görünmüyor. Kullanıcı adını ve gizlilik ayarlarını kontrol edin.
          </p>
        ) : null}

        {practicePuzzles.length > 0 ? (
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Antrenör bankası (önizleme · {practicePuzzles.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[min(40vh,280px)] overflow-y-auto pr-1">
              {practicePuzzles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlaying({ puzzle: p, openKey: `${p.id}:${Date.now()}`, mode: 'practice' })}
                  className="text-left rounded-lg border border-slate-700/60 bg-slate-900/50 hover:border-indigo-500/40 px-3 py-2 transition-colors"
                >
                  <p className="text-xs font-semibold text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    ~{estimatePuzzleRating(p)} · {p.difficulty} · {p.theme || p.category}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Listeden seçilen bulmacalar da serbest antrenman rating&apos;inizi etkiler.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Antrenör Lichess bulmaca veritabanını (AI / CSV) yüklediğinde burada ve serbest antrenmanda çözebilirsiniz.
          </p>
        )}
      </div>

      {playing ? (
        <StudentPuzzlePlayModal
          puzzle={playing.puzzle}
          homeworkId={playing.mode === 'practice' ? PRACTICE_HOMEWORK_ID : 'lichess-other'}
          studentId={playing.mode === 'practice' ? studentId : undefined}
          onAttemptRecord={playing.mode === 'practice' ? handlePracticeAttempt : undefined}
          nextPuzzle={
            playing.mode === 'practice'
              ? pickNextPracticePuzzle(
                  pool,
                  // rating güncellenmiş olabilir; en güncel state’i kullan
                  practice.rating,
                  [playing.puzzle.id, ...practice.recentPuzzleIds],
                )
              : null
          }
          onPlayNext={
            playing.mode === 'practice'
              ? (next) => {
                  setLastDelta(null);
                  setPlaying({
                    puzzle: next,
                    openKey: `practice:${next.id}:${Date.now()}`,
                    mode: 'practice',
                  });
                }
              : undefined
          }
          onClose={() => {
            setPlaying(null);
            if (oauthConnected) void loadTodayOAuthPuzzles();
          }}
        />
      ) : null}
    </div>
  );
};

export default LichessPuzzlesSection;
