import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Medal,
  RefreshCw,
  Trophy,
  Target,
  Gamepad2,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { HomeworkPuzzleAttempt, Student } from '../../types';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardPointSettings, LeaderboardRankMode } from '../../lib/leaderboardUtils';
import {
  LEADERBOARD_RANK_MODES,
  clubDisplayName,
  formatLeaderboardPointsSummary,
  getClubPeerStudents,
  getPeriodBounds,
  leaderboardModeLabel,
  leaderboardModeProg,
  leaderboardModeRating,
} from '../../lib/leaderboardUtils';
import { buildClubLeaderboard } from '../../services/leaderboardService';
import { scheduleHourlyRefresh } from '../../lib/scheduleHourlyRefresh';
import { ResponsiveTable } from '../ui/ResponsiveTable';
import { useApp } from '../../AppContext';
import { normalizeClubKey } from '../../lib/clubScope';
import { resolveClubLeaderboardPointSettings } from '../../lib/leaderboardPointSettings';

type Props = {
  allStudents: Student[];
  anchorStudent: Student | null;
  homeworkAttempts: HomeworkPuzzleAttempt[];
  highlightStudentId?: string;
  /** Verilirse kulüp filtresi yerine bu liste kullanılır (admin paneli) */
  peerStudentsOverride?: Student[];
  compact?: boolean;
  pointSettings?: LeaderboardPointSettings;
};

function PlatformBadges({ entry }: { entry: LeaderboardEntry }) {
  const { platform } = entry;
  if (platform.primaryPlatform === 'none') {
    return <span className="text-[9px] text-slate-600">—</span>;
  }
  return (
    <div className="flex items-center gap-1">
      {platform.lichessUsername ? (
        <span className="text-[8px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 font-black">L</span>
      ) : null}
      {platform.chessComUsername ? (
        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black">C</span>
      ) : null}
    </div>
  );
}

function MetricCell({ entry, rankMode }: { entry: LeaderboardEntry; rankMode: LeaderboardRankMode }) {
  if (rankMode === 'activity') {
    return (
      <div className="text-center">
        <div className="font-black text-white tabular-nums">{entry.score}</div>
        <div className="text-[9px] text-slate-500">puan</div>
      </div>
    );
  }

  const modeRating = leaderboardModeRating(entry.platform, rankMode);
  const prog = leaderboardModeProg(entry.platform, rankMode);
  const value =
    rankMode === 'ukd'
      ? entry.platform.ukd
      : rankMode === 'fide'
        ? entry.platform.fideElo
        : modeRating?.rating;

  if (value == null || value <= 0) {
    return <span className="text-slate-600 text-xs">—</span>;
  }

  return (
    <div className="text-center">
      <div className="font-black text-white tabular-nums">{value}</div>
      {prog != null && prog !== 0 ? (
        <div className={`text-[10px] font-bold flex items-center justify-center gap-0.5 ${prog > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {prog > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {prog > 0 ? '+' : ''}
          {prog}
        </div>
      ) : modeRating?.games ? (
        <div className="text-[9px] text-slate-500">{modeRating.games.toLocaleString('tr-TR')} oyun</div>
      ) : null}
    </div>
  );
}

export const ClubLeaderboard: React.FC<Props> = ({
  allStudents,
  anchorStudent,
  homeworkAttempts,
  highlightStudentId,
  peerStudentsOverride,
  compact = false,
  pointSettings: pointSettingsProp,
}) => {
  const { auth, clubs } = useApp();
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [rankMode, setRankMode] = useState<LeaderboardRankMode>('activity');
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

  const resolvedClubId = useMemo(() => {
    if (auth?.role === 'club' && auth.clubId) return auth.clubId;
    const office = anchorStudent?.branchOffice?.trim();
    if (office) {
      const club = clubs.find((c) => normalizeClubKey(c.name) === normalizeClubKey(office));
      if (club) return club.id;
    }
    return null;
  }, [auth, anchorStudent, clubs]);

  const pointSettings = useMemo(
    () => pointSettingsProp ?? resolveClubLeaderboardPointSettings(resolvedClubId, clubs),
    [pointSettingsProp, resolvedClubId, clubs],
  );

  const load = useCallback(async () => {
    if (peers.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await buildClubLeaderboard(peers, homeworkAttempts, period, rankMode, (done, total) => {
        setProgress({ done, total });
      }, pointSettings);
      setEntries(result);
    } catch {
      setError('Sıralama yüklenemedi. Lütfen tekrar deneyin.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [peers, homeworkAttempts, period, rankMode, pointSettings]);

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

  const ratingSummary = useMemo(() => {
    if (rankMode === 'activity' || rankMode === 'ukd' || rankMode === 'fide') return [];
    const withRating = entries
      .map((e) => ({
        entry: e,
        rating: leaderboardModeRating(e.platform, rankMode),
      }))
      .filter((r) => r.rating && r.rating.rating > 0)
      .sort((a, b) => b.rating!.rating - a.rating!.rating)
      .slice(0, 6);
    return withRating;
  }, [entries, rankMode]);

  const subtitle =
    rankMode === 'activity'
      ? `${bounds.label} · ${pointSettings ? formatLeaderboardPointsSummary(pointSettings) : 'bulmaca 1p, galibiyet 10p, beraberlik 5p, mağlubiyet 1p'}`
      : `${bounds.label} · ${leaderboardModeLabel(rankMode)} sıralaması · Lichess + Chess.com`;

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
              {clubName} · {subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        <div className="mt-4 flex flex-wrap gap-1.5">
          {LEADERBOARD_RANK_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setRankMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                rankMode === m.id
                  ? 'bg-indigo-600/30 text-indigo-100 ring-1 ring-indigo-500/40'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            {progress.total > 0
              ? `Platform verileri alınıyor… ${progress.done}/${progress.total}`
              : 'Hesaplanıyor…'}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </div>

      {!loading && ratingSummary.length > 0 && (
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            {leaderboardModeLabel(rankMode)} özeti
          </div>
          <div className="flex flex-wrap gap-2">
            {ratingSummary.map(({ entry, rating }) => (
              <div
                key={entry.studentId}
                className="rounded-xl bg-slate-900/50 border border-slate-700/50 px-3 py-2 min-w-[120px]"
              >
                <div className="text-[10px] text-slate-500 font-bold truncate max-w-[110px]">{entry.name}</div>
                <div className="text-lg font-black text-white tabular-nums">{rating!.rating}</div>
                {rating!.prog != null && rating!.prog !== 0 ? (
                  <div className={`text-[10px] font-bold ${rating!.prog > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {rating!.prog > 0 ? '+' : ''}
                    {rating!.prog}
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-600">
                    {(rating!.games ?? 0).toLocaleString('tr-TR')} oyun
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
              <div className="flex justify-center mt-2">
                <PlatformBadges entry={e} />
              </div>
              <div className="mt-3">
                <MetricCell entry={e} rankMode={rankMode} />
              </div>
              <div className="flex justify-center gap-4 mt-3 text-xs">
                <span className="text-violet-400 font-bold">{e.puzzles} bulmaca</span>
                <span className="text-indigo-400 font-bold">{e.games} maç</span>
                {e.wins + e.losses + e.draws > 0 ? (
                  <span className="text-emerald-400 font-bold">
                    %{Math.round((e.wins / (e.wins + e.losses + e.draws)) * 100)} G
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="rounded-2xl bg-[#1e293b] border border-white/5 overflow-hidden">
          <ResponsiveTable minWidth={720}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/5">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Öğrenci</th>
                  <th className="px-4 py-3 text-center">Platform</th>
                  <th className="px-4 py-3 text-center">{leaderboardModeLabel(rankMode)}</th>
                  <th className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1"><Target className="w-3 h-3" /> Bulmaca</span>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1"><Gamepad2 className="w-3 h-3" /> Maç</span>
                  </th>
                  <th className="px-4 py-3 text-center">G/B/M</th>
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
                    <td data-label="Platform" className="px-4 py-3 text-center">
                      <PlatformBadges entry={e} />
                    </td>
                    <td data-label={leaderboardModeLabel(rankMode)} className="px-4 py-3">
                      <MetricCell entry={e} rankMode={rankMode} />
                    </td>
                    <td data-label="Bulmaca" className="px-4 py-3 text-center font-black text-violet-400">{e.puzzles}</td>
                    <td data-label="Maç" className="px-4 py-3 text-center font-black text-indigo-400">{e.games}</td>
                    <td data-label="G/B/M" className="px-4 py-3 text-center text-xs">
                      <span className="text-emerald-400 font-bold">{e.wins}</span>
                      <span className="text-slate-600 mx-0.5">/</span>
                      <span className="text-slate-400 font-bold">{e.draws}</span>
                      <span className="text-slate-600 mx-0.5">/</span>
                      <span className="text-rose-400 font-bold">{e.losses}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          <p className="px-4 py-3 text-[10px] text-slate-500 border-t border-white/5">
            Sistem ödevleri + Lichess + Chess.com rating ve aktivite verileri. Saatlik otomatik yenilenir.
          </p>
        </div>
      )}
    </div>
  );
};
