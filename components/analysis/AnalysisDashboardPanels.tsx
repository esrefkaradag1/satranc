import React, { useMemo, useState } from 'react';
import {
  RefreshCw,
  ExternalLink,
  BookOpen,
  GitCompare,
  ChevronDown,
  ChevronUp,
  Target,
  Swords,
  AlertCircle,
} from 'lucide-react';
import type { Student } from '../../types';
import type { OpeningStat, PlatformSkillResult, SkillKey, TempoStat } from '../../lib/platformSkillAnalysis';
import {
  SKILL_TRAINING_TIPS,
  buildRecentGamesList,
  chessComProfileUrl,
  lichessProfileUrl,
  resultColor,
  resultLabel,
  type GameResult,
  type RecentGameRow,
} from '../../lib/analysisDashboardUtils';

const SKILL_LABELS: Record<SkillKey, string> = {
  endgame: 'Oyun Sonu',
  tactics: 'Taktik',
  opening: 'Açılış',
  strategy: 'Strateji',
};

const SKILL_COLORS: Record<SkillKey, string> = {
  endgame: 'bg-rose-500',
  tactics: 'bg-emerald-500',
  opening: 'bg-indigo-500',
  strategy: 'bg-amber-500',
};

export function AnalysisActionBar({
  student,
  platformLoading,
  onRefresh,
  compareAcademy,
  onToggleCompare,
  onAssignHomework,
}: {
  student: Student;
  platformLoading: boolean;
  onRefresh: () => void;
  compareAcademy: boolean;
  onToggleCompare: () => void;
  onAssignHomework: () => void;
}) {
  const hasLichess = !!student.lichessUsername?.trim();
  const hasChessCom = !!student.chessComUsername?.trim();

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-white/10 bg-black/25">
      <button
        type="button"
        onClick={onRefresh}
        disabled={platformLoading}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${platformLoading ? 'animate-spin' : ''}`} />
        Veriyi yenile
      </button>
      <button
        type="button"
        onClick={onToggleCompare}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
          compareAcademy
            ? 'bg-indigo-600/30 border-indigo-500/40 text-indigo-100'
            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
        }`}
      >
        <GitCompare className="w-3.5 h-3.5" />
        Akademi ile karşılaştır
      </button>
      <button
        type="button"
        onClick={onAssignHomework}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-bold text-violet-100"
      >
        <BookOpen className="w-3.5 h-3.5" />
        Ödev ata
      </button>
      <div className="flex-1" />
      {hasLichess && (
        <a
          href={lichessProfileUrl(student.lichessUsername!)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-[10px] font-black uppercase tracking-wider text-sky-300"
        >
          Lichess <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {hasChessCom && (
        <a
          href={chessComProfileUrl(student.chessComUsername!)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#81b64c]/10 hover:bg-[#81b64c]/20 border border-[#81b64c]/25 text-[10px] font-black uppercase tracking-wider text-[#a8d47a]"
        >
          Chess.com <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {!hasLichess && !hasChessCom && (
        <span className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-amber-400/90">
          <AlertCircle className="w-3.5 h-3.5" />
          Platform kullanıcı adı eksik — öğrenci kartından ekleyin
        </span>
      )}
    </div>
  );
}

export function AnalysisKpiStrip({
  totalGames,
  winRate,
  homeworkAccuracy,
  platformGames,
  hasPlatformData,
}: {
  totalGames: number;
  winRate: number | null;
  homeworkAccuracy: number;
  platformGames: number;
  hasPlatformData: boolean;
}) {
  const items = [
    { label: 'Analiz edilen oyun', value: String(totalGames || platformGames), accent: 'text-white' },
    { label: 'Win rate', value: winRate != null ? `%${winRate}` : '—', accent: 'text-emerald-300' },
    { label: 'Ödev doğruluk', value: `%${homeworkAccuracy}`, accent: 'text-indigo-300' },
    {
      label: 'Veri kaynağı',
      value: hasPlatformData ? 'Platform + ödev' : 'Yalnızca ödev',
      accent: 'text-teal-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{item.label}</p>
          <p className={`text-lg font-black mt-1 ${item.accent}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function InteractiveSkillPanel({
  skills,
  academySkills,
  compareAcademy,
  platformAnalysis,
  focusSkill,
  onFocusSkill,
  onGenerateForSkill,
  aiLoading,
}: {
  skills: Record<SkillKey, number>;
  academySkills: Record<SkillKey, number>;
  compareAcademy: boolean;
  platformAnalysis: PlatformSkillResult | null;
  focusSkill: SkillKey | null;
  onFocusSkill: (key: SkillKey | null) => void;
  onGenerateForSkill: (key: SkillKey) => void;
  aiLoading: boolean;
}) {
  const weakest = useMemo(
    () => (Object.entries(skills) as [SkillKey, number][]).sort((a, b) => a[1] - b[1])[0],
    [skills],
  );

  const drilldown = useMemo(() => {
    if (!focusSkill || !platformAnalysis) return null;
    if (focusSkill === 'opening') {
      return platformAnalysis.openingStats.slice(0, 5).map((o) => ({
        title: o.name,
        meta: `${o.played} maç · %${o.winRate} galibiyet`,
      }));
    }
    if (focusSkill === 'strategy' || focusSkill === 'tactics') {
      return platformAnalysis.tempoStats.slice(0, 5).map((t) => ({
        title: t.speed,
        meta: `${t.games} maç · %${t.winRate} galibiyet`,
      }));
    }
    return [
      {
        title: SKILL_TRAINING_TIPS[focusSkill].focus,
        meta: SKILL_TRAINING_TIPS[focusSkill].homework,
      },
    ];
  }, [focusSkill, platformAnalysis]);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {(Object.entries(SKILL_LABELS) as [SkillKey, string][]).map(([key, label], idx) => {
          const active = focusSkill === key;
          const isWeakest = weakest[0] === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFocusSkill(active ? null : key)}
              className={`w-full text-left rounded-xl border p-3 transition-all ${
                active
                  ? 'border-indigo-500/40 bg-indigo-500/10'
                  : 'border-white/5 bg-black/15 hover:border-white/15 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  {label}
                  {isWeakest && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-black">
                      ÖNCELİK
                    </span>
                  )}
                </span>
                <span className="text-xs font-black text-white">%{skills[key]}</span>
              </div>
              <div className="relative h-2 w-full bg-black/30 rounded-full overflow-hidden border border-white/5">
                {compareAcademy && (
                  <div
                    className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
                    style={{ width: `${academySkills[key]}%` }}
                    title={`Akademi ortalaması %${academySkills[key]}`}
                  />
                )}
                <div
                  className={`relative h-full ${SKILL_COLORS[key]} transition-all duration-700`}
                  style={{ width: `${skills[key]}%`, transitionDelay: `${idx * 80}ms` }}
                />
              </div>
              {compareAcademy && (
                <p className="text-[9px] text-slate-500 mt-1.5">Akademi ort: %{academySkills[key]}</p>
              )}
            </button>
          );
        })}
      </div>

      {focusSkill && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              {SKILL_LABELS[focusSkill]} detayı
            </p>
            <button
              type="button"
              onClick={() => onGenerateForSkill(focusSkill)}
              disabled={aiLoading}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              AI plan üret
            </button>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-semibold">Öneri:</span>{' '}
            {SKILL_TRAINING_TIPS[focusSkill].homework}
          </p>
          {drilldown && drilldown.length > 0 ? (
            <ul className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {drilldown.map((row, i) => (
                <li key={i} className="flex justify-between gap-3 text-xs py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-slate-200 font-medium truncate">{row.title}</span>
                  <span className="text-slate-500 shrink-0">{row.meta}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Platform verisi yüklendiğinde detaylar burada görünür.</p>
          )}
        </div>
      )}
    </div>
  );
}

function GameDot({
  result,
  url,
  title,
}: {
  result: GameResult;
  url: string;
  title: string;
}) {
  if (!url) {
    return <div className={`w-3 h-3 rounded-md ${resultColor(result)}`} title={title} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`w-3 h-3 rounded-md block transition-transform hover:scale-125 ${resultColor(result)}`}
    />
  );
}

export function PlatformAnalysisCard({
  platform,
  username,
  profileUrl,
  rapidRating,
  winRate,
  games,
  loading,
  accentClass,
  borderClass,
  icon,
}: {
  platform: 'lichess' | 'chesscom';
  username?: string;
  profileUrl?: string;
  rapidRating: number | string;
  winRate: number | null;
  games: RecentGameRow[];
  loading: boolean;
  accentClass: string;
  borderClass: string;
  icon: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const platformGames = games.filter((g) => g.platform === platform);
  const title = platform === 'lichess' ? 'Lichess Analizi' : 'Chess.com Analizi';

  return (
    <div className={`${accentClass} backdrop-blur-xl p-6 sm:p-8 rounded-[2rem] border ${borderClass} shadow-2xl space-y-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <div className="min-w-0">
            <h4 className="text-xs font-black text-white uppercase tracking-widest">{title}</h4>
            <p className="text-[10px] font-bold tracking-tighter uppercase truncate">{username || 'Tanımsız'}</p>
          </div>
        </div>
        {profileUrl && username && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-2 rounded-lg bg-black/20 hover:bg-black/30 text-slate-300"
            title="Profili aç"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center text-slate-400 text-sm">Yükleniyor…</div>
      ) : username ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Rapid Rating</p>
              <p className="text-2xl font-black text-white tracking-tighter">{rapidRating}</p>
            </div>
            <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Galibiyet Oranı</p>
              <p className="text-2xl font-black tracking-tighter">{winRate != null ? `%${winRate}` : '—'}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-black/20 border border-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Son maçlar ({platformGames.length})
              </p>
              <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
                {platformGames.slice(0, 10).map((g) => (
                  <GameDot
                    key={g.id}
                    result={g.result}
                    url={g.url}
                    title={`${resultLabel(g.result)} · ${g.dateLabel}${g.opening ? ` · ${g.opening}` : ''}`}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-wider text-slate-300"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Listeyi gizle' : 'Maç listesini göster'}
            </button>
            {expanded && (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {platformGames.length === 0 ? (
                  <li className="text-xs text-slate-500 py-2 text-center">Maç bulunamadı</li>
                ) : (
                  platformGames.map((g) => (
                    <li key={g.id}>
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-xs group"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Swords className={`w-3.5 h-3.5 shrink-0 ${g.result === 'win' ? 'text-emerald-400' : g.result === 'draw' ? 'text-slate-400' : 'text-rose-400'}`} />
                          <span className="text-slate-300 truncate">
                            {g.opening || g.opponent || 'Maç'}
                          </span>
                        </span>
                        <span className="text-slate-500 shrink-0 group-hover:text-slate-300">
                          {g.dateLabel}
                          {g.rating ? ` · ${g.rating}` : ''}
                        </span>
                      </a>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="text-[10px] text-slate-600 font-bold uppercase py-8 text-center tracking-widest">
          Kayıtlı profil bulunamadı
        </p>
      )}
    </div>
  );
}

export function useRecentGames(
  lichessGames: Parameters<typeof buildRecentGamesList>[0],
  chessComGames: Parameters<typeof buildRecentGamesList>[1],
  lichessUsername?: string,
  chessComUsername?: string,
) {
  return useMemo(
    () => buildRecentGamesList(lichessGames, chessComGames, lichessUsername, chessComUsername, 20),
    [lichessGames, chessComGames, lichessUsername, chessComUsername],
  );
}

export type { OpeningStat, TempoStat };
