import React, { useMemo, useState } from 'react';
import {
  BarChart3, Brain, ChevronRight, ExternalLink, FileText, Loader2, Sparkles, Trophy, X,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CoachAiReport, HomeworkAssignment, PerformanceAnalysis, Student } from '../../types';
import { categoryBadgeClass, getAnalysisCategories } from '../../lib/performanceAnalysisUtils';
import { AiCoachInsightPanel, SkillSnapshot } from '../analysis/AiInsightCards';
import type { ChessComGame, ChessComPlayer, ChessComStats, LichessGame, LichessUserProfile } from '../../services/chessPlatformService';
import type { PlatformDayStats } from '../../lib/homeworkPlatformUtils';
import { StudentPlatformAnalysisSection } from './StudentPlatformAnalysisSection';

type Section = 'performance' | 'coach' | 'homework';

const SKILL_LABELS: Record<'endgame' | 'tactics' | 'opening' | 'strategy', string> = {
  endgame: 'Oyun Sonu',
  tactics: 'Taktik',
  opening: 'Acilis',
  strategy: 'Strateji',
};

type Props = {
  student: Student;
  viewAs: 'student' | 'parent';
  studentAnalyses: PerformanceAnalysis[];
  studentCoachAiReports: CoachAiReport[];
  studentHomeworksWithAttempts: HomeworkAssignment[];
  homeworks: HomeworkAssignment[];
  homeworkAttempts: Array<{
    studentId: string;
    homeworkId: string;
    puzzleTitle: string;
    correct: boolean;
    movesPlayed: string[];
    solutionMoves: string[];
  }>;
  weekPlatformStatsByDate: Record<string, PlatformDayStats>;
  platformStatsFetched: boolean;
  externalStatsNote: string | null;
  loadingPlatformOverview: boolean;
  loadingPlatformProfiles?: boolean;
  platformLoading?: boolean;
  lichessGames?: LichessGame[];
  chessComGames?: ChessComGame[];
  lichessProfile: LichessUserProfile | null;
  chessComProfile: ChessComPlayer | null;
  chessComStats: ChessComStats | null;
  formatDateTR: (iso?: string) => string;
  onGenerateHomeworkReport: (homeworkId: string) => Promise<{ eksiklikler: string; hamleler: string } | null>;
};

function formatDateTR(iso?: string) {
  if (!iso?.trim()) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function avgCategoryScore(categories: ReturnType<typeof getAnalysisCategories>): number {
  if (categories.length === 0) return 0;
  const sum = categories.reduce((s, c) => s + (Number(c.value) || 0), 0);
  return Math.round((sum / categories.length) * 10) / 10;
}

function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-amber-400';
  return 'text-rose-400';
}

function shortDayLabel(iso: string): string {
  return iso.length >= 10 ? iso.slice(5) : iso;
}

export const StudentAnalysesPanel: React.FC<Props> = ({
  student,
  viewAs,
  studentAnalyses,
  studentCoachAiReports,
  studentHomeworksWithAttempts,
  homeworks,
  homeworkAttempts,
  weekPlatformStatsByDate,
  platformStatsFetched,
  externalStatsNote,
  loadingPlatformOverview,
  loadingPlatformProfiles = false,
  platformLoading = false,
  lichessGames = [],
  chessComGames = [],
  lichessProfile,
  chessComProfile,
  chessComStats,
  formatDateTR: formatDateProp,
  onGenerateHomeworkReport,
}) => {
  const fmt = formatDateProp ?? formatDateTR;
  const parentLite = viewAs === 'parent';
  const [section, setSection] = useState<Section>(() =>
    viewAs === 'parent' && studentCoachAiReports.length > 0 ? 'coach' : 'performance',
  );
  const [selectedAnalysis, setSelectedAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [selectedCoachReport, setSelectedCoachReport] = useState<CoachAiReport | null>(null);
  const [aiReportHwId, setAiReportHwId] = useState<string | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReportResult, setAiReportResult] = useState<{ eksiklikler: string; hamleler: string } | null>(null);

  const counts = useMemo(() => ({
    performance: studentAnalyses.length,
    coach: studentCoachAiReports.length,
    homework: studentHomeworksWithAttempts.length,
  }), [studentAnalyses.length, studentCoachAiReports.length, studentHomeworksWithAttempts.length]);

  const latestAnalysis = studentAnalyses[0] ?? null;
  const latestCoachReport = studentCoachAiReports[0] ?? null;

  const studentHomeworkAttempts = useMemo(
    () => homeworkAttempts.filter((a) => a.studentId === student.id),
    [homeworkAttempts, student.id],
  );

  const homeworkSummary = useMemo(() => {
    const total = studentHomeworkAttempts.length;
    const correct = studentHomeworkAttempts.filter((a) => a.correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, accuracy };
  }, [studentHomeworkAttempts]);

  const platformActivity = useMemo(() => {
    return Object.entries(weekPlatformStatsByDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, stats]) => ({
        day: shortDayLabel(day),
        games: stats.games,
        puzzles: stats.puzzleSolved,
      }));
  }, [weekPlatformStatsByDate]);

  const platformSummary = useMemo(() => {
    const totals = Object.values(weekPlatformStatsByDate).reduce(
      (acc, stats) => {
        acc.games += stats.games;
        acc.puzzleSolved += stats.puzzleSolved;
        acc.puzzlePassed += stats.puzzlePassed;
        return acc;
      },
      { games: 0, puzzleSolved: 0, puzzlePassed: 0 },
    );
    const puzzleAccuracy = totals.puzzleSolved > 0 ? Math.round((totals.puzzlePassed / totals.puzzleSolved) * 100) : 0;
    return {
      totalGames: totals.games,
      puzzleSolved: totals.puzzleSolved,
      puzzlePassed: totals.puzzlePassed,
      puzzleAccuracy,
    };
  }, [weekPlatformStatsByDate]);

  const skillSnapshot = useMemo(() => {
    if (latestCoachReport?.skillSnapshot) {
      return {
        mode: 'coach' as const,
        items: (Object.entries(SKILL_LABELS) as Array<[keyof typeof SKILL_LABELS, string]>).map(([key, label]) => ({
          key,
          label,
          value: Math.max(0, Math.min(100, Math.round(Number(latestCoachReport.skillSnapshot?.[key] ?? 0)))),
        })),
      };
    }
    if (latestAnalysis) {
      return {
        mode: 'analysis' as const,
        items: getAnalysisCategories(latestAnalysis).slice(0, 4).map((category) => ({
          key: category.id,
          label: category.label,
          value: Math.max(0, Math.min(100, Math.round((Number(category.value) || 0) * 10))),
        })),
      };
    }
    return null;
  }, [latestCoachReport, latestAnalysis]);

  const skillSnapshotRecord = useMemo(() => {
    if (!skillSnapshot?.items.length) return null;
    return Object.fromEntries(skillSnapshot.items.map((item) => [item.key, item.value]));
  }, [skillSnapshot]);

  const weakestSkill = useMemo(() => {
    if (!skillSnapshot?.items.length) return null;
    return [...skillSnapshot.items].sort((a, b) => a.value - b.value)[0] ?? null;
  }, [skillSnapshot]);

  const performanceLeadText = latestCoachReport?.summary
    || latestAnalysis?.recommendations
    || latestAnalysis?.generalEvaluation
    || `${student.name} icin platform, odev ve performans kayitlari ogrenci gorusunde birlestirildi.`;

  const renderAnalysisModal = () => {
    if (!selectedAnalysis) return null;
    const categories = getAnalysisCategories(selectedAnalysis);
    return (
      <div className="modal-overlay z-50" onClick={() => setSelectedAnalysis(null)}>
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
        <div
          className="modal-panel relative w-full max-w-2xl bg-[#1e293b] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-white">Kişisel Performans Analizi</h3>
              <p className="text-xs text-slate-400 mt-0.5">{fmt(selectedAnalysis.analysisDate)}</p>
            </div>
            <button type="button" onClick={() => setSelectedAnalysis(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="modal-scroll-body p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c, idx) => (
                <div key={c.id} className="rounded-xl bg-slate-900/50 border border-white/5 p-3 text-center">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide line-clamp-2">{c.label}</p>
                  <p className={`text-2xl font-black mt-1 ${scoreColor(Number(c.value))}`}>{c.value}</p>
                  {c.notes && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{c.notes}</p>}
                </div>
              ))}
            </div>
            {selectedAnalysis.generalEvaluation && (
              <div className="rounded-xl bg-slate-900/40 border border-white/5 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Genel Değerlendirme</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedAnalysis.generalEvaluation}</p>
              </div>
            )}
            {selectedAnalysis.recommendations && (
              <div className="rounded-xl bg-slate-900/40 border border-white/5 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Öneriler</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedAnalysis.recommendations}</p>
              </div>
            )}
            {(selectedAnalysis.shortTermGoal || selectedAnalysis.longTermGoal) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {selectedAnalysis.shortTermGoal && (
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Kısa Vadeli</p>
                    <p className="text-xs text-slate-300">{selectedAnalysis.shortTermGoal}</p>
                  </div>
                )}
                {selectedAnalysis.longTermGoal && (
                  <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
                    <p className="text-[10px] font-bold text-violet-400 uppercase mb-1">Uzun Vadeli</p>
                    <p className="text-xs text-slate-300">{selectedAnalysis.longTermGoal}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCoachModal = () => {
    if (!selectedCoachReport) return null;
    return (
      <div className="modal-overlay z-50" onClick={() => setSelectedCoachReport(null)}>
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
        <div
          className="modal-panel relative w-full max-w-3xl bg-[#1e293b] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-white">{selectedCoachReport.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(selectedCoachReport.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedCoachReport(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="modal-scroll-body p-5">
            <p className="text-sm text-slate-300 mb-4">{selectedCoachReport.summary}</p>
            <AiCoachInsightPanel eksiklikler={selectedCoachReport.eksiklikler} hamleler={selectedCoachReport.hamleler} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {viewAs === 'parent' && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600/10 via-violet-500/5 to-transparent border border-indigo-600/20 p-5 sm:p-6">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            {student.name} — Performans Analizi
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Antrenör değerlendirmeleri, AI raporları ve Lichess / Chess.com profil özeti.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {([
          ['performance', viewAs === 'parent' ? 'Değerlendirme' : 'Performans', BarChart3, counts.performance],
          ['coach', viewAs === 'parent' ? 'Antrenör AI' : 'AI Raporları', Sparkles, counts.coach],
          ...(viewAs === 'parent' ? [] : [['homework', 'Ödev AI', Sparkles, counts.homework] as const]),
        ] as const).map(([key, label, Icon, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              section === key
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : 'bg-slate-800/60 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                section === key ? 'bg-white/20' : 'bg-white/5'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'performance' && (
        <div className="space-y-4">
          {parentLite ? (
            <>
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] px-5 py-4">
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">Antrenör değerlendirmesi</p>
                <p className="text-sm text-slate-100 leading-relaxed">
                  {latestAnalysis?.generalEvaluation?.trim()
                    || latestAnalysis?.recommendations?.trim()
                    || latestCoachReport?.summary
                    || 'Henüz paylaşılmış performans değerlendirmesi yok. Antrenör kayıt ekledikçe burada görünecektir.'}
                </p>
                {latestAnalysis ? (
                  <p className="text-[11px] text-slate-500 mt-2">Son kayıt: {fmt(latestAnalysis.analysisDate)}</p>
                ) : null}
              </div>

              <StudentPlatformAnalysisSection
                student={student}
                lichessProfile={lichessProfile}
                chessComStats={chessComStats}
                lichessGames={lichessGames}
                chessComGames={chessComGames}
                platformLoading={platformLoading}
                homeworkAccuracy={homeworkSummary.accuracy}
              />
            </>
          ) : (
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1b2438]/95 via-[#172033]/90 to-[#0f172a]/95 shadow-2xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-[0.18em]">
                    {viewAs === 'parent' ? 'Performans Özeti' : 'Kapsamli Platform + Odev Analizi'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {viewAs === 'parent' ? 'veli gorunumu' : 'ogrenci gorunumu'}
                  </p>
                </div>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {platformStatsFetched ? 'Lichess + Chess.com + Odev Verisi' : 'Platform verisi bekleniyor'}
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Toplam Oyun</p>
                  <p className="text-3xl font-black text-white mt-1">{platformSummary.totalGames}</p>
                </div>
                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/15 p-4">
                  <p className="text-[10px] text-emerald-200/80 uppercase font-black tracking-widest">Platform Bulmaca</p>
                  <p className="text-3xl font-black text-emerald-300 mt-1">%{platformSummary.puzzleAccuracy}</p>
                </div>
                <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/15 p-4">
                  <p className="text-[10px] text-indigo-200/80 uppercase font-black tracking-widest">Odev Dogruluk</p>
                  <p className="text-3xl font-black text-indigo-200 mt-1">%{homeworkSummary.accuracy}</p>
                </div>
                <div className="rounded-2xl bg-violet-500/10 border border-violet-500/15 p-4">
                  <p className="text-[10px] text-violet-200/80 uppercase font-black tracking-widest">Analiz Kaydi</p>
                  <p className="text-3xl font-black text-violet-200 mt-1">{studentAnalyses.length}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Haftalik Bulmaca</p>
                  <p className="text-sm mt-1 font-black text-white">{platformSummary.puzzleSolved} cozuldu</p>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Lichess</p>
                  <p className="text-sm mt-1 font-black text-white truncate">{lichessProfile?.username || student.lichessUsername || 'Tanimsiz'}</p>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/5 p-4">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Chess.com</p>
                  <p className="text-sm mt-1 font-black text-white truncate">{chessComProfile?.username || student.chessComUsername || 'Tanimsiz'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.06] px-5 py-4">
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">Hizli Ozet</p>
                <p className="text-sm text-slate-100 leading-relaxed">{performanceLeadText}</p>
              </div>

              <div className="h-[240px] w-full bg-black/20 rounded-[1.75rem] p-4 border border-white/5 shadow-inner">
                {loadingPlatformOverview && !platformStatsFetched ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                    <p className="text-xs font-bold uppercase tracking-widest">Platform verisi yukleniyor...</p>
                  </div>
                ) : platformActivity.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={platformActivity}>
                      <defs>
                        <linearGradient id="studentAnalysisActivity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} dy={8} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#fff', fontWeight: 700, fontSize: '12px' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontSize: '10px' }}
                      />
                      <Area type="monotone" dataKey="games" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#studentAnalysisActivity)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                    <BarChart3 className="w-8 h-8 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-300">Henuz platform aktivitesi bulunamadi</p>
                    <p className="text-xs text-slate-500 text-center max-w-md">{externalStatsNote || 'Lichess veya Chess.com verisi geldikce grafik burada gorunecek.'}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-300">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest">Yetenek Dagilimi</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                        {skillSnapshot?.mode === 'coach' ? 'AI + platform' : 'performans analizi'}
                      </p>
                    </div>
                  </div>

                  {skillSnapshotRecord && weakestSkill ? (
                    skillSnapshot.mode === 'coach' ? (
                      <SkillSnapshot
                        skills={skillSnapshotRecord}
                        labels={SKILL_LABELS}
                        focusLabel={weakestSkill.label}
                        focusPercent={weakestSkill.value}
                      />
                    ) : (
                      <div className="space-y-3">
                        {skillSnapshot.items.map((item, idx) => (
                          <div key={item.key} className="rounded-xl bg-white/[0.04] border border-white/6 px-4 py-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{item.label}</span>
                              <span className="text-sm font-black text-white">%{item.value}</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-violet-500' : 'bg-amber-500'}`}
                                style={{ width: `${item.value}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-10 text-center">
                      <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Henuz beceri dagilimi verisi yok.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-300">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest">Platform Kartlari</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">ogrencinin bagli hesaplari</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.04] border border-white/6 p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lichess Analizi</div>
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-black text-white truncate">{lichessProfile?.username || student.lichessUsername || 'Tanimsiz'}</p>
                        <p className="text-xs text-slate-400">Rapid: {lichessProfile?.perfs?.rapid?.rating ?? '—'}</p>
                        <p className="text-xs text-slate-400">Bulmaca: {lichessProfile?.perfs?.puzzle?.rating ?? '—'}</p>
                        <p className="text-xs text-slate-500">Toplam oyun: {lichessProfile?.count?.all?.toLocaleString('tr-TR') ?? '—'}</p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/[0.04] border border-white/6 p-4">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chess.com Analizi</div>
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-black text-white truncate">{chessComProfile?.username || student.chessComUsername || 'Tanimsiz'}</p>
                        <p className="text-xs text-slate-400">Rapid: {chessComStats?.chess_rapid?.last?.rating ?? '—'}</p>
                        <p className="text-xs text-slate-400">Taktik: {chessComStats?.tactics?.highest?.rating ?? '—'}</p>
                        <p className="text-xs text-slate-500">Takipci: {chessComProfile?.followers ?? '—'}</p>
                      </div>
                    </div>
                  </div>

                  {externalStatsNote ? (
                    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
                      {externalStatsNote}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          )}

          <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-black text-white">Performans Analizi Gecmisi</span>
            </div>
            <div className="p-4 sm:p-5">
              {studentAnalyses.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
                  <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Henuz performans analizi yok.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {studentAnalyses.map((a) => {
                    const categories = getAnalysisCategories(a);
                    const avg = avgCategoryScore(categories);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedAnalysis(a)}
                        className="group text-left rounded-xl border border-white/[0.06] bg-slate-800/40 hover:border-indigo-500/30 hover:bg-slate-800/70 p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-5 h-5 text-indigo-400" />
                          </div>
                          <span className={`text-xl font-black tabular-nums ${scoreColor(avg)}`}>{avg}</span>
                        </div>
                        <h4 className="mt-3 text-sm font-bold text-white truncate">Kişisel Performans Analizi</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{fmt(a.analysisDate)}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {categories.slice(0, 3).map((c, idx) => (
                            <span key={c.id} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${categoryBadgeClass(idx)}`}>
                              {c.value}
                            </span>
                          ))}
                          {categories.length > 3 ? <span className="text-[9px] text-slate-500">+{categories.length - 3}</span> : null}
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <FileText className="w-3 h-3" />
                          Detayi ac
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'coach' && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1e293b]/95 via-[#1a2234]/90 to-[#0f172a]/95 shadow-2xl">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/15 blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 blur-[80px] pointer-events-none" />
            <div className="relative z-10 p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
                  <Brain className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white uppercase tracking-tight">Yapay Zeka Antrenor Onerisi</h4>
                  <p className="text-[10px] text-indigo-300/90 font-bold uppercase tracking-[0.2em] mt-1">kisisellestirilmis gelisim plani</p>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.07] px-5 py-4 text-left">
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">Hizli Ozet</p>
                <p className="text-sm md:text-[15px] text-slate-100 leading-relaxed">
                  {latestCoachReport?.summary || latestAnalysis?.recommendations || 'Henuz paylasilmis AI raporu yok. Yeni rapor geldikce burada ogrenciye uygun ozet gosterilecek.'}
                </p>
              </div>

              {latestCoachReport?.skillSnapshot ? (
                <SkillSnapshot
                  skills={{
                    endgame: Math.round(Number(latestCoachReport.skillSnapshot.endgame ?? 0)),
                    tactics: Math.round(Number(latestCoachReport.skillSnapshot.tactics ?? 0)),
                    opening: Math.round(Number(latestCoachReport.skillSnapshot.opening ?? 0)),
                    strategy: Math.round(Number(latestCoachReport.skillSnapshot.strategy ?? 0)),
                  }}
                  labels={SKILL_LABELS}
                  focusLabel={
                    (Object.entries(SKILL_LABELS) as Array<[keyof typeof SKILL_LABELS, string]>)
                      .sort((a, b) => Number(latestCoachReport.skillSnapshot?.[a[0]] ?? 0) - Number(latestCoachReport.skillSnapshot?.[b[0]] ?? 0))[0]?.[1] ?? 'Odak alani'
                  }
                  focusPercent={
                    (Object.keys(SKILL_LABELS) as Array<keyof typeof SKILL_LABELS>)
                      .sort((a, b) => Number(latestCoachReport.skillSnapshot?.[a] ?? 0) - Number(latestCoachReport.skillSnapshot?.[b] ?? 0))
                      .map((key) => Number(latestCoachReport.skillSnapshot?.[key] ?? 0))[0] ?? 0
                  }
                />
              ) : null}

              {latestCoachReport ? (
                <AiCoachInsightPanel eksiklikler={latestCoachReport.eksiklikler} hamleler={latestCoachReport.hamleler} />
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/15 py-12 px-6 text-center">
                  <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-300">Kapsamli AI raporu henuz yok</p>
                  <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                    Antrenor tarafindan paylasilan yeni AI raporlari burada ogrenciye uygun bicimde gosterilecek.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-black text-white">
                {viewAs === 'parent' ? 'Antrenor AI Raporlari (Veli)' : 'Antrenor AI Raporlari'}
              </span>
            </div>
            <div className="p-4 sm:p-5">
              {studentCoachAiReports.length === 0 ? (
                <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
                  <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Henuz paylasilmis AI raporu yok.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {studentCoachAiReports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedCoachReport(report)}
                      className="group text-left rounded-xl border border-white/[0.06] bg-slate-800/40 hover:border-violet-500/30 hover:bg-slate-800/70 p-4 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mb-3">
                        <Sparkles className="w-5 h-5 text-violet-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white line-clamp-2">{report.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {new Date(report.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="mt-2 text-xs text-slate-400 line-clamp-3">{report.summary}</p>
                      <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Raporu ac
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'homework' && (
        <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <span className="text-sm font-black text-white">Ödev AI Raporu</span>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Toplam Deneme</p>
                <p className="mt-1 text-xl font-black text-white">{homeworkSummary.total}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
                <p className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-wider">Dogru</p>
                <p className="mt-1 text-xl font-black text-emerald-300">{homeworkSummary.correct}</p>
              </div>
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-4">
                <p className="text-[10px] font-bold text-violet-300/80 uppercase tracking-wider">Dogruluk</p>
                <p className="mt-1 text-xl font-black text-violet-200">%{homeworkSummary.accuracy}</p>
              </div>
              <div className="rounded-xl bg-slate-900/50 border border-slate-700/50 p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">AI Secili Odev</p>
                <p className="mt-1 text-sm font-black text-white line-clamp-2">
                  {aiReportHwId ? homeworks.find((hw) => hw.id === aiReportHwId)?.title || 'Secili odev' : 'Odev secin'}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">Odev denemelerinize gore AI ile eksiklik ve hamle analizi olusturulur.</p>
            {studentHomeworksWithAttempts.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">Odev denemesi bulunamadi. Odev yaptiktan sonra rapor alabilirsiniz.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {studentHomeworksWithAttempts.map((hw) => {
                    const attemptCount = homeworkAttempts.filter(
                      (a) => a.studentId === student.id && a.homeworkId === hw.id,
                    ).length;
                    const selected = aiReportHwId === hw.id;
                    return (
                      <button
                        key={hw.id}
                        type="button"
                        onClick={() => { setAiReportHwId(hw.id); setAiReportResult(null); }}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          selected
                            ? 'bg-violet-600/20 border-violet-500/40'
                            : 'bg-slate-800/40 border-white/5 hover:border-violet-500/25'
                        }`}
                      >
                        <p className="text-sm font-bold text-white truncate">{hw.title}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{attemptCount} deneme</p>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={aiReportLoading || !aiReportHwId}
                  onClick={async () => {
                    if (!aiReportHwId) return;
                    setAiReportLoading(true);
                    setAiReportResult(null);
                    try {
                      const res = await onGenerateHomeworkReport(aiReportHwId);
                      if (res) setAiReportResult(res);
                    } finally {
                      setAiReportLoading(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold"
                >
                  {aiReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiReportLoading ? 'Rapor oluşturuluyor...' : 'AI Rapor Oluştur'}
                </button>
                {aiReportResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 max-h-64 overflow-y-auto">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Eksiklikler</h4>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{aiReportResult.eksiklikler}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 max-h-64 overflow-y-auto">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Hamleler</h4>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{aiReportResult.hamleler}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {renderAnalysisModal()}
      {renderCoachModal()}
    </div>
  );
};
