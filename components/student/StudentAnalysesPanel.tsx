import React, { useMemo, useState } from 'react';
import {
  BarChart3, Sparkles, X, Loader2, FileText, ChevronRight,
} from 'lucide-react';
import type { CoachAiReport, HomeworkAssignment, PerformanceAnalysis, Student } from '../../types';
import { categoryBadgeClass, getAnalysisCategories } from '../../lib/performanceAnalysisUtils';
import { AiCoachInsightPanel } from '../analysis/AiInsightCards';

type Section = 'performance' | 'coach' | 'homework';

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

export const StudentAnalysesPanel: React.FC<Props> = ({
  student,
  viewAs,
  studentAnalyses,
  studentCoachAiReports,
  studentHomeworksWithAttempts,
  homeworks,
  homeworkAttempts,
  formatDateTR: formatDateProp,
  onGenerateHomeworkReport,
}) => {
  const fmt = formatDateProp ?? formatDateTR;
  const [section, setSection] = useState<Section>('performance');
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

  const renderAnalysisModal = () => {
    if (!selectedAnalysis) return null;
    const categories = getAnalysisCategories(selectedAnalysis);
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedAnalysis(null)}>
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
        <div
          className="relative w-full max-w-2xl max-h-[92vh] bg-[#1e293b] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-white">{selectedAnalysis.branch}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{fmt(selectedAnalysis.analysisDate)}</p>
            </div>
            <button type="button" onClick={() => setSelectedAnalysis(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedCoachReport(null)}>
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
        <div
          className="relative w-full max-w-3xl max-h-[92vh] bg-[#1e293b] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
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
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-sm text-slate-300 mb-4">{selectedCoachReport.summary}</p>
            <AiCoachInsightPanel eksiklikler={selectedCoachReport.eksiklikler} hamleler={selectedCoachReport.hamleler} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ['performance', 'Performans', BarChart3, counts.performance],
          ['coach', viewAs === 'parent' ? 'Antrenör AI' : 'AI Raporları', Sparkles, counts.coach],
          ['homework', 'Ödev AI', Sparkles, counts.homework],
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
        <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-black text-white">Performans Analizleri</span>
          </div>
          <div className="p-4 sm:p-5">
            {studentAnalyses.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
                <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Henüz performans analizi yok.</p>
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
                      <h4 className="mt-3 text-sm font-bold text-white truncate">{a.branch}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{fmt(a.analysisDate)}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {categories.slice(0, 3).map((c, idx) => (
                          <span key={c.id} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${categoryBadgeClass(idx)}`}>
                            {c.value}
                          </span>
                        ))}
                        {categories.length > 3 && (
                          <span className="text-[9px] text-slate-500">+{categories.length - 3}</span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FileText className="w-3 h-3" />
                        Detayı aç
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'coach' && (
        <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/60 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <span className="text-sm font-black text-white">
              {viewAs === 'parent' ? 'Antrenör AI Raporları (Veli)' : 'Antrenör AI Raporları'}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            {studentCoachAiReports.length === 0 ? (
              <div className="py-12 text-center rounded-xl bg-slate-900/30 border border-slate-700/50">
                <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Henüz paylaşılmış AI raporu yok.</p>
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
                      Raporu aç
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            )}
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
            <p className="text-xs text-slate-400">Ödev denemelerinize göre AI ile eksiklik ve hamle analizi oluşturulur.</p>
            {studentHomeworksWithAttempts.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">Ödev denemesi bulunamadı. Ödev yaptıktan sonra rapor alabilirsiniz.</p>
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
