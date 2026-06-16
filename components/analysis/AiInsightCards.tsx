import React, { useMemo, useState } from 'react';
import { AlertTriangle, ListChecks, TrendingDown } from 'lucide-react';
import { parseInsightItems, type InsightItem } from '../../lib/parseAiInsightText';

function percentBarColor(value: number): string {
  if (value >= 70) return 'bg-emerald-500';
  if (value >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

function FormattedLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-[13px] text-slate-300 leading-[1.65] text-left break-words">
      {parts.map((part, i) => {
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) {
          return (
            <span key={i} className="font-semibold text-white">
              {bold[1]}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function InsightCard({
  item,
  index,
  accent,
}: {
  item: InsightItem;
  index: number;
  accent: 'rose' | 'sky';
}) {
  const accentLine = accent === 'rose' ? 'border-l-rose-400' : 'border-l-sky-400';
  const badge =
    accent === 'rose'
      ? 'bg-rose-500/15 text-rose-200 border-rose-500/30'
      : 'bg-sky-500/15 text-sky-200 border-sky-500/30';

  return (
    <article className={`rounded-xl border border-white/8 bg-white/[0.03] border-l-[3px] ${accentLine} p-4`}>
      <div className="flex items-start gap-3 text-left">
        <span
          className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-black ${badge}`}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2.5">
          <h5 className="text-[15px] font-bold text-white leading-snug text-left">{item.title}</h5>
          {item.percent != null ? (
            <div className="space-y-1.5 max-w-md">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Beceri</span>
                <span className="text-slate-300">%{item.percent}</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className={`h-full rounded-full ${percentBarColor(item.percent)}`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          ) : null}
          <FormattedLine text={item.body} />
        </div>
      </div>
    </article>
  );
}

interface AiInsightSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  text: string;
  accent: 'rose' | 'sky';
}

export const AiInsightSection: React.FC<AiInsightSectionProps> = ({
  title,
  subtitle,
  icon,
  text,
  accent,
}) => {
  const items = useMemo(() => parseInsightItems(text), [text]);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
      <header className="px-5 py-4 border-b border-white/8 flex items-center gap-3 bg-white/[0.02]">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
            accent === 'rose'
              ? 'bg-rose-500/12 text-rose-300'
              : 'bg-sky-500/12 text-sky-300'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 text-left">
          <h4 className="text-sm font-bold text-white">{title}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <span className="ml-auto shrink-0 text-[10px] font-bold text-slate-500 bg-white/5 px-2.5 py-1 rounded-full">
          {items.length} madde
        </span>
      </header>
      <div className="p-4 md:p-5 space-y-3">
        {items.map((item, idx) => (
          <InsightCard key={`${item.title}-${idx}`} item={item} index={idx} accent={accent} />
        ))}
      </div>
    </section>
  );
};

interface AiCoachInsightPanelProps {
  eksiklikler: string;
  hamleler: string;
}

export const AiCoachInsightPanel: React.FC<AiCoachInsightPanelProps> = ({ eksiklikler, hamleler }) => {
  const [tab, setTab] = useState<'eksiklikler' | 'plan'>('eksiklikler');

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex rounded-xl bg-black/30 p-1 border border-white/8 gap-1">
        <button
          type="button"
          onClick={() => setTab('eksiklikler')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-colors ${
            tab === 'eksiklikler'
              ? 'bg-rose-500/20 text-rose-100 border border-rose-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Eksiklikler
        </button>
        <button
          type="button"
          onClick={() => setTab('plan')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-colors ${
            tab === 'plan'
              ? 'bg-sky-500/20 text-sky-100 border border-sky-500/25'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListChecks className="w-4 h-4 shrink-0" />
          Çalışma planı
        </button>
      </div>

      {tab === 'eksiklikler' ? (
        <AiInsightSection
          title="Geliştirilmesi gereken alanlar"
          subtitle="Platform ve ödev verisine göre"
          icon={<AlertTriangle className="w-4 h-4" />}
          text={eksiklikler}
          accent="rose"
        />
      ) : (
        <AiInsightSection
          title="Haftalık çalışma önerileri"
          subtitle="Somut adımlar ve odak konular"
          icon={<ListChecks className="w-4 h-4" />}
          text={hamleler}
          accent="sky"
        />
      )}
    </div>
  );
};

interface SkillSnapshotProps {
  skills: Record<string, number>;
  labels: Record<string, string>;
  focusLabel: string;
  focusPercent: number;
}

export const SkillSnapshot: React.FC<SkillSnapshotProps> = ({
  skills,
  labels,
  focusLabel,
  focusPercent,
}) => (
  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
    <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-300 mb-4">
      <TrendingDown className="w-4 h-4 shrink-0" />
      <span>
        Öncelik: <span className="text-white">{focusLabel}</span> · %{focusPercent}
      </span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {Object.entries(skills).map(([key, value]) => (
        <div key={key} className="rounded-xl bg-white/[0.04] border border-white/6 px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
              {labels[key] ?? key}
            </span>
            <span className="text-sm font-black text-white">%{value}</span>
          </div>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${percentBarColor(value)}`}
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);
