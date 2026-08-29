import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone, ChevronRight, Loader2, CheckCheck } from 'lucide-react';
import type { Student } from '../../types';
import type { ParentPanelNotification } from '../../lib/notificationEvents';
import { NOTIFICATION_EVENT_META } from '../../lib/notificationEvents';
import { parentPanelAnnouncements } from '../../lib/parentPanelFeed';
import {
  listParentPanelNotifications,
  markAllParentPanelNotificationsReadLocal,
  markParentPanelNotificationReadLocal,
} from '../../lib/parentPanelNotifications';

type Props = {
  student: Student;
  onOpenNotifications?: () => void;
  onUnreadChange?: (count: number) => void;
};

function formatWhen(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const ParentHomeFeedPanel: React.FC<Props> = ({
  student,
  onOpenNotifications,
  onUnreadChange,
}) => {
  const [notifications, setNotifications] = useState<ParentPanelNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'notifications' | 'announcements'>('notifications');

  const announcements = useMemo(() => parentPanelAnnouncements(student), [student]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listParentPanelNotifications(student.id);
      setNotifications(rows.slice(0, 8));
      onUnreadChange?.(rows.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  }, [student.id, onUnreadChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;

  const markRead = (id: string) => {
    markParentPanelNotificationReadLocal(id, student.id);
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      onUnreadChange?.(next.filter((n) => !n.read).length);
      return next;
    });
  };

  const markAllRead = () => {
    markAllParentPanelNotificationsReadLocal(student.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadChange?.(0);
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#1e293b]/80 overflow-hidden shadow-lg shadow-black/20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/[0.06] bg-gradient-to-r from-violet-600/10 via-indigo-600/5 to-transparent">
        <div className="min-w-0">
          <h3 className="text-base font-black text-white tracking-tight">Bildirimler & Duyurular</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {student.name} için kulüp bildirimleri ve güncel duyurular
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-950/60 border border-white/10 p-1 shrink-0">
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === 'notifications'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Bildirimler
            {unread > 0 ? (
              <span className="min-w-[1.125rem] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('announcements')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === 'announcements'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            Duyurular
            {announcements.length > 0 ? (
              <span className="text-[10px] font-bold text-slate-300/80">{announcements.length}</span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {tab === 'notifications' ? (
          <>
            {unread > 0 ? (
              <div className="flex justify-end mb-3">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-violet-200"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Tümünü okundu işaretle
                </button>
              </div>
            ) : null}

            {loading ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-60" />
                Yükleniyor…
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center rounded-xl border border-dashed border-white/10 bg-slate-950/30">
                <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-300">Henüz bildirim yok</p>
                <p className="text-xs text-slate-500 mt-1">Yoklama, ders ve antrenman bildirimleri burada görünür.</p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                {notifications.map((n) => {
                  const meta = NOTIFICATION_EVENT_META[n.event];
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                          onOpenNotifications?.();
                        }}
                        className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                          n.read
                            ? 'border-white/5 bg-slate-900/30 hover:bg-slate-900/50'
                            : 'border-violet-500/25 bg-violet-500/5 hover:bg-violet-500/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            n.read ? 'bg-slate-800 text-slate-400' : 'bg-violet-500/20 text-violet-300'
                          }`}>
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-white truncate">{n.title}</p>
                              {!n.read ? (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-200">
                                  Yeni
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              {meta?.label ? `${meta.label} · ` : ''}
                              {formatWhen(n.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-1" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {notifications.length > 0 && onOpenNotifications ? (
              <button
                type="button"
                onClick={onOpenNotifications}
                className="mt-3 w-full py-2.5 rounded-xl border border-white/10 text-xs font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                Tüm bildirimleri gör
              </button>
            ) : null}
          </>
        ) : (
          <>
            {announcements.length === 0 ? (
              <div className="py-10 text-center rounded-xl border border-dashed border-white/10 bg-slate-950/30">
                <Megaphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-300">Henüz duyuru yok</p>
                <p className="text-xs text-slate-500 mt-1">Kulüp ve platform duyuruları burada listelenir.</p>
              </div>
            ) : (
              <ul className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar">
                {announcements.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-4 py-3.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
                        <Megaphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold text-white">{a.title}</p>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            a.source === 'club'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-600/30 text-slate-400'
                          }`}>
                            {a.source === 'club' ? 'Kulüp' : 'Platform'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                        {a.date ? (
                          <p className="text-[10px] text-slate-500 mt-2">{formatDate(a.date)}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ParentHomeFeedPanel;
