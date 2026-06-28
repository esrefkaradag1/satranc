import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ClipboardList, Link2, Pencil } from 'lucide-react';
import type { StudentLessonLogEntry } from '../../types';
import { useApp } from '../../AppContext';
import {
  emptyLessonLogDraft,
  extractLessonLogUrls,
  formatLessonDateForInput,
  sortLessonLogEntries,
} from '../../lib/lessonLogUtils';

type Props = {
  groupName: string;
  entries: StudentLessonLogEntry[];
  onSave: (entries: StudentLessonLogEntry[]) => void;
  compact?: boolean;
};

export const GroupLessonLogPanel: React.FC<Props> = ({
  groupName,
  entries,
  onSave,
  compact = false,
}) => {
  const { confirmDialog } = useApp();
  const [localEntries, setLocalEntries] = useState<StudentLessonLogEntry[]>(() =>
    sortLessonLogEntries(entries),
  );
  const [draft, setDraft] = useState<StudentLessonLogEntry>(emptyLessonLogDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setLocalEntries(sortLessonLogEntries(entries));
    setDraft(emptyLessonLogDraft());
    setEditingId(null);
  }, [groupName, entries]);

  const sorted = useMemo(() => sortLessonLogEntries(localEntries), [localEntries]);

  const persistEntries = (next: StudentLessonLogEntry[]) => {
    const sortedNext = sortLessonLogEntries(next);
    setLocalEntries(sortedNext);
    onSave(sortedNext);
  };

  const upsertDraft = () => {
    const topic = draft.topic.trim();
    const info = draft.info.trim();
    const date = draft.date.trim();
    if (!topic && !info) return;

    const row: StudentLessonLogEntry = {
      ...draft,
      date: date || draft.date,
      topic,
      info,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
    };

    if (editingId) {
      persistEntries(localEntries.map((e) => (e.id === editingId ? row : e)));
      setEditingId(null);
    } else {
      persistEntries([...localEntries, row]);
    }
    setDraft(emptyLessonLogDraft());
  };

  const startEdit = (row: StudentLessonLogEntry) => {
    setEditingId(row.id);
    setDraft({ ...row, date: formatLessonDateForInput(row.date) });
  };

  const removeRow = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Kaydı sil',
      message: 'Bu konu kaydını silmek istiyor musunuz?',
      confirmLabel: 'Sil',
      variant: 'danger',
    });
    if (!ok) return;
    persistEntries(localEntries.filter((e) => e.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft(emptyLessonLogDraft());
    }
  };

  return (
    <div className={`rounded-xl border border-indigo-500/20 bg-[#0f172a]/50 overflow-hidden ${compact ? '' : 'shadow-lg shadow-indigo-500/5'}`}>
      <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] bg-gradient-to-r from-indigo-600/10 to-violet-600/5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">Grup Ders Konuları</h3>
            <p className="text-[10px] text-slate-500 truncate">{groupName} · {sorted.length} kayıt</p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          Bu grupta işlenen konuları tek seferde ekleyin. Grup seçildiğinde tüm antrenörler burada görür; öğrenci bazında tek tek girmenize gerek kalmaz.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-xl bg-black/20 border border-white/[0.05]">
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
            <input
              type="text"
              placeholder="chess.com ders linki, ödev notu..."
              value={draft.info}
              onChange={(e) => setDraft((d) => ({ ...d, info: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-600/60 text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </label>
          <div className="sm:col-span-12 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={upsertDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              {editingId ? 'Güncelle' : 'Konu Ekle'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => { setEditingId(null); setDraft(emptyLessonLogDraft()); }}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 text-xs font-semibold hover:bg-white/5"
              >
                İptal
              </button>
            ) : null}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="py-8 text-center rounded-xl border border-dashed border-white/10 text-slate-500 text-sm">
            Bu grup için henüz konu eklenmemiş.
          </div>
        ) : (
          <div className="space-y-2 max-h-[min(40vh,320px)] overflow-y-auto custom-scrollbar pr-1">
            {sorted.map((row) => {
              const urls = extractLessonLogUrls(row.info);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-indigo-500/20 transition-colors"
                >
                  <div className="shrink-0 w-20 text-[11px] font-semibold text-slate-400 tabular-nums pt-0.5">
                    {formatLessonDateForInput(row.date) || '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{row.topic || '—'}</p>
                    {row.info ? (
                      <p className="text-xs text-slate-400 mt-1 break-words whitespace-pre-wrap">{row.info}</p>
                    ) : null}
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
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      title="Düzenle"
                      onClick={() => startEdit(row)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Sil"
                      onClick={() => removeRow(row.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};
