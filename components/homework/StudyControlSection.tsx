import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Users, CheckSquare, ExternalLink, UserCircle, Activity, Search, X, Eye } from 'lucide-react';
import type { Student } from '../../types';
import type { Study } from '../../lib/studyTypes';
import { studyDisplayEmoji } from '../../lib/studyUtils';
import { loadStudiesAsync, saveStudyAsync, subscribeToStudies } from '../../studyStorage';
import { normalizeSearchText, searchIncludesText } from '../../lib/searchText';
import { loadStudyEvents, type StudyEvent } from '../../studyEvents';
import { mergeStudyAnalysisEvents } from '../../lib/studyAnalysisEvents';
import { loadStudyPresence, subscribeStudyPresence } from '../../services/studyActions';
import { buildStudyStudentStats, type StudyStudentStat } from '../../lib/studyHomeworkStats';
import { useApp } from '../../AppContext';
import { canShowStudentCounts } from '../../lib/studentCountVisibility';
import { StudyGroupResultsTable } from './StudyGroupResultsTable';
import { StudyChapterReplayPanel } from './StudyChapterReplayPanel';

type Props = {
  students: Student[];
  onOpenStudy?: (studyId: string) => void;
};

export const StudyControlSection: React.FC<Props> = ({ students, onOpenStudy }) => {
  const { auth } = useApp();
  const showStudentCounts = canShowStudentCounts(auth);
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignStudyId, setAssignStudyId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [activeStudyLog, setActiveStudyLog] = useState<{ study: Study; student: Student } | null>(null);
  const [activeStudyEvents, setActiveStudyEvents] = useState<StudyEvent[]>([]);
  const [loadingStudyEvents, setLoadingStudyEvents] = useState(false);
  const [selectedResultsStudyId, setSelectedResultsStudyId] = useState('');
  const [resultsStudyEvents, setResultsStudyEvents] = useState<StudyEvent[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const getVsComputerHistory = (payload: unknown): string[] => {
    if (!payload || typeof payload !== 'object') return [];
    const data = payload as Record<string, unknown>;
    const candidates = [data.vcHistory, data.history, data.moves];
    for (const item of candidates) {
      if (Array.isArray(item)) return item.filter((move): move is string => typeof move === 'string');
    }
    return [];
  };

  const buildPresenceStudyEvents = (study: Study, student: Student, rows: unknown[]): StudyEvent[] => {
    const normalizedRows = rows
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .filter((row) => String(row.user_id ?? '') === String(student.id))
      .filter((row) => {
        const payload = row.payload;
        return !!payload && typeof payload === 'object' && Boolean((payload as Record<string, unknown>).vsComputer);
      })
      .sort((a, b) => String(a.last_seen ?? '').localeCompare(String(b.last_seen ?? '')));

    const liveEvents: StudyEvent[] = [];
    normalizedRows.forEach((row, rowIndex) => {
      const chapterId = String(row.chapter_id ?? '');
      const createdAt = String(row.last_seen ?? new Date().toISOString());
      const history = getVsComputerHistory(row.payload);
      history.forEach((move, moveIndex) => {
        liveEvents.push({
          id: `presence-${study.id}-${student.id}-${chapterId || 'live'}-${rowIndex}-${moveIndex}`,
          studyId: study.id,
          chapterId,
          studentId: String(student.id),
          moveIndex,
          expectedMove: null,
          playedMove: move,
          result: 'correct',
          thinkMs: 0,
          createdAt,
        });
      });
    });

    return liveEvents;
  };

  const mergeVisibleStudyEvents = (persistedEvents: StudyEvent[], liveEvents: StudyEvent[]): StudyEvent[] => {
    const merged: StudyEvent[] = [];
    const seen = new Set<string>();
    for (const event of [...persistedEvents, ...liveEvents]) {
      const key = [
        String(event.studentId ?? ''),
        String(event.chapterId ?? ''),
        String(event.moveIndex ?? 0),
        String(event.playedMove ?? ''),
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
    return merged.sort((a, b) => {
      const createdAtDiff = (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
      if (createdAtDiff !== 0) return createdAtDiff;
      return (a.moveIndex ?? 0) - (b.moveIndex ?? 0);
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadStudiesAsync()
      .then((data) => { if (!cancelled) setStudies(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const unsubscribe = subscribeToStudies((data) => {
      if (!cancelled) {
        setStudies(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (students.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (selectedStudentId && students.some((student) => student.id === selectedStudentId)) return;
    setSelectedStudentId(students[0]?.id ?? '');
  }, [students, selectedStudentId]);

  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  const relevantStudies = useMemo(() => {
    return studies.filter((st) =>
      st.memberIds.some((id) => studentIds.has(id)),
    );
  }, [studies, studentIds]);

  const unassignedStudies = useMemo(() => {
    return studies.filter((st) =>
      !st.memberIds.some((id) => studentIds.has(id)),
    );
  }, [studies, studentIds]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const filteredStudentOptions = useMemo(() => {
    const q = normalizeSearchText(studentSearch);
    return students
      .filter((student) => !q || searchIncludesText(student.name, q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [students, studentSearch]);

  const selectedResultsStudy = useMemo(
    () => relevantStudies.find((s) => s.id === selectedResultsStudyId) ?? null,
    [relevantStudies, selectedResultsStudyId],
  );

  useEffect(() => {
    if (!selectedResultsStudyId) {
      setResultsStudyEvents([]);
      return;
    }
    let cancelled = false;
    setLoadingResults(true);
    void loadStudyEvents(selectedResultsStudyId)
      .then((events) => { if (!cancelled) setResultsStudyEvents(events); })
      .catch(() => { if (!cancelled) setResultsStudyEvents([]); })
      .finally(() => { if (!cancelled) setLoadingResults(false); });
    return () => { cancelled = true; };
  }, [selectedResultsStudyId]);

  const resultsStats = useMemo(() => {
    if (!selectedResultsStudy) return [];
    return buildStudyStudentStats(selectedResultsStudy, students, resultsStudyEvents);
  }, [selectedResultsStudy, students, resultsStudyEvents]);

  const selectedStudentStudies = useMemo(() => {
    if (!selectedStudentId) return [];
    return studies
      .filter((study) => study.memberIds.includes(selectedStudentId))
      .map((study) => {
        const stat = buildStudyStudentStats(study, students.filter((s) => s.id === selectedStudentId))[0];
        return {
          study,
          activityCount: stat?.totalMoves ?? 0,
          status: stat?.status ?? 'Başlamadı' as const,
          lastActivityAt: stat?.lastActivityAt,
        };
      })
      .sort((a, b) => {
        if (a.activityCount !== b.activityCount) return b.activityCount - a.activityCount;
        return a.study.title.localeCompare(b.study.title, 'tr');
      });
  }, [studies, selectedStudentId, students]);

  const openStudyLogForStat = (study: Study, stat: StudyStudentStat) => {
    const student = students.find((s) => s.id === stat.studentId);
    if (student) void openStudyLog(study, student);
  };

  const openStudyLog = async (study: Study, student: Student) => {
    setActiveStudyLog({ study, student });
  };

  const closeStudyLog = () => {
    setActiveStudyLog(null);
    setActiveStudyEvents([]);
    setLoadingStudyEvents(false);
  };

  useEffect(() => {
    if (!activeStudyLog) return;
    let cancelled = false;

    const { study, student } = activeStudyLog;
    const refresh = async () => {
      setLoadingStudyEvents(true);
      try {
        const [dbEvents, presenceRows] = await Promise.all([
          loadStudyEvents(study.id),
          loadStudyPresence(study.id),
        ]);
        if (cancelled) return;
        const persisted = mergeStudyAnalysisEvents(dbEvents, study).filter(
          (event) => String(event.studentId) === String(student.id),
        );
        const live = buildPresenceStudyEvents(study, student, presenceRows);
        setActiveStudyEvents(mergeVisibleStudyEvents(persisted, live));
      } catch {
        if (!cancelled) setActiveStudyEvents([]);
      } finally {
        if (!cancelled) setLoadingStudyEvents(false);
      }
    };

    void refresh();
    const unsubscribe = subscribeStudyPresence({
      studyId: study.id,
      onRow: () => {
        if (cancelled) return;
        void loadStudyPresence(study.id).then((rows) => {
          if (cancelled) return;
          setActiveStudyEvents((prev) => {
            const persisted = prev.filter((event) => !event.id.startsWith('presence-'));
            const live = buildPresenceStudyEvents(study, student, rows);
            return mergeVisibleStudyEvents(persisted, live);
          });
        });
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeStudyLog]);

  const activeStudyEventsByChapter = useMemo(() => {
    if (!activeStudyLog) return [];
    const chapterById = new Map(activeStudyLog.study.chapters.map((chapter) => [chapter.id, chapter]));
    const grouped = new Map<string, { chapterId: string; chapterTitle: string; chapterType: string; chapter: typeof activeStudyLog.study.chapters[0] | undefined; events: StudyEvent[] }>();
    activeStudyEvents.forEach((event) => {
      const chapterId = event.chapterId || 'unknown';
      if (!grouped.has(chapterId)) {
        const chapter = chapterById.get(chapterId);
        const interactiveType = chapter?.interactiveType ?? 'puzzle';
        const chapterType =
          chapter?.lessonMode === 'interactive' && interactiveType === 'vsComputer'
            ? 'Bilgisayara karşı'
            : chapter?.lessonMode === 'interactive'
              ? 'Hamle bul'
              : 'Çalışma';
        grouped.set(chapterId, {
          chapterId,
          chapterTitle: chapter?.title ?? 'Bilinmeyen Bölüm',
          chapterType,
          chapter,
          events: [],
        });
      }
      grouped.get(chapterId)!.events.push(event);
    });
    return [...grouped.values()];
  }, [activeStudyLog, activeStudyEvents]);

  const assignStudyToGroup = async () => {
    if (!assignStudyId || students.length === 0) return;
    const study = studies.find((s) => s.id === assignStudyId);
    if (!study) return;
    const merged = new Set([...study.memberIds, ...students.map((s) => s.id)]);
    const updated: Study = { ...study, memberIds: Array.from(merged) };
    await saveStudyAsync(updated);
    setStudies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setAssignStudyId('');
  };

  const removeStudentFromStudy = async (studyId: string, studentId: string) => {
    const study = studies.find((s) => s.id === studyId);
    if (!study) return;
    const updated: Study = { ...study, memberIds: study.memberIds.filter((id) => id !== studentId) };
    await saveStudyAsync(updated);
    setStudies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  if (loading) {
    return (
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-8 text-center text-slate-500 text-sm">
        Çalışmalar yükleniyor…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-black text-white">Çalışma Ataması</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={assignStudyId}
              onChange={(e) => setAssignStudyId(e.target.value)}
              className="input-base min-w-[200px]"
            >
              <option value="">Çalışma seçin</option>
              {unassignedStudies.map((s) => (
                <option key={s.id} value={s.id}>{studyDisplayEmoji(s)} {s.title}</option>
              ))}
              {studies.map((s) => (
                <option key={`all-${s.id}`} value={s.id}>{studyDisplayEmoji(s)} {s.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void assignStudyToGroup()}
              disabled={!assignStudyId || students.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl premium-gradient text-white text-xs font-bold disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              {showStudentCounts ? `${students.length} öğrenciye ata` : 'Gruba ata'}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Seçili gruba veya öğrenciye çalışma atayın. Öğrenci panelinde Çalışmalar sekmesinde görünür.
        </p>
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-violet-400" />
            <h3 className="text-sm font-black text-white">Çalışma Sonuçları</h3>
          </div>
          <select
            value={selectedResultsStudyId}
            onChange={(e) => setSelectedResultsStudyId(e.target.value)}
            className="input-base min-w-[220px]"
          >
            <option value="">Çalışma seçin</option>
            {relevantStudies.map((s) => (
              <option key={s.id} value={s.id}>{studyDisplayEmoji(s)} {s.title}</option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-slate-500">
          Seçili gruptaki öğrencilerin hamle bulma ve bilgisayara karşı bölüm ilerlemesi. Satıra tıklayarak hamle detayını açın.
        </p>
        {!selectedResultsStudyId ? (
          <p className="text-sm text-slate-500">Sonuçları görmek için bir çalışma seçin.</p>
        ) : loadingResults ? (
          <p className="text-sm text-slate-500">Kayıtlar yükleniyor…</p>
        ) : resultsStats.length === 0 ? (
          <p className="text-sm text-slate-500">Bu çalışmaya atanmış öğrenci bulunamadı.</p>
        ) : (
          <StudyGroupResultsTable
            stats={resultsStats}
            studyTitle={selectedResultsStudy?.title ?? ''}
            onSelect={(stat) => {
              if (selectedResultsStudy) openStudyLogForStat(selectedResultsStudy, stat);
            }}
          />
        )}
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-black text-white">Öğrenci Çalışmaları</h3>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[280px] space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Öğrenci ara..."
                className="input-base w-full pl-10"
              />
            </div>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="input-base w-full"
            >
              <option value="">Öğrenci seçin</option>
              {filteredStudentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedStudent ? (
          <p className="text-sm text-slate-500">Çalışmalarını görmek için bir öğrenci seçin.</p>
        ) : selectedStudentStudies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-slate-400">{selectedStudent.name} için çalışma bulunamadı.</p>
            <p className="text-xs text-slate-500 mt-2">Önce yukarıdan bir çalışma atayabilirsiniz.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedStudentStudies.map(({ study, activityCount, status, lastActivityAt }) => (
              <div key={study.id} className="rounded-xl border border-white/5 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{studyDisplayEmoji(study)}</span>
                      <h4 className="text-sm font-bold text-white truncate">{study.title}</h4>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {study.chapters.length} bölüm · {study.memberIds.length} üye
                      {study.studentCreated ? ' · öğrenci oluşturdu' : ' · öğretmen çalışması'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold border ${
                      status === 'Tamamlandı'
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : status === 'Devam Ediyor'
                          ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                          : 'border-slate-600 bg-slate-800/60 text-slate-400'
                    }`}>
                      <Activity className="w-3.5 h-3.5" />
                      {status}
                      {activityCount > 0 ? ` · ${activityCount} hamle` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openStudyLog(study, selectedStudent)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Hamleleri Gör
                    </button>
                    {onOpenStudy && (
                      <button
                        type="button"
                        onClick={() => onOpenStudy(study.id)}
                        className="p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/10"
                        title="Çalışmayı aç"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {study.description?.trim() ? (
                  <p className="mt-3 text-xs text-slate-300">{study.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
                  {lastActivityAt ? (
                    <span>Son kayıt: {new Date(lastActivityAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  ) : (
                    <span>Hamle kaydi yoksa popup acildiginda veritabani kayitlari da kontrol edilir.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeStudyLog && (
        <div className="modal-overlay z-[120]" onClick={closeStudyLog}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div
            className="modal-panel relative max-w-6xl overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 sm:px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-slate-900/70">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-white truncate">{activeStudyLog.study.title}</h3>
                <p className="text-xs text-slate-400 mt-1 truncate">{activeStudyLog.student.name} · Çalışma hamle kayıtları</p>
              </div>
              <button type="button" onClick={closeStudyLog} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-scroll-body p-4 sm:p-5 space-y-4 custom-scrollbar">
              {loadingStudyEvents ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-slate-400">
                  Kayıtlar yükleniyor…
                </div>
              ) : activeStudyEventsByChapter.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-slate-400">
                  Bu öğrenci için çalışma hamle kaydı bulunamadı.
                </div>
              ) : (
                activeStudyEventsByChapter.map((chapter) => (
                  <div key={chapter.chapterId} className="rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{chapter.chapterTitle}</h4>
                        <span className="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold border border-violet-500/30 bg-violet-500/10 text-violet-300">
                          {chapter.chapterType}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {chapter.events.length} hamle kaydı
                        {chapter.chapterType === 'Bilgisayara karşı'
                          ? ` · ${chapter.events.filter((e) => !e.expectedMove).length} öğrenci hamlesi`
                          : ` · ${chapter.events.filter((e) => e.result === 'wrong').length} yanlış`}
                      </p>
                    </div>
                    <StudyChapterReplayPanel
                      chapter={chapter.chapter}
                      events={chapter.events}
                      studentId={activeStudyLog.student.id}
                      studyId={activeStudyLog.study.id}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
