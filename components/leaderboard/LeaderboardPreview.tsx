import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, Medal, Trophy } from 'lucide-react';
import type { HomeworkPuzzleAttempt, Student } from '../../types';
import type { LeaderboardEntry, LeaderboardRankMode } from '../../lib/leaderboardUtils';
import { clubDisplayName, getClubPeerStudents, leaderboardModeLabel } from '../../lib/leaderboardUtils';
import { buildClubLeaderboard } from '../../services/leaderboardService';

const PREVIEW_LIMIT = 5;

type Props = {
  allStudents: Student[];
  anchorStudent: Student;
  homeworkAttempts: HomeworkPuzzleAttempt[];
  highlightStudentId: string;
  onViewAll: () => void;
};

export const LeaderboardPreview: React.FC<Props> = ({
  allStudents,
  anchorStudent,
  homeworkAttempts,
  highlightStudentId,
  onViewAll,
}) => {
  const [entries, setEntries] = useState([] as LeaderboardEntry[]);
  const [loading, setLoading] = useState(true);
  const [previewMode] = useState<LeaderboardRankMode>('rapid');

  const peers = useMemo(
    () => getClubPeerStudents(allStudents, anchorStudent),
    [allStudents, anchorStudent],
  );

  const clubName = useMemo(() => clubDisplayName(anchorStudent), [anchorStudent]);

  const load = useCallback(async () => {
    if (peers.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await buildClubLeaderboard(peers, homeworkAttempts, 'week', previewMode, (_done, _total, partial) => {
        if (partial?.length) setEntries(partial);
      });
      setEntries(result);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [peers, homeworkAttempts, previewMode]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) void load();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  const top = entries.slice(0, PREVIEW_LIMIT);
  const myEntry = entries.find((e) => e.studentId === highlightStudentId);
  const showMyRankBelow =
    myEntry != null && !top.some((e) => e.studentId === highlightStudentId);

  const medalClass = (rank: number): string => {
    if (rank === 1) return 'text-amber-400';
    if (rank === 2) return 'text-slate-300';
    if (rank === 3) return 'text-amber-700';
    return 'text-slate-500';
  };

  return (
    <div className="bento-card overflow-hidden">
      <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Haftalık Lider Tablosu
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {clubName} · {leaderboardModeLabel(previewMode)} + aktivite
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Tümünü gör
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          Sıralama hesaplanıyor…
        </div>
      ) : entries.length === 0 ? (
        <p className="p-6 text-sm text-slate-500 text-center">Bu hafta henüz aktivite yok.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {top.map((e) => (
            <div
              key={e.studentId}
              className={`flex items-center gap-3 px-5 py-3 ${
                e.studentId === highlightStudentId ? 'bg-indigo-600/10' : ''
              }`}
            >
              <span className={`w-6 text-center font-black text-sm ${e.rank <= 3 ? medalClass(e.rank) : 'text-slate-500'}`}>
                {e.rank <= 3 ? <Medal className={`w-4 h-4 mx-auto ${medalClass(e.rank)}`} /> : e.rank}
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-600/15 text-indigo-400 flex items-center justify-center text-[10px] font-black shrink-0">
                {e.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {e.name}
                  {e.studentId === highlightStudentId && (
                    <span className="ml-2 text-[9px] font-bold text-indigo-400 uppercase">Sen</span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500">
                  {e.platform.rapid?.rating ? `${leaderboardModeLabel('rapid')}: ${e.platform.rapid.rating}` : `${e.puzzles} bulmaca`}
                  {' · '}
                  {e.games} maç
                </p>
              </div>
              <span className="text-sm font-black text-white tabular-nums">
                {previewMode === 'rapid' && e.platform.rapid?.rating
                  ? e.platform.rapid.rating
                  : e.rankMetric || e.score}
              </span>
            </div>
          ))}
          {showMyRankBelow && myEntry && (
            <div className="px-5 py-3 bg-indigo-600/5 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Senin sıran: <span className="font-black text-indigo-300">#{myEntry.rank}</span>
                <span className="text-slate-500 mx-1">·</span>
                {myEntry.puzzles} bulmaca, {myEntry.games} maç
              </p>
              <span className="text-sm font-black text-white tabular-nums">{myEntry.score}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
