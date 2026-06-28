import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Save, ClipboardList, Link2 } from 'lucide-react';
import type { Student, StudentLessonLogEntry } from '../types';
import { ResponsiveTable } from './ui/ResponsiveTable';
import { useApp } from '../AppContext';

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ll-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** DD.MM.YYYY veya ISO → sıralama için zaman damgası */
function parseLessonDateSortKey(dateStr: string): number {
  const s = dateStr.trim();
  const tr = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (tr) {
    const d = new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
    return d.getTime();
  }
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : 0;
}

function formatDateForInput(isoOrDisplay?: string): string {
  if (!isoOrDisplay?.trim()) return '';
  const tr = isoOrDisplay.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (tr) return isoOrDisplay.trim();
  const d = new Date(isoOrDisplay);
  if (Number.isNaN(d.getTime())) return isoOrDisplay.trim();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function todayTr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function sortEntries(entries: StudentLessonLogEntry[]): StudentLessonLogEntry[] {
  return [...entries].sort((a, b) => parseLessonDateSortKey(b.date) - parseLessonDateSortKey(a.date));
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/gi;
  return (text.match(re) ?? []).map((u) => u.replace(/[.,;]+$/, ''));
}

type Props = {
  student: Student;
  onClose: () => void;
  onSave: (entries: StudentLessonLogEntry[]) => void;
};

const emptyDraft = (): StudentLessonLogEntry => ({
  id: newEntryId(),
  date: todayTr(),
  topic: '',
  info: '',
});

const StudentLessonLogModal: React.FC<Props> = ({ student, onClose, onSave }) => {
  const { confirmDialog } = useApp();
  const [entries, setEntries] = useState<StudentLessonLogEntry[]>(() =>
    sortEntries(student.lessonLog ?? [])
  );
  const [draft, setDraft] = useState<StudentLessonLogEntry>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(() => sortEntries(entries), [entries]);

  const upsertDraft = () => {
    const date = draft.date.trim();
    const topic = draft.topic.trim();
    const info = draft.info.trim();
    if (!date && !topic && !info) return;

    const row: StudentLessonLogEntry = {
      ...draft,
      date: date || todayTr(),
      topic,
      info,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
    };

    if (editingId) {
      setEntries((prev) => prev.map((e) => (e.id === editingId ? row : e)));
      setEditingId(null);
    } else {
      setEntries((prev) => [...prev, row]);
    }
    setDraft(emptyDraft());
  };

  const startEdit = (row: StudentLessonLogEntry) => {
    setEditingId(row.id);
    setDraft({
      ...row,
      date: formatDateForInput(row.date),
    });
  };

  const removeRow = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Kaydı sil',
      message: 'Bu ders kaydını silmek istiyor musunuz?',
      confirmLabel: 'Sil',
      variant: 'danger',
    });
    if (!ok) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft(emptyDraft());
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-labelledby="lesson-log-title"
        className="relative flex flex-col w-full max-w-5xl max-h-[min(92dvh,900px)] bg-[#1e293b]/95 backdrop-blur-2xl border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-700/60 bg-gradient-to-r from-indigo-600/15 to-violet-600/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <ClipboardList className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest">Ders günlüğü</span>
            </div>
            <h2 id="lesson-log-title" className="text-lg sm:text-xl font-bold text-white truncate">
              {student.name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tarih, konu ve bilgi (link / not) — Excel tablonuzdaki gibi kayıt tutun
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-700/50 bg-black/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
            {editingId ? 'Kaydı düzenle' : 'Yeni ders kaydı'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <label className="sm:col-span-2 block">
              <span className="text-[10px] font-bold uppercase text-slate-500">Tarih</span>
              <input
                type="text"
                placeholder="15.05.2026"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-600/60 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
            <label className="sm:col-span-4 block">
              <span className="text-[10px] font-bold uppercase text-slate-500">Konu</span>
              <input
                type="text"
                placeholder="Örn. Mat motifleri, Caro-Kann..."
                value={draft.topic}
                onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-600/60 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
            <label className="sm:col-span-6 block">
              <span className="text-[10px] font-bold uppercase text-slate-500">Bilgi (link, not)</span>
              <textarea
                rows={2}
                placeholder="chess.com ders linki, ödev notu..."
                value={draft.info}
                onChange={(e) => setDraft((d) => ({ ...d, info: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-600/60 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 resize-y min-h-[2.5rem]"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={upsertDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              {editingId ? 'Güncelle' : 'Listeye ekle'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-xs font-semibold hover:bg-white/5"
              >
                İptal
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          <ResponsiveTable minWidth={640}>
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur border-b border-slate-700/60">
              <tr>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[7rem]">
                  Tarih
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Konu
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Bilgi
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-[5.5rem]">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 text-sm">
                    Henüz kayıt yok. Yukarıdan ilk ders satırını ekleyin.
                  </td>
                </tr>
              ) : (
                sorted.map((row) => {
                  const urls = extractUrls(row.info);
                  return (
                    <tr key={row.id} className="hover:bg-white/[0.02] align-top">
                      <td data-label="Tarih" className="px-4 py-3 text-sm text-slate-200 whitespace-nowrap font-medium tabular-nums">
                        {formatDateForInput(row.date)}
                      </td>
                      <td data-label="Konu" className="px-4 py-3 text-sm text-white font-medium">{row.topic || '—'}</td>
                      <td data-label="Bilgi" className="px-4 py-3 text-sm text-slate-300">
                        <div className="whitespace-pre-wrap break-words">{row.info || '—'}</div>
                        {urls.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {urls.map((url) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/25"
                              >
                                <Link2 className="w-3 h-3" />
                                Link
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td data-label="İşlem" className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="Düzenle"
                            onClick={() => startEdit(row)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-amber-500/10 hover:text-amber-400 text-xs font-bold"
                          >
                            Düz.
                          </button>
                          <button
                            type="button"
                            title="Sil"
                            onClick={() => removeRow(row.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </ResponsiveTable>
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-slate-700/60 bg-black/25">
          <p className="text-xs text-slate-500">{sorted.length} kayıt</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm font-semibold hover:bg-white/5"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={() => onSave(sortEntries(entries))}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
            >
              <Save className="w-4 h-4" />
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentLessonLogModal;
