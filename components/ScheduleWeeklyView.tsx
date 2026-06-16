import React, { useMemo } from 'react';
import { Clock, Plus } from 'lucide-react';
import type { Lesson } from '../types';

const DAYS_ORDER: string[] = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAYS_HEADER: string[] = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];

export interface ScheduleWeeklyViewProps {
  lessons: Lesson[];
  /** Grup filtresi; boş = Tüm Branşlar */
  groupFilter?: string;
  onGroupFilterChange?: (group: string) => void;
  /** Admin tarafında "+ Ders Ekle" göster */
  showAddButton?: boolean;
  onAddLesson?: () => void;
  title?: string;
  subtitle?: string;
  /** Mevcut gruplar listesi (filtre dropdown için) */
  groups?: string[];
  /** Sadece okuma (öğrenci paneli) */
  readOnly?: boolean;
  /** Öğrenciye özel ders etiketinde ad çözümleme */
  getStudentLabel?: (studentId: string) => string | undefined;
  /** Admin tarafında öğrenci filtresi (öğrenciye özel program oluşturma/görüntüleme) */
  studentFilter?: string;
  onStudentFilterChange?: (studentId: string) => void;
  studentOptions?: Array<{ id: string; name: string }>;
}

const ScheduleWeeklyView: React.FC<ScheduleWeeklyViewProps> = ({
  lessons,
  groupFilter = '',
  onGroupFilterChange,
  showAddButton = false,
  onAddLesson,
  title = 'Ders Programı',
  subtitle = 'Haftalık antrenman çizelgesi',
  groups = [],
  readOnly = false,
  getStudentLabel,
  studentFilter = '',
  onStudentFilterChange,
  studentOptions = [],
}) => {
  const filteredLessons = useMemo(() => {
    let list = lessons;
    if (groupFilter && groupFilter !== 'Tüm Branşlar') {
      list = list.filter((l) => (l.group || '').trim() === groupFilter);
    }
    if (studentFilter) {
      list = list.filter((l) => String(l.studentId ?? '') === String(studentFilter));
    }
    return list;
  }, [lessons, groupFilter, studentFilter]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    DAYS_ORDER.forEach((day) => map.set(day, []));
    filteredLessons.forEach((l) => {
      const day = (l.day || '').trim() || 'Pazartesi';
      if (map.has(day)) map.get(day)!.push(l);
      else map.set(day, [l]);
    });
    DAYS_ORDER.forEach((day) => map.get(day)!.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
    return map;
  }, [filteredLessons]);

  const uniqueGroups = useMemo(() => {
    const set = new Set(groups.length > 0 ? groups : lessons.map((l) => l.group).filter(Boolean));
    return ['Tüm Branşlar', ...Array.from(set).sort()];
  }, [groups, lessons]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
        </div>
        {showAddButton && onAddLesson && (
          <button
            type="button"
            onClick={onAddLesson}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shrink-0"
          >
            <Plus className="w-5 h-5" /> Ders Ekle
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && onGroupFilterChange && (
          <div className="flex items-center gap-2">
            <select
              value={groupFilter || 'Tüm Branşlar'}
              onChange={(e) => onGroupFilterChange(e.target.value === 'Tüm Branşlar' ? '' : e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-slate-600 text-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {uniqueGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        )}
        {!readOnly && onStudentFilterChange && (
          <div className="flex items-center gap-2">
            <select
              value={studentFilter}
              onChange={(e) => onStudentFilterChange(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-slate-600 text-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Tum ogrenciler</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Haftalık görünüm</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {DAYS_ORDER.map((day, idx) => (
          <div
            key={day}
            className="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden flex flex-col min-h-[200px]"
          >
            <div className="p-3 border-b border-slate-700/50 bg-slate-900/30">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">
                {DAYS_HEADER[idx]}
              </p>
            </div>
            <div className="p-2 flex-1 space-y-2">
              {(lessonsByDay.get(day) || []).map((lesson) => (
                <div
                  key={lesson.id}
                  className="rounded-xl bg-white/5 border border-slate-600/50 p-2.5 text-left hover:border-slate-500/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">
                        {lesson.startTime || '—'} – {lesson.endTime || '—'}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5 uppercase tracking-wide">
                        {(lesson.topic || 'Ders').toUpperCase()}
                      </p>
                      {lesson.studentId && (
                        <p className="text-[10px] text-cyan-300 mt-1">
                          Ozel ders{getStudentLabel ? ` - ${getStudentLabel(lesson.studentId) ?? 'Ogrenci'}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScheduleWeeklyView;
