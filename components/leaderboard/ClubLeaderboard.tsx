import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Medal, RefreshCw, Trophy, Target, Gamepad2 } from 'lucide-react';
import type { HomeworkPuzzleAttempt, Student } from '../../types';
import type { LeaderboardEntry, LeaderboardPeriod } from '../../lib/leaderboardUtils';
import { clubDisplayName, getClubPeerStudents, getPeriodBounds } from '../../lib/leaderboardUtils';
import { buildClubLeaderboard } from '../../services/leaderboardService';
import { scheduleHourlyRefresh } from '../../lib/scheduleHourlyRefresh';
import { ResponsiveTable } from '../ui/ResponsiveTable';

type Props = {
  allStudents: Student[];
  anchorStudent: Student | null;
  homeworkAttempts: HomeworkPuzzleAttempt[];
  highlightStudentId?: string;
  /** Verilirse kulüp filtresi yerine bu liste kullanılır (admin paneli) */
  peerStudentsOverride?: Student[];
  compact?: boolean;
};

export const ClubLeaderboard: React.FC<Props> = ({
  allStudents,
  anchorStudent,
  homeworkAttempts,
  highlightStudentId,
  peerStudentsOverride,
  compact = false,
}) => {
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  const peers = useMemo(
    () => peerStudentsOverride ?? getClubPeerStudents(allStudents, anchorStudent),
    [allStudents, anchorStudent, peerStudentsOverride],
  );

  const clubName = useMemo(() => clubDisplayName(anchorStudent), [anchorStudent]);
  const bounds = useMemo(() => getPeriodBounds(period), [period]);

  const load = useCallback(async () => {
    if (peers.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await buildClubLeaderboard(peers, homeworkAttempts, period, (done, total) => {
        setProgress({ done, total });
      });
      setEntries(result);
    } catch {
      setError('Sıralama yüklenemedi. Lütfen tekrar deneyin.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [peers, homeworkAttempts, period]);

  useEffect(() => {
    void load();
    return scheduleHourlyRefresh(() => void load());
  }, [load]);

  const top3 = entries.slice(0, 3);
  const highlightId = highlightStudentId || anchorStudent?.id;

  const tableEntries = useMemo(() => {
    if (!compact) return entries.length > 3 ? entries.slice(3) : entries;
    const top5 = entries.slice(0, 5);
    if (!highlightId || top5.some((e) => e.studentId === highlightId)) return top5;
    const mine = entries.find((e) => e.studentId === highlightId);
    return mine ? [...top5, mine] : top5;
  }, [entries, compact, highlightId]);

  const medalClass = (rank: number) =>
    rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-slate-300' : 'text-amber-700';

  return (
    <div className={`space-y-5 ${compact ? '' : 'animate-in fade-in duration-300'}`}>
      <div className="rounded-2xl bg-[#1e293b] border border-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Kulüp Lider Tablosu
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {clubName} · {bounds.label} · bulmaca 1p, galibiyet 10p, beraberlik 5p, mağlubiyet 1p
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-black/30 p-1 rounded-xl">
              {(['week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    period === p
                      ? 'premium-gradient text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'week' ? 'Haftalık' : 'Aylık'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-400 hover:text-white disabled:opacity-50"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            {progress.total > 0
              ? `Öğrenci verileri alınıyor… ${progress.done}/${progress.total}`
              : 'Hesaplanıyor…'}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </div>

      {!loading && entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500 text-sm">
          Bu dönem için henüz aktivite verisi yok.
        </div>
      )}

      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((e) => (
            <div
              key={e.studentId}
              className={`rounded-2xl border p-5 text-center transition-all ${
                e.studentId === highlightId
                  ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                  : 'border-white/5 bg-[#1e293b]'
              }`}
            >
              <Medal className={`w-8 h-8 mx-auto mb-2 ${medalClass(e.rank)}`} />
              <div className="w-12 h-12 mx-auto rounded-xl premium-gradient text-white flex items-center justify-center text-sm font-black mb-2">
                {e.initials}
              </div>
              <p className="text-sm font-bold text-white truncate">{e.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{e.group}</p>
              <div className="flex justify-center gap-4 mt-3 text-xs">
                <span className="text-violet-400 font-bold">{e.puzzles} bulmaca</span>
                <span className="text-indigo-400 font-bold">{e.games} maç</span>
              </div>
              <p className="text-2xl font-black text-white mt-2">{e.score}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">toplam puan</p>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 overflow-hidden">
          <ResponsiveTable minWidth={500}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Öğrenci</th>
                  <th className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1"><Target className="w-3 h-3" /> Bulmaca</span>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1"><Gamepad2 className="w-3 h-3" /> Maç</span>
                  </th>
                  <th className="px-4 py-3 text-center">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableEntries.map((e) => (
                  <tr
                    key={e.studentId}
                    className={
                      e.studentId === highlightId
                        ? 'bg-indigo-500/10'
                        : 'hover:bg-white/[0.02]'
                    }
                  >
                    <td data-label="#" className="px-4 py-3">
                      <span className={`font-black ${e.rank <= 3 ? medalClass(e.rank) : 'text-slate-500'}`}>
                        {e.rank}
                      </span>
                    </td>
                    <td data-label="Öğrenci" className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/5 text-indigo-400 flex items-center justify-center text-[10px] font-black">
                          {e.initials}
                        </div>
                        <div>
                          <p className="font-bold text-white">{e.name}</p>
                          <p className="text-[10px] text-slate-500">{e.group}</p>
                        </div>
                        {e.studentId === highlightId && (
                          <span className="ml-1 px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 text-[9px] font-bold uppercase">
                            Sen
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Bulmaca" className="px-4 py-3 text-center font-black text-violet-400">{e.puzzles}</td>
                    <td data-label="Maç" className="px-4 py-3 text-center font-black text-indigo-400">{e.games}</td>
                    <td data-label="Toplam" className="px-4 py-3 text-center font-black text-white">{e.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          <p className="px-4 py-3 text-[10px] text-slate-500 border-t border-white/5">
            Sistem ödevleri + Lichess + Chess.com. Saatlik otomatik yenilenir.
          </p>
        </div>
      )}
    </div>
  );
};
