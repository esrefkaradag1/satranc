import React from 'react';
import { CheckCircle2, Clock, Play, CircleDashed, RotateCcw, ChevronRight } from 'lucide-react';

export interface StudentProgressCardStat {
  studentId: string;
  name: string;
  initials: string;
  correct: number;
  wrong: number;
  points: number;
  timeSeconds: number;
  progress: number;
  status: 'Tamamlandı' | 'Devam Ediyor' | 'Başlamadı';
  dailyGoalDone?: boolean;
  todayGames?: number;
  todayPuzzleSolved?: number;
  todayPuzzleAccuracy?: number;
  dailyGameTarget?: number;
  dailyPuzzleTarget?: number;
  minPuzzleAccuracyPct?: number;
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
}

const STATUS_META = {
  Tamamlandı: {
    icon: CheckCircle2,
    pill: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
    ring: 'stroke-emerald-400',
    bar: 'from-emerald-500 to-teal-400',
  },
  'Devam Ediyor': {
    icon: Play,
    pill: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',
    ring: 'stroke-amber-400',
    bar: 'from-indigo-500 to-violet-500',
  },
  Başlamadı: {
    icon: CircleDashed,
    pill: 'bg-slate-500/15 text-slate-400 ring-slate-500/20',
    ring: 'stroke-slate-600',
    bar: 'from-slate-600 to-slate-500',
  },
} as const;

type Props = {
  stat: StudentProgressCardStat;
  showDailyTracking?: boolean;
  onClick?: () => void;
  onReset?: () => void;
};

function ProgressRing({ progress, status }: { progress: number; status: StudentProgressCardStat['status'] }) {
  const meta = STATUS_META[status];
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          className={meta.ring}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white">
        %{progress}
      </span>
    </div>
  );
}

export const StudentProgressCard: React.FC<Props> = ({
  stat,
  showDailyTracking,
  onClick,
  onReset,
}) => {
  const meta = STATUS_META[stat.status];
  const StatusIcon = meta.icon;
  const hasDailyTargets = (stat.dailyGameTarget ?? 0) > 0 || (stat.dailyPuzzleTarget ?? 0) > 0;
  const accuracy = stat.correct + stat.wrong > 0
    ? Math.round((stat.correct / (stat.correct + stat.wrong)) * 100)
    : null;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-[#1a2332]/90 overflow-hidden transition-all duration-300 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5 cursor-pointer"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-4 flex-1">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/80 to-violet-700/80 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-md shadow-indigo-900/30">
            {stat.initials}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white truncate leading-tight">{stat.name}</h4>
            <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ring-1 ${meta.pill}`}>
              <StatusIcon className="w-3 h-3" />
              {stat.status}
            </span>
          </div>
          <ProgressRing progress={stat.progress} status={stat.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Doğru', value: stat.correct, color: 'text-emerald-400' },
            { label: 'Yanlış', value: stat.wrong, color: 'text-rose-400' },
            { label: 'Puan', value: stat.points, color: 'text-indigo-300' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/[0.03] border border-white/[0.04] px-2 py-2 text-center">
              <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">{item.label}</p>
              <p className={`text-lg font-black tabular-nums mt-0.5 ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${meta.bar} transition-all duration-500`}
            style={{ width: `${stat.progress}%` }}
          />
        </div>

        {accuracy !== null && stat.status !== 'Başlamadı' && (
          <p className="mt-2 text-[10px] text-slate-500">
            Doğruluk <span className="text-slate-300 font-semibold">%{accuracy}</span>
          </p>
        )}

        {showDailyTracking && hasDailyTargets && (
          <div className={`mt-2 text-[10px] font-medium leading-relaxed ${stat.dailyGoalDone ? 'text-emerald-400/90' : 'text-slate-500'}`}>
            Maç {stat.todayGames ?? 0}/{stat.dailyGameTarget ?? 0}
            {(stat.dailyPuzzleTarget ?? 0) > 0 && (
              <> · Bulmaca {stat.todayPuzzleSolved ?? 0}/{stat.dailyPuzzleTarget ?? 0}</>
            )}
            {(stat.dailyPuzzleTarget ?? 0) > 0 && (
              <> · %{Math.round(stat.todayPuzzleAccuracy ?? 0)} doğruluk</>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between border-t border-white/[0.04] bg-black/20">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">{formatTime(stat.timeSeconds)}</span>
        </div>
        <div className="flex items-center gap-1">
          {onReset && stat.status !== 'Başlamadı' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Denemeleri sıfırla"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-500 group-hover:text-indigo-300 transition-colors">
            Detay
            <ChevronRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </span>
        </div>
      </div>
    </div>
  );
};
