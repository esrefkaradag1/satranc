import React from 'react';
import { Building2, GraduationCap, Users, User, SlidersHorizontal } from 'lucide-react';
import type { Student, TrainingGroup, DisciplineBranch } from '../../types';
import type { TargetFilter } from '../../lib/homeworkPanelUtils';
import { disciplinesForOffice, groupsForDiscipline } from '../../lib/homeworkPanelUtils';

type Props = {
  target: TargetFilter;
  onChange: (patch: Partial<TargetFilter>) => void;
  branchOffices: string[];
  disciplineBranches: DisciplineBranch[];
  trainingGroups: TrainingGroup[];
  filteredStudents: Student[];
};

function FilterField({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5 text-indigo-400/80" />
        {label}
      </span>
      {children}
    </label>
  );
}

export const HomeworkTargetSelector: React.FC<Props> = ({
  target,
  onChange,
  branchOffices,
  disciplineBranches,
  trainingGroups,
  filteredStudents,
}) => {
  const disciplines = disciplinesForOffice(disciplineBranches, target.branchOffice);
  const groups = groupsForDiscipline(trainingGroups, target.branchOffice, target.discipline);
  const activeFilters = [
    target.branchOffice,
    target.discipline,
    target.groupId,
    target.mode === 'student' && target.studentId,
  ].filter(Boolean).length;

  return (
    <div className="xl:sticky xl:top-4 h-fit rounded-2xl border border-white/[0.06] bg-[#0f172a]/70 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/20">
      <div className="px-5 py-4 border-b border-white/[0.05] bg-gradient-to-r from-indigo-500/[0.06] to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Hedef Seçimi</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Şube, branş ve grup filtrele</p>
            </div>
          </div>
          {activeFilters > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
              {activeFilters} filtre
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/30">
          <button
            type="button"
            onClick={() => onChange({ mode: 'group', studentId: '' })}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-bold transition-all ${
              target.mode === 'group'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Grup
          </button>
          <button
            type="button"
            onClick={() => onChange({ mode: 'student' })}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-bold transition-all ${
              target.mode === 'student'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Kişi
          </button>
        </div>

        <div className="space-y-3">
          <FilterField icon={Building2} label="Şube">
            <select
              value={target.branchOffice}
              onChange={(e) => onChange({ branchOffice: e.target.value, discipline: '', groupId: '', studentId: '' })}
              className="input-base w-full text-xs"
            >
              <option value="">Tüm şubeler</option>
              {branchOffices.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </FilterField>

          <FilterField icon={GraduationCap} label="Branş">
            <select
              value={target.discipline}
              onChange={(e) => onChange({ discipline: e.target.value, groupId: '', studentId: '' })}
              className="input-base w-full text-xs"
            >
              <option value="">Tüm branşlar</option>
              {disciplines.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </FilterField>

          <FilterField icon={Users} label="Grup">
            <select
              value={target.groupId}
              onChange={(e) => onChange({ groupId: e.target.value, studentId: '' })}
              className="input-base w-full text-xs"
            >
              <option value="">Tüm gruplar</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              {[...new Set(filteredStudents.map((s) => s.group).filter(Boolean))].map((g) => (
                <option key={`legacy-${g}`} value="">{g}</option>
              ))}
            </select>
          </FilterField>

          {target.mode === 'student' && (
            <FilterField icon={User} label="Öğrenci">
              <select
                value={target.studentId}
                onChange={(e) => onChange({ studentId: e.target.value })}
                className="input-base w-full text-xs"
              >
                <option value="">Öğrenci seçiniz</option>
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FilterField>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.05] bg-black/20 flex items-center justify-between">
        <span className="text-[10px] text-slate-500">Listelenen öğrenci</span>
        <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 text-xs font-black tabular-nums">
          {filteredStudents.length}
        </span>
      </div>
    </div>
  );
};
