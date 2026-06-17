import React from 'react';
import { Tag, MessageSquare, BarChart2, Share2, Info, X, Plus, Copy, Download, RefreshCw, Highlighter, Send } from 'lucide-react';
import type { Study, StudyChapter, BottomTab } from '../../lib/studyTypes';
import type { StudyEvent } from '../../studyEvents';
import {
  buildOrphanChapterMap,
  eventMatchesChapter,
  mergeStudyAnalysisEvents,
  resolveEventChapterId,
} from '../../lib/studyAnalysisEvents';
import { formatMoveGlyphs, moveHasGlyph, parseMoveGlyphs, STUDY_ANNOTATION_SYMBOLS } from '../../lib/studyAnnotations';
import { Chessboard } from 'react-chessboard';

interface StudyBottomToolsProps {
  study: Study;
  chapter: StudyChapter | null;
  activeTab: BottomTab;
  currentMoveIndex: number;
  currentFen: string;
  chatMessages?: Array<{ id: string; user: string; text: string; timestamp: string }>;
  moveAnalysisEntries: Array<{
    id: string;
    moveNo: number;
    playedSan: string;
    expectedSan: string;
    isCorrect: boolean;
    thinkMs: number;
    atIso: string;
  }>;
  totalThinkLabel: string;
  totalCorrectThinkLabel: string;
  totalWrongThinkLabel: string;
  onTabChange: (tab: BottomTab) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onSaveComment: (comment: string) => void;
  onAddAnnotation: (sym: string) => void;
  onSelectChapter: (index: number) => void;
  onDownloadPgn: () => void;
  /** false ise PGN indirme gizlenir (örn. paylaşım: Sadece Ben) */
  canExportPgn?: boolean;
  onCopyText: (text: string) => void;
  currentUserName?: string;
  viewingStudentId?: string | null;
  onViewingStudentChange?: (sid: string | null) => void;
  /* ── Admin analysis props ── */
  studyEvents?: StudyEvent[];
  studentsData?: Array<{ id: string; name: string }>;
  isAdminView?: boolean;
  onRefreshEvents?: () => void;
  readOnly?: boolean;
  canAnnotate?: boolean;
  /** 0-tabanlı hamle indeksi; null = başlangıç / sembol atanamaz */
  annotationPlyIndex?: number | null;
  onSendLiveNote?: (text: string) => void;
}

export const StudyBottomTools: React.FC<StudyBottomToolsProps> = ({
  study,
  chapter,
  activeTab,
  currentMoveIndex,
  currentFen,
  chatMessages,
  moveAnalysisEntries,
  totalThinkLabel,
  totalCorrectThinkLabel,
  totalWrongThinkLabel,
  onTabChange,
  onAddTag,
  onRemoveTag,
  onSaveComment,
  onAddAnnotation,
  onSelectChapter,
  onDownloadPgn,
  canExportPgn = true,
  onCopyText,
  currentUserName,
  viewingStudentId,
  onViewingStudentChange,
  studyEvents,
  studentsData,
  isAdminView,
  onRefreshEvents,
  readOnly = false,
  canAnnotate = true,
  annotationPlyIndex = null,
  onSendLiveNote,
}) => {
  const [tagInput, setTagInput] = React.useState('');
  const [eventStudentFilter, setEventStudentFilter] = React.useState('');
  const [liveNoteSearch, setLiveNoteSearch] = React.useState('');
  const [liveNoteStudentFilter, setLiveNoteStudentFilter] = React.useState('');
  const [liveNoteInput, setLiveNoteInput] = React.useState('');
  const LIVE_NOTE_MARKER = '[live_note]';

  const isLiveNoteMessage = React.useCallback((msg: { user?: string; text?: string }) => {
    const user = (msg.user || '').toLowerCase();
    const text = (msg.text || '').toLowerCase();
    return text.includes(LIVE_NOTE_MARKER)
      || user.includes('canlı analiz')
      || text.includes('[canlı analiz]')
      || text.includes('(canlı analiz)');
  }, []);

  const getLiveNoteChapterId = React.useCallback((msg: { text?: string }) => {
    const text = msg.text || '';
    const match = text.match(/\[CHAPTER:([^\]]+)\]/i);
    return match?.[1] ?? null;
  }, []);

  const normalizeLiveNoteText = React.useCallback((text: string) => {
    if (!text) return '';
    return text
      .replace(/\[LIVE_NOTE\]/gi, '')
      .replace(/\[CHAPTER:[^\]]+\]/gi, '')
      .replace(/\[CHAPTER_LABEL:[^\]]+\]/gi, '')
      .trim();
  }, []);

  const tabs: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
    { id: 'tags', icon: <Tag className="w-3.5 h-3.5" />, label: 'ETİKETLER' },
    { id: 'comments', icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'YORUMLAR' },
    { id: 'annotations', icon: <span className="font-extrabold text-[10px]">!?</span>, label: 'SEMBOLLER' },
    { id: 'analysis', icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'ANALİZ' },
    { id: 'liveNotes', icon: <Highlighter className="w-3.5 h-3.5" />, label: 'CANLI NOTLAR' },
    { id: 'multiboard', icon: <span className="font-bold text-[10px]">⊞</span>, label: 'ÇOKLU TAHTA' },
    { id: 'share', icon: <Share2 className="w-3.5 h-3.5" />, label: 'PAYLAŞ' },
    { id: 'info', icon: <Info className="w-3.5 h-3.5" />, label: 'BİLGİ' },
  ];
  const visibleTabs = readOnly ? tabs.filter((t) => t.id !== 'share' && t.id !== 'multiboard') : tabs;

  React.useEffect(() => {
    if (readOnly && (activeTab === 'share' || activeTab === 'multiboard')) onTabChange('comments');
  }, [readOnly, activeTab, onTabChange]);

  React.useEffect(() => {
    if (viewingStudentId) setEventStudentFilter(String(viewingStudentId));
  }, [viewingStudentId]);

  /* ── Admin events helpers ── */
  const allAnalysisEvents = React.useMemo(
    () => mergeStudyAnalysisEvents(studyEvents, study),
    [studyEvents, study],
  );

  const orphanChapterMap = React.useMemo(
    () => buildOrphanChapterMap(allAnalysisEvents, study),
    [allAnalysisEvents, study],
  );

  const filteredEvents = React.useMemo(() => {
    let events = allAnalysisEvents;
    if (chapter?.id) {
      events = events.filter((e) =>
        eventMatchesChapter(e, chapter.id, study, orphanChapterMap),
      );
    }
    if (eventStudentFilter) {
      events = events.filter((e) => String(e.studentId) === eventStudentFilter);
    }
    return events;
  }, [allAnalysisEvents, chapter?.id, eventStudentFilter, study, orphanChapterMap]);

  const uniqueStudents = React.useMemo(() => {
    const ids = new Set<string>();
    const result: Array<{ id: string; name: string }> = [];
    for (const e of allAnalysisEvents) {
      const sid = String(e.studentId);
      if (ids.has(sid)) continue;
      ids.add(sid);
      const student = studentsData?.find(s => String(s.id) === sid);
      result.push({ id: sid, name: student?.name ?? `Öğrenci #${sid.slice(0, 6)}` });
    }
    return result;
  }, [allAnalysisEvents, studentsData]);

  const filteredLiveNotes = React.useMemo(() => {
    const msgs = chatMessages ?? study.chatMessages ?? [];
    const onlyLive = msgs.filter((m) => isLiveNoteMessage(m));
    const q = liveNoteSearch.trim().toLowerCase();
    let res = onlyLive;
    if (chapter?.id) {
      res = res.filter((m) => {
        const cid = getLiveNoteChapterId(m);
        return !cid || cid === chapter.id;
      });
    }
    if (q) res = res.filter(m => (m.user || '').toLowerCase().includes(q) || (m.text || '').toLowerCase().includes(q));
    if (liveNoteStudentFilter) {
      const student = studentsData?.find(s => String(s.id) === String(liveNoteStudentFilter));
      const name = student?.name?.toLowerCase();
      if (name) res = res.filter(m => (m.user || '').toLowerCase().includes(name));
      else res = res.filter(m => (m.user || '').includes(liveNoteStudentFilter));
    }
    return res.sort((a, b) => {
      const ta = Date.parse(a.timestamp || '') || 0;
      const tb = Date.parse(b.timestamp || '') || 0;
      return tb - ta;
    });
  }, [chatMessages, study.chatMessages, liveNoteSearch, liveNoteStudentFilter, studentsData, chapter?.id, isLiveNoteMessage, getLiveNoteChapterId]);

  const liveNoteStudentOptions = React.useMemo(() => {
    if (!studentsData) return [];
    const msgs = chatMessages ?? study.chatMessages ?? [];
    const onlyLive = msgs.filter((m) => isLiveNoteMessage(m));
    const present = new Set<string>();
    for (const m of onlyLive) {
      const user = (m.user || '').toLowerCase();
      for (const s of studentsData) {
        if (user.includes((s.name || '').toLowerCase())) present.add(String(s.id));
      }
    }
    return studentsData
      .filter(s => present.size === 0 ? true : present.has(String(s.id)))
      .map(s => ({ id: String(s.id), name: s.name }));
  }, [studentsData, chatMessages, study.chatMessages, isLiveNoteMessage]);

  const formatMsgTime = React.useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }, []);

  const getStudentName = React.useCallback((studentId: string) => {
    const s = studentsData?.find(st => String(st.id) === String(studentId));
    return s?.name ?? `Öğrenci #${studentId.slice(0, 6)}`;
  }, [studentsData]);

  const getChapterNumber = React.useCallback((chapterId: string) => {
    const resolved = resolveEventChapterId(chapterId, study, orphanChapterMap);
    const idx = study.chapters.findIndex(ch => ch.id === resolved);
    return idx >= 0 ? idx + 1 : 0;
  }, [study.chapters, study, orphanChapterMap]);

  const formatEventTime = React.useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch { return '--:--'; }
  }, []);

  const getResultLabel = React.useCallback((result: string) => {
    switch (result) {
      case 'correct': return 'Doğru hamle';
      case 'solution': return 'Çözüm gösterildi';
      case 'wrong': return 'Yanlış / geçersiz hamle';
      default: return result;
    }
  }, []);

  const getResultClass = React.useCallback((result: string) => {
    switch (result) {
      case 'correct': return 'text-emerald-400';
      case 'solution': return 'text-teal-400';
      case 'wrong': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  }, []);

  const formatDuration = React.useCallback((ms: number) => {
    const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const totalSeconds = Math.round(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes} dk ${seconds} sn` : `${seconds} sn`;
  }, []);

  return (
    <div className="rounded-sm bg-[#1e293b] border border-[rgba(255,255,255,0.05)] overflow-hidden shrink-0 mt-2">
      {/* Tab Row */}
      <div className="flex items-center px-0.5 sm:px-1 border-b border-[rgba(255,255,255,0.05)] bg-[#0f172a] overflow-x-auto scrollbar-none snap-x snap-mandatory">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
            className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2.5 min-h-[44px] text-[9px] sm:text-[10px] font-bold uppercase tracking-tight transition-all relative shrink-0 snap-start ${
              activeTab === tab.id ? 'text-[#bababa] bg-[#1e293b]' : 'text-[#787472] hover:text-[#bababa]'
            }`}
          >
            {tab.icon}
            <span className="truncate max-w-[4.5rem] sm:max-w-none">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-3 sm:p-3 min-h-[88px] max-h-[36vh] sm:max-h-72 overflow-y-auto custom-scrollbar">
        {/* TAGS */}
        {activeTab === 'tags' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-bold">BÖLÜM ETİKETLERİ</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(chapter?.tags ?? []).map(tag => (
                  <span key={tag} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-semibold border border-teal-500/20">
                    {tag}
                    {!readOnly && (
                      <button type="button" onClick={() => onRemoveTag(tag)} className="hover:text-rose-400 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { onAddTag(tagInput); setTagInput(''); } }}
                    placeholder="Bölüm etiketi ekle..."
                    className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-teal-500/50"
                  />
                  <button 
                    type="button" 
                    onClick={() => { onAddTag(tagInput); setTagInput(''); }}
                    className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 rounded-lg transition-colors"
                    aria-label="Etiket ekle"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMMENTS */}
        {activeTab === 'comments' && (
          <div className="animate-in fade-in duration-300">
            <p className="text-[10px] text-slate-500 mb-2 font-bold uppercase tracking-wider">
              {currentMoveIndex === 0 ? 'Bölüm başlangıcı yorumu' : `Hamle ${Math.floor(currentMoveIndex/2)+1} yorumu`}
            </p>
            {readOnly ? (
              <div className="w-full min-h-[96px] bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap">
                {(currentMoveIndex === 0 ? (chapter?.comment ?? '') : (chapter?.moveComments?.[currentMoveIndex - 1] ?? '')).trim() || 'Bu hamle için yorum yok.'}
              </div>
            ) : (
              <textarea
                key={`comment-${chapter?.id}-${currentMoveIndex}`}
                rows={4}
                defaultValue={currentMoveIndex === 0 ? (chapter?.comment ?? '') : (chapter?.moveComments?.[currentMoveIndex - 1] ?? '')}
                onBlur={e => onSaveComment(e.target.value)}
                placeholder="Yorum yazın..."
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500/30 resize-none transition-all"
              />
            )}
          </div>
        )}

        {/* ANNOTATIONS */}
        {activeTab === 'annotations' && (
          readOnly ? (
            <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-slate-200">
              {annotationPlyIndex == null
                ? 'Başlangıç pozisyonunda sembol yok.'
                : (chapter?.moveAnnotations?.[annotationPlyIndex]
                  ? `Bu hamlenin sembolü: ${formatMoveGlyphs(parseMoveGlyphs(chapter.moveAnnotations[annotationPlyIndex]))}`
                  : 'Bu hamle için sembol yok.')}
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
              {annotationPlyIndex == null ? (
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-1">
                  Hamle seçin: sağdaki listeden veya tahtada hamlenin gittiği kareye tıklayın.
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 font-medium px-1">
                  Seçili hamleye sembol atayın · Kısayol: <span className="text-slate-400">1–6</span>
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STUDY_ANNOTATION_SYMBOLS.map(({ sym, label, color, key }) => {
                const inactive = !canAnnotate || annotationPlyIndex == null;
                const selected =
                  annotationPlyIndex != null &&
                  moveHasGlyph(chapter?.moveAnnotations?.[annotationPlyIndex], sym);
                return (
                <button
                  key={sym}
                  type="button"
                  disabled={inactive}
                  title={inactive ? 'Önce bir hamle seçin' : `${label} (${key})`}
                  onClick={() => onAddAnnotation(sym)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    selected
                      ? 'border-teal-500/50 bg-teal-500/10 shadow-[0_0_15px_rgba(20,184,166,0.1)]'
                      : 'border-white/5 bg-black/20 hover:border-white/20 hover:bg-black/30'
                  } ${inactive ? 'opacity-35 cursor-not-allowed' : 'opacity-100'}`}
                >
                  <span className={`text-lg font-black ${color}`}>{sym}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tighter text-left truncate">{label}</span>
                  </span>
                  <kbd className="shrink-0 text-[9px] font-black text-slate-500 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 tabular-nums">{key}</kbd>
                </button>
              );})}
              </div>
            </div>
          )
        )}

        {/* ANALYSIS */}
        {activeTab === 'analysis' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {isAdminView ? (
              /* ═══════════════════════════════════════════════════════════
                 ADMIN / COACH VIEW — Öğrenci hamle kayıtları (Supabase)
                 ═══════════════════════════════════════════════════════════ */
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-slate-400 font-medium">Öğrenci hamle kayıtları</p>
                  <div className="flex items-center gap-2">
                    {onRefreshEvents && (
                      <button
                        type="button"
                        onClick={onRefreshEvents}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-teal-400 transition-colors"
                        title="Yenile"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <select
                      value={eventStudentFilter}
                      onChange={e => setEventStudentFilter(e.target.value)}
                      className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/50 cursor-pointer"
                    >
                      <option value="">Tüm öğrenciler</option>
                      {uniqueStudents.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Event list */}
                <div className="space-y-0 max-h-64 overflow-y-auto custom-scrollbar -mx-4">
                  {filteredEvents.length === 0 ? (
                    <p className="text-xs text-slate-500 px-4 py-6 text-center">
                      {allAnalysisEvents.length > 0
                        ? 'Bu bölüm için kayıt bulunamadı.'
                        : 'Henüz öğrenci hamle kaydı yok. Öğrenciler çalışmada hamle yaptıkça burada listelenecek.'}
                    </p>
                  ) : (
                    filteredEvents.map((event) => {
                      const time = formatEventTime(event.createdAt);
                      const studentName = getStudentName(event.studentId);
                      const chapterNo = getChapterNumber(event.chapterId);
                      const resultLabel = getResultLabel(event.result);
                      const resultClass = getResultClass(event.result);
                      const thinkLabel = formatDuration(event.thinkMs ?? 0);
                      const moveInfo = event.result === 'wrong'
                        ? `${event.playedMove ?? '—'} / beklenen: ${event.expectedMove ?? '—'}`
                        : event.result === 'solution'
                        ? event.expectedMove ?? event.playedMove ?? '—'
                        : event.playedMove ?? '—';

                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 px-4 py-2.5 text-xs border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="text-slate-500 shrink-0 font-mono text-[11px]">{time}</span>
                          <span className="text-white font-bold shrink-0 truncate max-w-[120px]">{studentName}</span>
                          {chapterNo > 0 && (
                            <span className="text-slate-500 shrink-0 font-mono">#{chapterNo}</span>
                          )}
                          <span className={`font-bold shrink-0 ${resultClass}`}>{resultLabel}</span>
                          <div className="ml-auto text-right shrink-0">
                            <span className="block text-slate-400 font-mono text-[11px]">{moveInfo}</span>
                            <span className="block text-[10px] text-amber-300/90 font-semibold">Düşünme: {thinkLabel}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Summary stats */}
                {filteredEvents.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 text-[10px] pt-2 border-t border-white/5">
                    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-center">
                      <p className="text-slate-500 uppercase tracking-wide">Toplam</p>
                      <p className="text-slate-200 font-black">{filteredEvents.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-center">
                      <p className="text-emerald-400 uppercase tracking-wide">Doğru</p>
                      <p className="text-emerald-300 font-black">
                        {filteredEvents.filter(e => e.result === 'correct' || e.result === 'solution').length}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-center">
                      <p className="text-rose-400 uppercase tracking-wide">Yanlış</p>
                      <p className="text-rose-300 font-black">
                        {filteredEvents.filter(e => e.result === 'wrong').length}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-center">
                      <p className="text-amber-300 uppercase tracking-wide">Düşünme</p>
                      <p className="text-amber-200 font-black">
                        {formatDuration(filteredEvents.reduce((sum, e) => sum + (e.thinkMs ?? 0), 0))}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ═══════════════════════════════════════════════════════════
                 STUDENT / PRACTICE VIEW — Local analysis
                 ═══════════════════════════════════════════════════════════ */
              <>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">CANLI PERFORMANS GÜNLÜĞÜ</p>
                    <div className="flex items-center gap-2 mt-1">
                      {currentUserName && <p className="text-[9px] text-teal-500 font-bold uppercase tracking-tight">Oturum: {currentUserName}</p>}
                    </div>
                  </div>
                  {moveAnalysisEntries.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-bold border border-teal-500/10">{moveAnalysisEntries.length} KAYIT</span>}
                </div>

                {/* Student Selector for Coaches */}
                {onViewingStudentChange && study.practiceLogs && Object.keys(study.practiceLogs).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-white/5">
                    {Object.keys(study.practiceLogs).map((sid) => (
                      <button
                        key={sid}
                        onClick={() => onViewingStudentChange(sid)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all flex items-center gap-2 ${viewingStudentId === sid ? 'bg-teal-500 text-black shadow-lg shadow-teal-500/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${viewingStudentId === sid ? 'bg-black' : 'bg-teal-400 animate-pulse'}`} />
                        ÖĞRENCİ: {sid.slice(0, 4)}...
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-2">
                    <p className="text-slate-500 uppercase tracking-wide">Düşünme</p>
                    <p className="text-slate-200 font-black">{totalThinkLabel}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2">
                    <p className="text-emerald-400 uppercase tracking-wide">Doğru süre</p>
                    <p className="text-emerald-300 font-black">{totalCorrectThinkLabel}</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-2">
                    <p className="text-rose-400 uppercase tracking-wide">Yanlış süre</p>
                    <p className="text-rose-300 font-black">{totalWrongThinkLabel}</p>
                  </div>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1 pt-2">
                  {moveAnalysisEntries.length === 0 ? (
                    <p className="text-xs text-slate-500">Hamle yaptıkça analiz burada listelenecek.</p>
                  ) : (
                    moveAnalysisEntries.map((item) => (
                      <div key={item.id} className={`rounded-xl border px-3 py-2.5 text-xs flex items-center justify-between gap-4 transition-all hover:bg-white/5 ${item.isCorrect ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5'}`}>
                        <div className="min-w-0">
                          <p className="font-black text-slate-100 uppercase tracking-tight truncate">
                             {item.moveNo}. hamle · {item.playedSan} {item.isCorrect ? '✓' : '✗'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {!item.isCorrect && <span className="text-[10px] text-rose-500 font-bold">Beklenen: {item.expectedSan}</span>}
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{Math.max(0, Math.round(item.thinkMs / 1000))} sn</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* LIVE NOTES */}
        {activeTab === 'liveNotes' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {onSendLiveNote && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={liveNoteInput}
                    onChange={(e) => setLiveNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && liveNoteInput.trim()) {
                        onSendLiveNote(liveNoteInput.trim());
                        setLiveNoteInput('');
                      }
                    }}
                    placeholder="Canlı not yaz..."
                    className="flex-1 min-w-[180px] bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!liveNoteInput.trim()) return;
                      onSendLiveNote(liveNoteInput.trim());
                      setLiveNoteInput('');
                    }}
                    disabled={!liveNoteInput.trim()}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Gonder
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={liveNoteSearch}
                onChange={(e) => setLiveNoteSearch(e.target.value)}
                placeholder="Notlarda ara..."
                className="flex-1 min-w-[180px] bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40"
              />
              <select
                value={liveNoteStudentFilter}
                onChange={(e) => setLiveNoteStudentFilter(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500/40 cursor-pointer"
              >
                <option value="">Tüm öğrenciler</option>
                {liveNoteStudentOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {filteredLiveNotes.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs text-slate-500">Henüz “Canlı Analiz” notu yok.</p>
                  <p className="text-[10px] text-slate-600 mt-1">Öğrenciler Canlı Analiz modunda “Antrenöre Not” gönderince burada toplanır.</p>
                </div>
              ) : (
                filteredLiveNotes.map((m) => (
                  <div key={m.id} className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                          {m.user.replace(/\(Canlı Analiz\)/gi, '').trim()} · {formatMsgTime(m.timestamp)}
                        </p>
                        <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap break-words">{normalizeLiveNoteText(m.text || '')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopyText(`${m.user} — ${formatMsgTime(m.timestamp)}\n${normalizeLiveNoteText(m.text || '')}`)}
                        className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                        title="Kopyala"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MULTI BOARD */}
        {activeTab === 'multiboard' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4">
            {study.chapters.map((ch, idx) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChapter(idx)}
                className={`group flex flex-col items-center gap-2 p-2 rounded-xl border transition-all ${
                  study.chapters.indexOf(chapter!) === idx
                    ? 'border-teal-500/50 bg-teal-500/10 ring-1 ring-teal-500/20'
                    : 'border-white/5 bg-black/20 hover:border-white/20 hover:shadow-xl'
                }`}
              >
                <div className="w-full aspect-square rounded-lg overflow-hidden pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                  <Chessboard options={{ position: ch.fen, boardOrientation: ch.orientation }} />
                </div>
                <span className={`text-[10px] font-bold truncate w-full text-center px-1 ${study.chapters.indexOf(chapter!) === idx ? 'text-teal-400' : 'text-slate-500'}`}>
                  {idx + 1}. {ch.title}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* SHARE */}
        {activeTab === 'share' && (
          <div className="flex flex-wrap gap-3 animate-in fade-in scale-95 duration-200">
            <button
               type="button"
               onClick={() => onCopyText(currentFen)}
               className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-bold transition-all border border-white/5 shadow-lg active:scale-95"
            >
              <Copy className="w-4 h-4" /> FEN KOPYALA
            </button>
            {canExportPgn && (
              <button
                type="button"
                onClick={onDownloadPgn}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-bold transition-all border border-white/5 shadow-lg active:scale-95"
              >
                <Download className="w-4 h-4" /> PGN İNDİR
              </button>
            )}
          </div>
        )}

        {/* INFO */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs animate-in fade-in duration-300">
            {[
              { label: 'Çalışma', val: study.title },
              { label: 'Bölüm', val: chapter?.title || '—' },
              { label: 'Oluşturulma', val: new Date(study.createdAt).toLocaleDateString() },
              { label: 'Bölüm Sayısı', val: study.chapters.length },
              { label: 'Görünürlük', val: study.visibility.toUpperCase() },
              { label: 'Senkronizasyon', val: study.syncEnabled ? 'AÇIK' : 'KAPALI' },
            ].map(item => (
              <div key={item.label} className="bg-black/20 p-3 rounded-lg border border-white/5">
                <span className="text-slate-600 block text-[9px] font-bold uppercase tracking-widest mb-1">{item.label}</span>
                <span className="text-slate-300 font-medium">{item.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
