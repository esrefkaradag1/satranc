import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Users, CheckSquare, ExternalLink } from 'lucide-react';
import type { Student } from '../../types';
import type { Study } from '../../lib/studyTypes';
import { studyDisplayEmoji } from '../../lib/studyUtils';
import { loadStudiesAsync, saveStudyAsync } from '../../studyStorage';

type Props = {
  students: Student[];
  onOpenStudy?: (studyId: string) => void;
};

export const StudyControlSection: React.FC<Props> = ({ students, onOpenStudy }) => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignStudyId, setAssignStudyId] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadStudiesAsync()
      .then((data) => { if (!cancelled) setStudies(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
              {students.length} öğrenciye ata
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          Seçili gruba veya öğrenciye çalışma atayın. Öğrenci panelinde Çalışmalar sekmesinde görünür.
        </p>
      </div>

      {relevantStudies.length === 0 ? (
        <div className="bg-[#1e293b]/60 rounded-2xl border border-dashed border-white/10 p-10 text-center">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Bu hedefte atanmış çalışma yok</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {relevantStudies.map((study) => {
            const members = students.filter((s) => study.memberIds.includes(s.id));
            return (
              <div key={study.id} className="bg-[#1e293b] rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl">{studyDisplayEmoji(study)}</span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{study.title}</h4>
                      <p className="text-[10px] text-slate-500">{study.chapters.length} bölüm · {members.length} üye</p>
                    </div>
                  </div>
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
                <div className="p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {members.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-black/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-200 truncate">{s.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeStudentFromStudy(study.id, s.id)}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-bold shrink-0"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Users className="w-3.5 h-3.5" />
        Toplam {studies.length} çalışma · {relevantStudies.length} bu hedefe atanmış
      </div>
    </div>
  );
};
