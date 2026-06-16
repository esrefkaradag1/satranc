import React from 'react';
import { BarChart3, Gamepad2, Puzzle } from 'lucide-react';

export type PlatformViewTab = 'stats' | 'games' | 'puzzles';

type PlatformViewTabsProps = {
  active: PlatformViewTab;
  onChange: (tab: PlatformViewTab) => void;
  gamesCount?: number;
  puzzlesCount?: number;
  accent?: 'sky' | 'emerald';
  statsContent: React.ReactNode;
  gamesContent: React.ReactNode;
  puzzlesContent?: React.ReactNode;
};

const ACCENT: Record<'sky' | 'emerald', { active: string; bar: string }> = {
  sky: {
    active: 'text-sky-400 border-sky-500 bg-sky-500/10',
    bar: 'border-sky-500',
  },
  emerald: {
    active: 'text-emerald-400 border-emerald-500 bg-emerald-500/10',
    bar: 'border-emerald-500',
  },
};

const PlatformViewTabs: React.FC<PlatformViewTabsProps> = ({
  active,
  onChange,
  gamesCount,
  puzzlesCount,
  accent = 'emerald',
  statsContent,
  gamesContent,
  puzzlesContent,
}) => {
  const a = ACCENT[accent];
  const tabs: { id: PlatformViewTab; label: string; icon: React.ReactNode }[] = [
    { id: 'stats', label: 'İstatistikler', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'games',
      label: gamesCount != null && gamesCount > 0 ? `Oyunlar (${gamesCount.toLocaleString('tr-TR')})` : 'Oyunlar',
      icon: <Gamepad2 className="w-4 h-4" />,
    },
  ];
  if (puzzlesContent) {
    tabs.push({
      id: 'puzzles',
      label:
        puzzlesCount != null && puzzlesCount > 0
          ? `Bulmacalar (${puzzlesCount.toLocaleString('tr-TR')})`
          : 'Bulmacalar',
      icon: <Puzzle className="w-4 h-4" />,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap border-b border-slate-700/80 gap-1">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 -mb-px transition-colors ${
              active === id ? `${a.active} ${a.bar}` : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/40'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {active === 'stats' ? statsContent : active === 'puzzles' ? puzzlesContent : gamesContent}
    </div>
  );
};

export default PlatformViewTabs;
