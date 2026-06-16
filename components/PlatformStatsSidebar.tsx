import React from 'react';
import { ChevronRight } from 'lucide-react';

export type PlatformStatsNavItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  rating?: number | null;
};

type PlatformStatsSidebarProps = {
  items: PlatformStatsNavItem[];
  active: string;
  onChange: (id: string) => void;
  accent?: 'sky' | 'emerald';
  title?: string;
};

const ACCENT: Record<'sky' | 'emerald', { active: string; rating: string }> = {
  sky: { active: 'bg-sky-500/15 text-sky-300 border-sky-500/40', rating: 'text-sky-400' },
  emerald: { active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', rating: 'text-emerald-400' },
};

const PlatformStatsSidebar: React.FC<PlatformStatsSidebarProps> = ({
  items,
  active,
  onChange,
  accent = 'emerald',
  title = 'İstatistikler',
}) => {
  const a = ACCENT[accent];
  if (items.length === 0) return null;

  return (
    <aside className="w-full lg:w-56 shrink-0">
      <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-700/60 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
        </div>
        <nav className="p-1.5 space-y-0.5">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm font-medium transition-colors border ${
                  isActive
                    ? a.active
                    : 'text-slate-400 border-transparent hover:bg-slate-700/40 hover:text-slate-200'
                }`}
              >
                {item.icon ? <span className="shrink-0 opacity-90">{item.icon}</span> : null}
                <span className="truncate flex-1">{item.label}</span>
                {item.rating != null && item.rating > 0 ? (
                  <span className={`text-xs font-black tabular-nums ${isActive ? a.rating : 'text-slate-500'}`}>
                    {item.rating}
                  </span>
                ) : null}
                {isActive ? <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" /> : null}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default PlatformStatsSidebar;
