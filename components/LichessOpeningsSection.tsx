import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import type { LichessGame } from '../services/chessPlatformService';
import { summarizeLichessOpenings } from '../lib/lichessInsights';

type Props = {
  games: LichessGame[];
  username: string;
  limit?: number;
};

const LichessOpeningsSection: React.FC<Props> = ({ games, username, limit = 8 }) => {
  const rows = useMemo(
    () => summarizeLichessOpenings(games, username).slice(0, limit),
    [games, username, limit],
  );

  if (rows.length === 0) return null;

  const maxCount = rows[0]?.count ?? 1;

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-black text-white">Açılış dağılımı</h3>
        <span className="text-[10px] text-slate-500 ml-auto">Son {games.length} maç</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="text-slate-300 truncate">{row.name}</span>
              <span className="text-slate-500 tabular-nums shrink-0">{row.count} maç</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500/70"
                style={{ width: `${Math.max(8, (row.count / maxCount) * 100)}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
              <span className="text-emerald-400/90">{row.wins} G</span>
              <span>{row.draws} B</span>
              <span className="text-rose-400/90">{row.losses} M</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LichessOpeningsSection;
