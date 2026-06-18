import React from 'react';
import { Eye, List, Grid } from 'lucide-react';
import type { HomeworkAssignment, HomeworkPuzzleAttempt, HomeworkSubmission, Student } from '../../types';
import {
  getHomeworkBranchLabel,
  getHomeworkGroupLabel,
  homeworkParticipation,
  homeworkEndDateLabel,
  homeworkStatusLabel,
} from '../../lib/homeworkAnalysisUtils';
import { ResponsiveTable } from '../ui/ResponsiveTable';

type Props = {
  homeworks: HomeworkAssignment[];
  students: Student[];
  attempts: HomeworkPuzzleAttempt[];
  submissions: HomeworkSubmission[];
  onOpenDetail: (homeworkId: string) => void;
  isStudentActive?: (studentId: string) => boolean;
};

export const HomeworkAssignmentsList: React.FC<Props> = ({
  homeworks,
  students,
  attempts,
  submissions,
  onOpenDetail,
  isStudentActive,
}) => {
  const sorted = [...homeworks].sort((a, b) => {
    const da = a.endDate || a.dueDate || a.startDate || '';
    const db = b.endDate || b.dueDate || b.startDate || '';
    return db.localeCompare(da);
  });

  if (homeworks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
        <Grid className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Henüz aktif atama yok</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1a2332]/60 overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
        <List className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Aktif Atamalar</h3>
        <span className="ml-auto text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {homeworks.length} kayıt
        </span>
      </div>
      <ResponsiveTable minWidth={720}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06] bg-black/20">
              <th className="text-left py-3 px-4 font-bold">Başlık</th>
              <th className="text-left py-3 px-3 font-bold hidden md:table-cell">Şube</th>
              <th className="text-left py-3 px-3 font-bold">Grup</th>
              <th className="text-center py-3 px-3 font-bold">Bulmaca</th>
              <th className="text-center py-3 px-3 font-bold">Katılım</th>
              <th className="text-center py-3 px-3 font-bold hidden sm:table-cell">Bitiş</th>
              <th className="text-center py-3 px-4 font-bold">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((hw) => {
              const participation = homeworkParticipation(hw, students, attempts, submissions, { isStudentActive });
              const status = homeworkStatusLabel(hw);
              return (
                <tr
                  key={hw.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                >
                  <td data-label="Başlık" className="py-3 px-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{hw.title}</p>
                      <span className={`inline-block mt-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        status === 'Aktif'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {status}
                      </span>
                    </div>
                  </td>
                  <td data-label="Şube" className="py-3 px-3 text-slate-400 text-xs hidden md:table-cell">
                    {getHomeworkBranchLabel(hw, students)}
                  </td>
                  <td data-label="Grup" className="py-3 px-3 text-slate-300 text-xs max-w-[180px]">
                    <span className="line-clamp-2">{getHomeworkGroupLabel(hw, students)}</span>
                  </td>
                  <td data-label="Bulmaca" className="py-3 px-3 text-center">
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-[11px] font-bold">
                      {hw.puzzles.length} Bulmaca
                    </span>
                  </td>
                  <td data-label="Katılım" className="py-3 px-3 text-center">
                    <span
                      title={`${participation.started} başladı · ${participation.total} atanan`}
                      className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        participation.started > 0
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : participation.total > 0
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-500/15 text-slate-400'
                      }`}
                    >
                      {participation.started}/{participation.total} Katılım
                    </span>
                  </td>
                  <td data-label="Bitiş" className="py-3 px-3 text-center text-slate-400 text-xs hidden sm:table-cell">
                    {homeworkEndDateLabel(hw)}
                  </td>
                  <td data-label="İşlem" className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(hw.id)}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30 transition-colors"
                      title="Detay"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
};
