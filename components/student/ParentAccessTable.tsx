import React from 'react';
import { Eye, EyeOff, GraduationCap, LogIn, Users } from 'lucide-react';
import type { Student } from '../../types';
import StudentAvatar from './StudentAvatar';
import {
  formatParentPhone,
  parentDisplayNames,
  parentLoginSecret,
  parentPhonesSummary,
  studentLoginSecret,
} from '../../lib/parentDirectory';

type Props = {
  students: Student[];
  pageStartIndex: number;
  applicationPhotos: Record<string, string>;
  showSecrets: boolean;
  onToggleSecrets: () => void;
  onEnterPanel: (student: Student, viewAs: 'student' | 'parent') => void;
  onViewDetail?: (studentId: string) => void;
};

function SecretText({ value, show, empty = '—' }: { value: string; show: boolean; empty?: string }) {
  if (!value) return <span className="text-slate-500">{empty}</span>;
  return (
    <span className={`font-mono text-[12px] ${show ? 'text-amber-100' : 'text-slate-500'}`}>
      {show ? value : '••••'}
    </span>
  );
}

export const ParentAccessTable: React.FC<Props> = ({
  students,
  pageStartIndex,
  applicationPhotos,
  showSecrets,
  onToggleSecrets,
  onEnterPanel,
  onViewDetail,
}) => {
  if (students.length === 0) {
    return (
      <div className="py-12 text-center rounded-2xl border border-dashed border-white/10 bg-[#1e293b]/40">
        <Users className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-50" />
        <p className="text-slate-400 text-sm font-medium">Veli kaydı bulunamadı</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end px-1 pb-2">
        <button
          type="button"
          onClick={onToggleSecrets}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-bold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showSecrets ? 'Şifreleri gizle' : 'Şifreleri göster'}
        </button>
      </div>

      <div className="lg:hidden space-y-2.5">
        {students.map((student) => {
          const names = parentDisplayNames(student);
          const phones = parentPhonesSummary(student);
          const parentSecret = parentLoginSecret(student);
          const studentPass = studentLoginSecret(student);
          return (
            <div key={student.id} className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/80 p-3.5 space-y-3">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => onViewDetail?.(student.id)} className="shrink-0">
                  <StudentAvatar student={student} applicationPhotos={applicationPhotos} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300/80">Veli</p>
                  <p className="font-bold text-white text-sm truncate">{names.summary}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">Çocuk: {student.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Baba tel</p>
                  <p className="font-mono text-slate-200 mt-0.5">{phones.father}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Anne tel</p>
                  <p className="font-mono text-slate-200 mt-0.5">{phones.mother}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Veli PIN</p>
                  <p className="mt-0.5">
                    <SecretText value={parentSecret.pin} show={showSecrets} />
                    {parentSecret.fallback && parentSecret.pin ? (
                      <span className="ml-1 text-[10px] text-slate-500">son 4</span>
                    ) : null}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Öğrenci şifre</p>
                  <p className="mt-0.5"><SecretText value={studentPass} show={showSecrets} /></p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEnterPanel(student, 'parent')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/80 hover:bg-violet-500 text-white text-[11px] font-bold"
                >
                  <LogIn className="w-3.5 h-3.5" /> Veli paneli
                </button>
                <button
                  type="button"
                  onClick={() => onEnterPanel(student, 'student')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold"
                >
                  <GraduationCap className="w-3.5 h-3.5" /> Öğrenci paneli
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden lg:block rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[860px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-slate-950/40">
              <th className="px-2 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest w-8">#</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Veli</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Çocuk</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Telefon</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Veli PIN</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Öğrenci şifre</th>
              <th className="px-2.5 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Gizli giriş</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {students.map((student, index) => {
              const names = parentDisplayNames(student);
              const parentSecret = parentLoginSecret(student);
              const studentPass = studentLoginSecret(student);
              return (
                <tr key={student.id} className="hover:bg-white/[0.025] transition-colors">
                  <td className="px-2 py-2.5 text-xs font-medium text-slate-500 tabular-nums">{pageStartIndex + index}</td>
                  <td className="px-2.5 py-2.5 min-w-[10rem]">
                    <p className="font-bold text-white text-sm truncate">{names.father !== '—' ? names.father : names.summary}</p>
                    {names.mother !== '—' ? (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{names.mother}</p>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => onViewDetail?.(student.id)}
                      className="flex items-center gap-2 text-left min-w-0"
                    >
                      <StudentAvatar student={student} applicationPhotos={applicationPhotos} className="w-8 h-8" />
                      <span className="font-medium text-slate-200 text-sm truncate hover:text-indigo-200">{student.name}</span>
                    </button>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <p className="font-mono text-[12px] text-slate-200">{formatParentPhone(student.fatherPhone || student.parentPhone)}</p>
                    {student.motherPhone ? (
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">{formatParentPhone(student.motherPhone)}</p>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <SecretText value={parentSecret.pin} show={showSecrets} />
                    {parentSecret.fallback && parentSecret.pin ? (
                      <p className="text-[10px] text-slate-500 mt-0.5">telefon son 4</p>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <SecretText value={studentPass} show={showSecrets} />
                    {student.username?.trim() ? (
                      <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">{student.username.trim()}</p>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEnterPanel(student, 'parent')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-[11px] font-bold"
                        title="Veli paneline gizli giriş"
                      >
                        <LogIn className="w-3.5 h-3.5" /> Veli
                      </button>
                      <button
                        type="button"
                        onClick={() => onEnterPanel(student, 'student')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-bold"
                        title="Öğrenci paneline gizli giriş"
                      >
                        <GraduationCap className="w-3.5 h-3.5" /> Öğrenci
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ParentAccessTable;
