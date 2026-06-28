import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Loader2, Unlink } from 'lucide-react';
import type { Student } from '../../types';
import { startLichessOAuthFlow } from '../../lib/lichessOAuth';
import {
  disconnectLichessOAuth,
  fetchLichessOAuthStatus,
} from '../../services/lichessOAuthClient';
import { useApp } from '../../AppContext';

type Props = {
  student: Student;
  onConnected?: () => void;
  onDisconnected?: () => void;
  compact?: boolean;
};

export const LichessOAuthConnect: React.FC<Props> = ({
  student,
  onConnected,
  onDisconnected,
  compact = false,
}) => {
  const { confirmDialog } = useApp();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [oauthUsername, setOauthUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchLichessOAuthStatus(student.id);
      setConnected(status.connected);
      setOauthUsername(status.lichessUsername ?? student.lichessUsername ?? null);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [student.id, student.lichessUsername]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await startLichessOAuthFlow(student.id, '#/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlantı başlatılamadı');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirmDialog({
      title: 'Bağlantıyı kaldır',
      message: 'Lichess bağlantısını kaldırmak istiyor musunuz?',
      confirmLabel: 'Kaldır',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disconnectLichessOAuth(student.id);
      if (!result.ok) {
        setError(result.error ?? 'Bağlantı kaldırılamadı');
        return;
      }
      setConnected(false);
      onDisconnected?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Lichess durumu kontrol ediliyor…
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[#81b64c]/20 bg-[#81b64c]/5 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-bold text-[#a5d46f] ${compact ? 'text-xs' : 'text-sm'}`}>
            Lichess bulmaca takibi
          </p>
          <p className={`text-slate-400 mt-1 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {connected
              ? 'Hesabınız bağlı. Çözdüğünüz bulmacalar ödevlerde tek tek görünür.'
              : 'Lichess hesabınızı bağlayın; ödevlerde hangi bulmacaları çözdüğünüz görünsün.'}
          </p>
          {(oauthUsername || student.lichessUsername) && (
            <p className="text-[11px] text-slate-500 mt-1">
              Kullanıcı adı: @{oauthUsername || student.lichessUsername}
            </p>
          )}
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            Bağlı
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-rose-300">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#81b64c] hover:bg-[#9acd6a] text-[#1a1a18] text-xs font-black uppercase tracking-wide disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Lichess hesabını bağla
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Bağlantıyı kaldır
          </button>
        )}
        <a
          href="https://lichess.org/training"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Lichess bulmaca
        </a>
      </div>
    </div>
  );
};

export default LichessOAuthConnect;
