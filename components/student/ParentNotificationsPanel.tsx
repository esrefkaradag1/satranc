import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import type { ParentPanelNotification } from '../../lib/notificationEvents';
import { NOTIFICATION_EVENT_META } from '../../lib/notificationEvents';
import {
  listParentPanelNotifications,
  markAllParentPanelNotificationsReadLocal,
  markParentPanelNotificationReadLocal,
} from '../../lib/parentPanelNotifications';

type ParentNotificationsPanelProps = {
  studentId: string;
  studentName: string;
  onUnreadChange?: (unreadCount?: number) => void;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const ParentNotificationsPanel: React.FC<ParentNotificationsPanelProps> = ({
  studentId,
  studentName,
  onUnreadChange,
}) => {
  const [rows, setRows] = useState<ParentPanelNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listParentPanelNotifications(studentId);
      setRows(list);
      onUnreadChange?.(list.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  }, [studentId, onUnreadChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unread = rows.filter((n) => !n.read).length;

  const markRead = (id: string) => {
    markParentPanelNotificationReadLocal(id, studentId);
    setRows((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      onUnreadChange?.(next.filter((n) => !n.read).length);
      return next;
    });
  };

  const markAllRead = () => {
    markAllParentPanelNotificationsReadLocal(studentId);
    setRows((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      onUnreadChange?.(0);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1e293b]/90 overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-white/10 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-300 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white">Bildirimler</h2>
            <p className="text-xs text-slate-400">
              {studentName} için kulüp bildirimleri
              {unread > 0 ? ` · ${unread} okunmamış` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 bg-slate-800/60 text-slate-200 hover:border-violet-500/30 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Yenile
          </button>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tümünü okundu işaretle
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading && rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 opacity-60" />
            Bildirimler yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center rounded-xl bg-slate-900/40 border border-slate-700/50">
            <Bell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-medium text-sm">Henüz bildirim yok</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Ders yoklaması, antrenman ve diğer kulüp bildirimleri burada görünür.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-[65vh] overflow-y-auto custom-scrollbar">
            {rows.map((n) => {
              const meta = NOTIFICATION_EVENT_META[n.event];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.read && markRead(n.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      n.read
                        ? 'border-white/5 bg-slate-900/30'
                        : 'border-violet-500/25 bg-violet-500/5 hover:bg-violet-500/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white">{n.title}</span>
                          {!n.read ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200">
                              Yeni
                            </span>
                          ) : null}
                          {meta ? (
                            <span className="text-[10px] text-slate-500">{meta.label}</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{n.body}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">{formatWhen(n.createdAt)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ParentNotificationsPanel;
