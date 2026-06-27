import React, { useMemo } from 'react';
import { Shield, Check } from 'lucide-react';
import {
  coachGrantablePermissionDefs,
  groupedCoachGrantablePermissions,
  defaultPermissionsForRole,
} from '../../lib/rolePermissions';

type Props = {
  value: string[];
  onChange: (keys: string[]) => void;
};

const BASIC_COACH_KEYS = [
  'dashboard',
  'students',
  'student-list',
  'student-detail',
  'homework',
  'attendance',
  'messages',
];

export const CoachPermissionsPicker: React.FC<Props> = ({ value, onChange }) => {
  const grouped = useMemo(() => groupedCoachGrantablePermissions(), []);
  const allKeys = useMemo(() => coachGrantablePermissionDefs().map((p) => p.key), []);
  const defaultKeys = useMemo(() => defaultPermissionsForRole('coach'), []);

  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5" />
          Panel Yetkileri
        </label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onChange([...defaultKeys])}
            className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Varsayılan
          </button>
          <button
            type="button"
            onClick={() => onChange(BASIC_COACH_KEYS.filter((k) => allKeys.includes(k)))}
            className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Temel
          </button>
          <button
            type="button"
            onClick={() => onChange([...allKeys])}
            className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Tümü
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">
        Antrenör girişinde göreceği menüler. {value.length} / {allKeys.length} izin seçili.
      </p>
      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-950/40 p-2 space-y-3 custom-scrollbar">
        {grouped.map(([category, perms]) => (
          <div key={category}>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">
              {category}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {perms.map((p) => {
                const on = value.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggle(p.key)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] font-medium transition-colors ${
                      on
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-900/60 text-slate-400 border border-transparent hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${
                        on ? 'bg-emerald-500 text-white' : 'bg-slate-700'
                      }`}
                    >
                      {on ? <Check className="w-2.5 h-2.5" /> : null}
                    </span>
                    <span className="truncate">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
