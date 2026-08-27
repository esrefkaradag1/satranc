import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Pencil, X } from 'lucide-react';
import type { HomeworkAssignment } from '../../types';
import { homeworkEndDateLabel, homeworkStatusLabel } from '../../lib/homeworkAnalysisUtils';

function toDateInputValue(iso?: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // already YYYY-MM-DD
    return iso.trim().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(baseIso: string | undefined, days: number): string {
  const base = baseIso?.trim()
    ? new Date(baseIso.includes('T') ? baseIso : `${baseIso}T12:00:00`)
    : new Date();
  if (Number.isNaN(base.getTime())) {
    const n = new Date();
    n.setDate(n.getDate() + days);
    return toDateInputValue(n.toISOString());
  }
  // If already expired, extend from today; otherwise from current end
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const from = base < today ? today : base;
  from.setDate(from.getDate() + days);
  return toDateInputValue(from.toISOString());
}

export type HomeworkScheduleEditSave = {
  title: string;
  startDate?: string;
  endDate: string;
  dueDate: string;
};

type Props = {
  homework: HomeworkAssignment;
  mode: 'extend' | 'edit';
  onClose: () => void;
  onSave: (patch: HomeworkScheduleEditSave) => void;
};

export const HomeworkScheduleEditModal: React.FC<Props> = ({
  homework,
  mode,
  onClose,
  onSave,
}) => {
  const status = homeworkStatusLabel(homework);
  const currentEnd = homework.endDate?.trim() || homework.dueDate?.trim() || '';

  const [title, setTitle] = useState(homework.title);
  const [startDate, setStartDate] = useState(toDateInputValue(homework.startDate));
  const [endDate, setEndDate] = useState(() => {
    if (mode === 'extend') return addDaysIso(currentEnd, 7);
    return toDateInputValue(currentEnd);
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(homework.title);
    setStartDate(toDateInputValue(homework.startDate));
    setEndDate(mode === 'extend' ? addDaysIso(currentEnd, 7) : toDateInputValue(currentEnd));
    setError(null);
  }, [homework.id, homework.title, homework.startDate, currentEnd, mode]);

  const quickExtend = useMemo(
    () => [
      { label: '+7 gün', days: 7 },
      { label: '+14 gün', days: 14 },
      { label: '+30 gün', days: 30 },
    ],
    [],
  );

  const handleSave = () => {
    const t = title.trim();
    if (!t) {
      setError('Başlık gerekli');
      return;
    }
    if (!endDate.trim()) {
      setError('Bitiş tarihi gerekli');
      return;
    }
    if (startDate && endDate < startDate) {
      setError('Bitiş tarihi başlangıçtan önce olamaz');
      return;
    }
    setError(null);
    onSave({
      title: t,
      startDate: startDate.trim() || undefined,
      endDate: endDate.trim(),
      dueDate: endDate.trim(),
    });
  };

  return (
    <div className="modal-overlay z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className="modal-panel relative max-w-md bg-[#0f172a] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#1a2332]/80">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'extend' ? (
              <CalendarPlus className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Pencil className="w-5 h-5 text-indigo-400 shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                {mode === 'extend' ? 'Süreyi Uzat' : 'Programı Düzenle'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Şu an: {homeworkEndDateLabel(homework)} · {status}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {mode === 'edit' ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Başlık</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
          ) : null}

          {mode === 'edit' ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Başlangıç</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm font-semibold [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Bitiş tarihi</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-white text-sm font-semibold [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {quickExtend.map((q) => (
              <button
                key={q.days}
                type="button"
                onClick={() => setEndDate(addDaysIso(currentEnd, q.days))}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25"
              >
                {q.label}
              </button>
            ))}
          </div>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex gap-2 justify-end bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white ${
              mode === 'extend'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {mode === 'extend' ? 'Süreyi kaydet' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
