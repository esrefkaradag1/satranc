import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Pencil, Trash2, Link2 } from 'lucide-react';
import type { Student, StudentLessonLogEntry } from '../../types';
import {
  emptyLessonLogDraft,
  extractLessonLogUrls,
  formatLessonDateForInput,
  sortLessonLogEntries,
} from '../../lib/lessonLogUtils';

type Props = {
  student: Student;
  defaultDate: string;
  onSave: (entries: StudentLessonLogEntry[]) => void;
};

export const StudentLessonLogInline: React.FC<Props> = ({
  student,
  defaultDate,
  onSave,
}) => {
  const [entries, setEntries] = useState<StudentLessonLogEntry[]>(() =>
    sortLessonLogEntries(student.lessonLog ?? []),
  );
  const [draft, setDraft] = useState<StudentLessonLogEntry>(() => ({
    ...emptyLessonLogDraft(),
    date: defaultDate,
  }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEntries(sortLessonLogEntries(student.lessonLog ?? []));
    setDraft({ ...emptyLessonLogDraft(), date: defaultDate });
    setEditingId(null);
    setDirty(false);
  }, [student.id, student.lessonLog, defaultDate]);

  const sorted = useMemo(() => sortLessonLogEntries(entries), [entries]);
  const recent = sorted.slice(0, 4);

  const upsertDraft = () => {
    const topic = draft.topic.trim();
    const info = draft.info.trim();
    if (!topic && !info) return;
    const row: StudentLessonLogEntry = {
      ...draft,
      date: draft.date.trim() || defaultDate,
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
    setDraft({ ...emptyLessonLogDraft(), date: defaultDate });
    setDirty(true);
  };

  const removeRow = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft({ ...emptyLessonLogDraft(), date: defaultDate });
    }
    setDirty(true);
  };

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-[#0f172a]/80 p-4 space-y-3">
      <p className="text-xs text-slate-400">
        <span className="text-white font-semibold">{student.name}</span> için özel ders notu — grup konularına ek olarak kaydedilir.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <input
          type="text"
          placeholder="Tarih"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          className="sm:col-span-2 input-base py-2 text-xs rounded-lg"
        />
        <input
          type="text"
          placeholder="Konu (ör. mat çalışması)"
          value={draft.topic}
          onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
          className="sm:col-span-4 input-base py-2 text-xs rounded-lg"
        />
        <input
          type="text"
          placeholder="Not / link"
          value={draft.info}
          onChange={(e) => setDraft((d) => ({ ...d, info: e.target.value }))}
          className="sm:col-span-4 input-base py-2 text-xs rounded-lg"
        />
        <button
          type="button"
          onClick={upsertDraft}
          className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          {editingId ? 'Güncelle' : 'Ekle'}
        </button>
      </div>

      {recent.length > 0 ? (
        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
          {recent.map((row) => {
            const urls = extractLessonLogUrls(row.info);
            return (
              <div
                key={row.id}
                className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs"
              >
                <span className="text-slate-500 shrink-0 tabular-nums w-16">
                  {formatLessonDateForInput(row.date)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-white font-semibold">{row.topic || '—'}</span>
                  {row.info ? <span className="text-slate-400 ml-1">· {row.info}</span> : null}
                  {urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 ml-2 text-indigo-400 hover:text-indigo-300"
                    >
                      <Link2 className="w-3 h-3" /> link
                    </a>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(row.id);
                    setDraft({ ...row, date: formatLessonDateForInput(row.date) });
                  }}
                  className="p-1 text-slate-500 hover:text-indigo-300"
                  title="Düzenle"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="p-1 text-slate-500 hover:text-rose-400"
                  title="Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Bu öğrenci için henüz kayıt yok.</p>
      )}

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onSave(sortLessonLogEntries(entries));
              setDirty(false);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg premium-gradient text-white text-xs font-bold shadow-md shadow-indigo-500/20"
          >
            <Save className="w-3.5 h-3.5" />
            Öğrenci notunu kaydet
          </button>
        </div>
      )}
    </div>
  );
};
