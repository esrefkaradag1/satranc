import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Medal, Trophy } from 'lucide-react';
import type { HomeworkPuzzleAttempt, Student } from '../../types';
import type { LeaderboardEntry } from '../../lib/leaderboardUtils';
import {
  clubDisplayName,
  getClubPeerStudents,
  getPeriodBounds,
  mergeLeaderboardEntryRows,
} from '../../lib/leaderboardUtils';
import { buildCachedClubLeaderboardPreview } from '../../services/leaderboardService';
import {
  entriesHaveActivity,
  findBestLeaderboardSnapshot,
} from '../../lib/leaderboardSnapshotCache';
import { loadRemoteLeaderboardSnapshot } from '../../lib/leaderboardRemoteStore';
import { normalizeClubKey } from '../../lib/clubScope';

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

  const peers = useMemo(
    () => getClubPeerStudents(allStudents, anchorStudent),
    [allStudents, anchorStudent],
  );

  const clubName = useMemo(() => clubDisplayName(anchorStudent), [anchorStudent]);

  const load = useCallback(async () => {
    if (peers.length === 0) {
      setEntries([]);
      return;
    }
    const bounds = getPeriodBounds('week');
    const office = (anchorStudent.branchOffice || clubName || '').trim();
    const clubScope = office ? `office:${normalizeClubKey(office)}` : 'club:default';
    const snapshot = findBestLeaderboardSnapshot({
      preferredKey: '',
      period: 'week',
      rankMode: 'activity',
      periodStartMs: bounds.startMs,
    });
    const remote = await loadRemoteLeaderboardSnapshot({
      preferredKey: '',
      clubScope,
      period: 'week',
      rankMode: 'activity',
      periodStartMs: bounds.startMs,
    });
    const preview = buildCachedClubLeaderboardPreview(
      peers,
      homeworkAttempts,
      'week',
      'activity',
    );
    let merged = snapshot?.entries.length ? snapshot.entries : [];
    if (remote?.entries.length) {
      merged = merged.length
        ? mergeLeaderboardEntryRows(merged, remote.entries, 'activity')
        : remote.entries;
    }
    if (preview.length) {
      merged = merged.length
        ? mergeLeaderboardEntryRows(merged, preview, 'activity')
        : preview;
    }
    setEntries(entriesHaveActivity(merged) ? merged : []);
  }, [peers, homeworkAttempts, anchorStudent.branchOffice, clubName]);

  useEffect(() => {
    load();
  }, [load]);

  const top = entries.slice(0, PREVIEW_LIMIT);
  const hid = String(highlightStudentId);
  const myEntry = entries.find((e) => String(e.studentId) === hid);
  const showMyRankBelow =
    myEntry != null && !top.some((e) => String(e.studentId) === hid);

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
            {clubName} · ilk 5 + senin sıran
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

      {entries.length === 0 ? (
        <p className="p-6 text-sm text-slate-500 text-center">Bu hafta henüz aktivite yok.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {top.map((e) => (
            <div
              key={e.studentId}
              className={`flex items-center gap-3 px-5 py-3 ${
                String(e.studentId) === hid ? 'bg-indigo-600/10' : ''
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
                  {String(e.studentId) === hid && (
                    <span className="ml-2 text-[9px] font-bold text-indigo-400 uppercase">Sen</span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500">
                  {e.puzzles} bulmaca
                  {' · '}
                  {e.games} maç
                </p>
              </div>
              <span className="text-sm font-black text-white tabular-nums">
                {e.rankMetric || e.score}
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
