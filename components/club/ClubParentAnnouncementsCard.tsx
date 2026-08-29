import React, { useCallback, useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import {
  addClubAnnouncement,
  listClubAnnouncements,
  removeClubAnnouncement,
} from '../../lib/clubAnnouncements';

type Props = {
  clubId: string;
  clubName?: string;
};

const ClubParentAnnouncementsCard: React.FC<Props> = ({ clubId, clubName }) => {
  const [rows, setRows] = useState(() => listClubAnnouncements(clubId));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    setRows(listClubAnnouncements(clubId));
  }, [clubId]);

  const handlePublish = () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    addClubAnnouncement({ clubId, title: t, body: b });
    setTitle('');
    setBody('');
    setOpen(false);
    refresh();
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#1e293b]/75 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-300 shrink-0">
            <Megaphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">Veli paneli duyuruları</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {clubName ? `${clubName} velilerinin özet ekranında görünür` : 'Veli özet ekranında görünür'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25"
        >
          <Plus className="w-3.5 h-3.5" />
          Yeni
        </button>
      </div>

      {open ? (
        <div className="mb-4 space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Duyuru başlığı"
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/40"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Duyuru metni"
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500/40 resize-y min-h-[4.5rem]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
            >
              Yayınla
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">Henüz kulüp duyurusu yok.</p>
      ) : (
        <ul className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
          {rows.slice(0, 6).map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{a.title}</p>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{a.body}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  removeClubAnnouncement(a.id, clubId);
                  refresh();
                }}
                className="shrink-0 p-1.5 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10"
                title="Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClubParentAnnouncementsCard;
