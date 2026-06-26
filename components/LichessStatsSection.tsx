import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Crosshair, Puzzle, Timer, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import PlatformStatsSidebar, { type PlatformStatsNavItem } from './PlatformStatsSidebar';
import { lichessPerfLabel, type LichessActivity, type LichessUserProfile } from '../services/chessPlatformService';
import { lichessRatingTrends } from '../lib/lichessInsights';

const GAME_PERFS = ['rapid', 'blitz', 'bullet', 'correspondence', 'classical'] as const;

const PERF_ICON: Record<string, React.ReactNode> = {
  rapid: <Timer className="w-4 h-4 text-blue-400" />,
  blitz: <Zap className="w-4 h-4 text-amber-400" />,
  bullet: <Crosshair className="w-4 h-4 text-rose-400" />,
  correspondence: <Calendar className="w-4 h-4 text-violet-400" />,
  classical: <Clock className="w-4 h-4 text-cyan-400" />,
  puzzle: <Puzzle className="w-4 h-4 text-emerald-400" />,
};

type LichessStatsSectionProps = {
  profile: LichessUserProfile;
  activities?: LichessActivity[];
};

const LichessStatsSection: React.FC<LichessStatsSectionProps> = ({ profile, activities = [] }) => {
  const navItems = useMemo(() => {
    const items: PlatformStatsNavItem[] = [];
    for (const key of GAME_PERFS) {
      const perf = profile.perfs?.[key];
      if (perf && perf.games > 0) {
        items.push({
          id: key,
          label: lichessPerfLabel(key),
          icon: PERF_ICON[key],
          rating: perf.rating,
        });
      }
    }
    const puzzle = profile.perfs?.puzzle;
    if (puzzle && (puzzle.rating > 0 || (puzzle.games ?? 0) > 0)) {
      items.push({
        id: 'puzzle',
        label: 'Bulmacalar',
        icon: <Puzzle className="w-4 h-4 text-orange-400" />,
        rating: puzzle.rating,
      });
    }
    return items;
  }, [profile]);

  const [active, setActive] = useState(navItems[0]?.id ?? 'rapid');

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((i) => i.id === active)) {
      setActive(navItems[0].id);
    }
  }, [navItems, active]);

  if (navItems.length === 0) {
    return <p className="text-slate-500 text-sm">İstatistik bulunamadı.</p>;
  }

  const puzzlePerf = profile.perfs?.puzzle;
  const ratingTrends = useMemo(() => lichessRatingTrends(profile), [profile]);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <PlatformStatsSidebar items={navItems} active={active} onChange={setActive} accent="sky" />
      <div className="flex-1 min-w-0 space-y-4">
        {ratingTrends.length > 0 ? (
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Rating özeti</div>
            <div className="flex flex-wrap gap-2">
              {ratingTrends.map((row) => (
                <div key={row.perf} className="rounded-lg bg-slate-900/50 border border-slate-700/50 px-3 py-2 min-w-[110px]">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">{row.label}</div>
                  <div className="text-lg font-black text-white tabular-nums">{row.rating}</div>
                  {row.prog != null && row.prog !== 0 ? (
                    <div className={`text-[11px] font-bold flex items-center gap-0.5 ${row.prog > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.prog > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {row.prog > 0 ? '+' : ''}{row.prog}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-600">{row.games.toLocaleString('tr-TR')} oyun</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {active === 'puzzle' && puzzlePerf ? (
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 md:p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🧩</span>
              <div>
                <h3 className="text-base font-black text-white">Bulmacalar</h3>
                <p className="text-[10px] text-slate-500 uppercase">Lichess puzzle rating</p>
              </div>
              <a
                href={`https://lichess.org/@/${encodeURIComponent(profile.username)}/perf/puzzle`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] text-sky-400 hover:text-sky-300 font-medium"
              >
                Lichess&apos;te aç
              </a>
            </div>
            <div className="text-4xl font-black text-white mb-4 tabular-nums">{puzzlePerf.rating}</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Rating</div>
                <div className="text-2xl font-black text-emerald-400 mt-1">{puzzlePerf.rating}</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-4 py-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Çözülen</div>
                <div className="text-2xl font-black text-sky-400 mt-1">{(puzzlePerf.games ?? 0).toLocaleString('tr-TR')}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">RD</div>
                <div className="text-2xl font-black text-amber-400 mt-1">{puzzlePerf.rd ?? '—'}</div>
              </div>
            </div>
            {activities.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-slate-700/60">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Son günlerde puzzle aktivitesi</div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {activities.map((act, i) => {
                    if (!act.puzzles) return null;
                    const dateStr = new Date(act.interval.start).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'short',
                    });
                    const count = act.puzzles.score
                      ? act.puzzles.score.win + act.puzzles.score.loss + act.puzzles.score.draw
                      : act.puzzles.count || 0;
                    if (!count) return null;
                    return (
                      <div key={i} className="flex items-center justify-between text-xs text-slate-300 rounded-lg bg-slate-800/40 px-3 py-2">
                        <span>{dateStr}</span>
                        <span className="text-emerald-400 font-medium">{count} deneme</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          (() => {
            const perf = profile.perfs?.[active];
            if (!perf) return null;
            const border =
              active === 'rapid'
                ? 'border-l-blue-500'
                : active === 'blitz'
                  ? 'border-l-amber-500'
                  : active === 'bullet'
                    ? 'border-l-rose-500'
                    : 'border-l-violet-500';
            return (
              <div className={`rounded-xl bg-slate-800/60 border border-slate-700/60 border-l-4 ${border} p-4 md:p-5`}>
                <div className="flex items-center gap-2 mb-4">
                  {PERF_ICON[active]}
                  <h3 className="text-base font-black text-white">{lichessPerfLabel(active)}</h3>
                </div>
                <div className="text-4xl font-black text-white tabular-nums mb-2">{perf.rating}</div>
                {perf.prog != null && perf.prog !== 0 ? (
                  <span
                    className={`text-sm font-bold ${perf.prog > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {perf.prog > 0 ? '+' : ''}
                    {perf.prog} prog
                  </span>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-700/30 px-3 py-2">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Oyun</div>
                    <div className="text-lg font-black text-white">{(perf.games ?? 0).toLocaleString('tr-TR')}</div>
                  </div>
                  {perf.rd != null ? (
                    <div className="rounded-lg bg-slate-700/30 px-3 py-2">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">RD</div>
                      <div className="text-lg font-black text-white">{perf.rd}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};

export default LichessStatsSection;
