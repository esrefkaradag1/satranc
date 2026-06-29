import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../AppContext';
import ScheduleWeeklyView from './ScheduleWeeklyView';
import {
  activeTrainingGroupNames,
  filterLessonsToActiveGroups,
} from '../lib/syncGroupLessons';

const DAYS_FOR_LESSON: { value: string; label: string }[] = [
  { value: 'Pazartesi', label: 'Pazartesi' },
  { value: 'Salı', label: 'Salı' },
  { value: 'Çarşamba', label: 'Çarşamba' },
  { value: 'Perşembe', label: 'Perşembe' },
  { value: 'Cuma', label: 'Cuma' },
  { value: 'Cumartesi', label: 'Cumartesi' },
  { value: 'Pazar', label: 'Pazar' },
];

const Curriculum: React.FC = () => {
  const { lessons, addLesson, scopedStudents: students, scopedTrainingGroups } = useApp();
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [scheduleGroupFilter, setScheduleGroupFilter] = useState<string>('');
  const [scheduleStudentFilter, setScheduleStudentFilter] = useState<string>('');

  const scheduleGroups = useMemo(
    () => activeTrainingGroupNames(scopedTrainingGroups),
    [scopedTrainingGroups],
  );

  const visibleLessons = useMemo(
    () => filterLessonsToActiveGroups(lessons, scopedTrainingGroups),
    [lessons, scopedTrainingGroups],
  );

  const [lessonForm, setLessonForm] = useState<{ day: string; startTime: string; endTime: string; group: string; topic: string; studentId: string }>({
    day: 'Pazartesi',
    startTime: '12:00',
    endTime: '13:00',
    group: scheduleGroups[0] || '',
    topic: 'Satranç',
    studentId: '',
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <ScheduleWeeklyView
        lessons={visibleLessons}
        groupFilter={scheduleGroupFilter}
        onGroupFilterChange={setScheduleGroupFilter}
        showAddButton
        onAddLesson={() => {
          setLessonForm({
            day: 'Pazartesi',
            startTime: '12:00',
            endTime: '13:00',
            group: scheduleGroups[0] || '',
            topic: 'Satranç',
            studentId: scheduleStudentFilter || '',
          });
          setLessonModalOpen(true);
        }}
        title="Ders Programı"
        subtitle="Haftalık antrenman çizelgesi — yalnızca tanımlı eğitim grupları"
        groups={scheduleGroups}
        studentFilter={scheduleStudentFilter}
        onStudentFilterChange={setScheduleStudentFilter}
        studentOptions={students.map((s) => ({ id: String(s.id), name: s.name }))}
        getStudentLabel={(id) => students.find((s) => String(s.id) === String(id))?.name}
      />

      {lessonModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setLessonModalOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <div className="relative w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Ders Ekle</h3>
              <button type="button" onClick={() => setLessonModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Gün</label>
                <select
                  value={lessonForm.day}
                  onChange={e => setLessonForm(f => ({ ...f, day: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                >
                  {DAYS_FOR_LESSON.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Başlangıç</label>
                  <input
                    type="text"
                    value={lessonForm.startTime}
                    onChange={e => setLessonForm(f => ({ ...f, startTime: e.target.value }))}
                    placeholder="09:00"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Bitiş</label>
                  <input
                    type="text"
                    value={lessonForm.endTime}
                    onChange={e => setLessonForm(f => ({ ...f, endTime: e.target.value }))}
                    placeholder="10:00"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Grup</label>
                <select
                  value={lessonForm.group}
                  onChange={e => setLessonForm(f => ({ ...f, group: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                >
                  {scheduleGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  {scheduleGroups.length === 0 && <option value="">Grup yok</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Ders / Branş adı</label>
                <input
                  type="text"
                  value={lessonForm.topic}
                  onChange={e => setLessonForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder="Satranç"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">Ogrenciye ozel (opsiyonel)</label>
                <select
                  value={lessonForm.studentId}
                  onChange={e => setLessonForm(f => ({ ...f, studentId: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm"
                >
                  <option value="">Tum grup</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setLessonModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 font-bold text-sm">
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addLesson({
                      day: lessonForm.day,
                      startTime: lessonForm.startTime.trim() || '12:00',
                      endTime: lessonForm.endTime.trim() || '13:00',
                      group: lessonForm.group.trim() || scheduleGroups[0] || '',
                      topic: lessonForm.topic.trim() || 'Ders',
                      studentId: lessonForm.studentId || undefined,
                    });
                    setLessonModalOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm"
                >
                  Ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Curriculum;
