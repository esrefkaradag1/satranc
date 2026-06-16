import React, { useMemo, useState } from 'react';
import { ExternalLink, Grid, TrendingUp } from 'lucide-react';
import type { Puzzle } from '../types';
import type { LichessActivity } from '../services/chessPlatformService';
import { lichessActivityPuzzleCount } from '../lib/leaderboardUtils';
import StudentPuzzlePlayModal from './StudentPuzzlePlayModal';

type LichessPuzzlesSectionProps = {
  username?: string;
  dailyPuzzle: Puzzle | null;
  practicePuzzles: Puzzle[];
  loadingDaily?: boolean;
  /** Lichess aktivite akışı — öğrencinin platformda çözdüğü bulmacalar */
  activityRows?: LichessActivity[];
};

/** Lichess bulmaca pratiği — Chess.com Bulmacalar sekmesiyle aynı mantık */
const LichessPuzzlesSection: React.FC<LichessPuzzlesSectionProps> = ({
  username,
  dailyPuzzle,
  practicePuzzles,
  loadingDaily = false,
  activityRows = [],
}) => {
  const [playing, setPlaying] = useState<{ puzzle: Puzzle; openKey: string } | null>(null);

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
          openKey={playing.openKey}
          onClose={() => setPlaying(null)}
        />
      ) : null}
    </div>
  );
};

export default LichessPuzzlesSection;
