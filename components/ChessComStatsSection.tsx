import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Timer, Zap, Crosshair, Calendar, Puzzle } from 'lucide-react';
import PlatformStatsSidebar, { type PlatformStatsNavItem } from './PlatformStatsSidebar';
import ChessComPuzzleStatsPanel from './ChessComPuzzleStatsPanel';
import type { ChessComMemberStats, ChessComModeStat, ChessComStats } from '../services/chessPlatformService';

type StatCategory = 'rapid' | 'blitz' | 'bullet' | 'daily' | 'puzzles' | 'rush';

type ChessComStatsSectionProps = {
  memberStats: ChessComMemberStats | null;
  pubStats?: ChessComStats | null;
  username?: string;
};

const MODE_META: Record<
  Exclude<StatCategory, 'puzzles' | 'rush'>,
  { label: string; icon: React.ReactNode; border: string; emoji: string }
> = {
  rapid: { label: 'Hızlı', icon: <Timer className="w-4 h-4 text-blue-400" />, border: 'border-l-blue-500', emoji: '⏱' },
  blitz: { label: 'Yıldırım', icon: <Zap className="w-4 h-4 text-amber-400" />, border: 'border-l-amber-500', emoji: '⚡' },
  bullet: { label: 'Kurşun', icon: <Crosshair className="w-4 h-4 text-rose-400" />, border: 'border-l-rose-500', emoji: '🔴' },
  daily: { label: 'Günlük', icon: <Calendar className="w-4 h-4 text-violet-400" />, border: 'border-l-violet-500', emoji: '📅' },
};

function formatIsoDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function pubModeRating(pub: ChessComStats | null | undefined, key: string): number | null {
  const data = pub?.[key as keyof ChessComStats] as { last?: { rating: number } } | undefined;
  return data?.last?.rating ?? null;
}

function ChessComModeDetail({
  category,
  mode,
  pubRating,
}: {
  category: Exclude<StatCategory, 'puzzles' | 'rush'>;
  mode?: ChessComModeStat;
  pubRating?: number | null;
}) {
  const meta = MODE_META[category];
  const rating = mode?.rating ?? pubRating ?? null;
  if (rating == null) return null;

  const change = mode?.ratingChange;
  const changeDays = mode?.ratingChangeDays ?? 90;

  return (
    <div className={`rounded-xl bg-slate-800/60 border border-slate-700/60 border-l-4 ${meta.border} p-4 md:p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{meta.emoji}</span>
        <div>
          <h3 className="text-base font-black text-white">{meta.label}</h3>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Canlı rating</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="text-4xl md:text-5xl font-black text-white tabular-nums">{rating}</div>
        {change != null && change !== 0 ? (
          <span
            className={`text-sm font-bold px-2 py-0.5 rounded ${
              change > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {change > 0 ? '+' : ''}
            {change} ({changeDays} gün)
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {mode?.highestRating != null ? (
          <div className="rounded-lg bg-slate-700/30 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">En yüksek</div>
            <div className="text-lg font-black text-white">{mode.highestRating}</div>
            {mode.highestRatingDate ? (
              <div className="text-[9px] text-slate-600">{formatIsoDate(mode.highestRatingDate)}</div>
            ) : null}
          </div>
        ) : null}
        {mode?.totalGames != null && mode.totalGames > 0 ? (
          <div className="rounded-lg bg-slate-700/30 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Oyunlar</div>
            <div className="text-lg font-black text-white">{mode.totalGames.toLocaleString('tr-TR')}</div>
          </div>
        ) : null}
        {mode?.wins != null ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Galibiyet</div>
            <div className="text-lg font-black text-emerald-400">{mode.wins}</div>
          </div>
        ) : null}
        {mode?.losses != null ? (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold">Mağlubiyet</div>
            <div className="text-lg font-black text-rose-400">{mode.losses}</div>
          </div>
        ) : null}
      </div>
      {mode?.lastDate ? (
        <div className="mt-4 text-[10px] text-slate-500 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Son oyun: {formatIsoDate(mode.lastDate)}
        </div>
      ) : null}
    </div>
  );
}

const ChessComStatsSection: React.FC<ChessComStatsSectionProps> = ({
  memberStats,
  pubStats,
  username,
}) => {
  const navItems = useMemo(() => {
    const items: PlatformStatsNavItem[] = [];
    const addMode = (
      id: StatCategory,
      label: string,
      icon: React.ReactNode,
      mode?: ChessComModeStat,
      pubKey?: string,
    ) => {
      const r = mode?.rating ?? (pubKey ? pubModeRating(pubStats, pubKey) : null);
      if (r != null && r > 0) items.push({ id, label, icon, rating: r });
    };
    addMode('rapid', 'Hızlı', <Timer className="w-4 h-4 text-blue-400" />, memberStats?.rapid, 'chess_rapid');
    addMode('blitz', 'Yıldırım', <Zap className="w-4 h-4 text-amber-400" />, memberStats?.blitz, 'chess_blitz');
    addMode('bullet', 'Kurşun', <Crosshair className="w-4 h-4 text-rose-400" />, memberStats?.bullet, 'chess_bullet');
    addMode('daily', 'Günlük', <Calendar className="w-4 h-4 text-violet-400" />, memberStats?.daily, 'chess_daily');
    const puzzleRating =
      memberStats?.tactics?.rating ??
      pubStats?.tactics?.highest?.rating ??
      pubStats?.tactics?.lowest?.rating ??
      null;
    if (puzzleRating != null && puzzleRating > 0) {
      items.push({
        id: 'puzzles',
        label: 'Bulmacalar',
        icon: <Puzzle className="w-4 h-4 text-orange-400" />,
        rating: memberStats?.tactics?.rating && memberStats.tactics.rating > 0 ? memberStats.tactics.rating : puzzleRating,
      });
    }
    if (memberStats?.puzzleRush && memberStats.puzzleRush.highestScore > 0) {
      items.push({
        id: 'rush',
        label: 'Bulmaca Hücumu',
        icon: <Zap className="w-4 h-4 text-orange-300" />,
        rating: memberStats.puzzleRush.highestScore,
      });
    }
    return items;
  }, [memberStats, pubStats]);

  const [active, setActive] = useState<string>(navItems[0]?.id ?? 'rapid');

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((i) => i.id === active)) {
      setActive(navItems[0].id);
    }
  }, [navItems, active]);

  if (navItems.length === 0) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center rounded-xl bg-slate-800/40 border border-slate-700/50">
        İstatistik bulunamadı.
      </p>
    );
  }

  const cat = active as StatCategory;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <PlatformStatsSidebar
        items={navItems}
        active={active}
        onChange={setActive}
        accent="emerald"
      />
      <div className="flex-1 min-w-0">
        {cat === 'puzzles' ? (
          <ChessComPuzzleStatsPanel memberStats={memberStats} pubStats={pubStats} username={username} />
        ) : cat === 'rush' && memberStats?.puzzleRush ? (
          <div className="rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 p-5">
            <h3 className="text-base font-black text-white mb-4">Bulmaca Hücumu</h3>
            <div className="text-4xl font-black text-amber-400 mb-2">{memberStats.puzzleRush.highestScore}</div>
            <p className="text-sm text-slate-400">En iyi skor · Ortalama {memberStats.puzzleRush.avgScore.toFixed(1)}</p>
          </div>
        ) : (
          <ChessComModeDetail
            category={cat as Exclude<StatCategory, 'puzzles' | 'rush'>}
            mode={
              cat === 'rapid'
                ? memberStats?.rapid
                : cat === 'blitz'
                  ? memberStats?.blitz
                  : cat === 'bullet'
                    ? memberStats?.bullet
                    : memberStats?.daily
            }
            pubRating={
              cat === 'rapid'
                ? pubModeRating(pubStats, 'chess_rapid')
                : cat === 'blitz'
                  ? pubModeRating(pubStats, 'chess_blitz')
                  : cat === 'bullet'
                    ? pubModeRating(pubStats, 'chess_bullet')
                    : pubModeRating(pubStats, 'chess_daily')
            }
          />
        )}
      </div>
    </div>
  );
};

export default ChessComStatsSection;
