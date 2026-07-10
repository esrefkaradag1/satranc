import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Grid,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
  XCircle,
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
import StudentPuzzlePlayModal from './StudentPuzzlePlayModal';
import LichessPuzzleDashboardSection from './LichessPuzzleDashboardSection';
import LichessOAuthConnect from './student/LichessOAuthConnect';

type LichessPuzzlesSectionProps = {
  username?: string;
  studentId?: string;
  student?: Student;
  dailyPuzzle: Puzzle | null;
  practicePuzzles: Puzzle[];
  loadingDaily?: boolean;
  /** Lichess aktivite akışı — öğrencinin platformda çözdüğü bulmacalar */
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
  loadingDaily = false,
  activityRows = [],
}) => {
  const [playing, setPlaying] = useState<{ puzzle: Puzzle; openKey: string } | null>(null);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(!!studentId?.trim());
  const [todayRows, setTodayRows] = useState<PlatformLichessPuzzleRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [rowPlayLoadingId, setRowPlayLoadingId] = useState<string | null>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
      setPlaying({ puzzle: result.puzzle, openKey: `training:${Date.now()}` });
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
        setPlaying({ puzzle, openKey: `oauth:${id}:${Date.now()}` });
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
                  Hesabınız bağlıyken Lichess kuyruğunuzdan yeni bulmaca çekip burada çözebilirsiniz.
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
                Önce yukarıdan Lichess hesabınızı bağlayın; ardından antrenman bulmacaları burada açılır.
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
            onClick={() => setPlaying({ puzzle: dailyPuzzle, openKey: `daily:${Date.now()}` })}
            className="w-full text-left rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/15 px-4 py-3 transition-colors"
          >
            <p className="text-xs font-bold text-sky-300 uppercase tracking-wide">Günün bulmacası</p>
            <p className="text-sm font-semibold text-white mt-1">{dailyPuzzle.title}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {dailyPuzzle.difficulty} · {dailyPuzzle.points} puan
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
              Antrenör bulmacaları ({practicePuzzles.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[min(50vh,360px)] overflow-y-auto pr-1">
              {practicePuzzles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlaying({ puzzle: p, openKey: `${p.id}:${Date.now()}` })}
                  className="text-left rounded-lg border border-slate-700/60 bg-slate-900/50 hover:border-sky-500/40 px-3 py-2 transition-colors"
                >
                  <p className="text-xs font-semibold text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {p.difficulty} · {p.theme || p.category}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            Antrenör Lichess bulmaca veritabanını yüklediğinde burada çözebilirsiniz. Platformdaki günlük
            bulmaca ve taktik antrenmanları da hedef sayımına dahil edilir.
          </p>
        )}
      </div>

      {playing ? (
        <StudentPuzzlePlayModal
          puzzle={playing.puzzle}
          homeworkId={playing.puzzle.id.startsWith('lichess') ? 'lichess-daily' : 'lichess-practice'}
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
