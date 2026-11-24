import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, Swords, User } from 'lucide-react';
import {
  ChessDuelloApiError,
  chessduelloFullLeaderboard,
  type ChessDuelloLeaderboardEntry,
} from '../../lib/chessduelloClient';

/**
 * ChessDuello klan sıralaması (GET /coach-api/v1/leaderboard) — ilk 3 podyum + liste.
 * Hem öğrenci/veli panelinde hem de yönetim lider tablosunda kullanılır.
 */
export default function ChessDuelloClanLeaderboard({
  clubId,
  highlightUsername,
  highlightMemberId,
  limit = 50,
  compact = false,
}: {
  clubId?: string;
  /** Öğrencinin kendi ChessDuello kullanıcı adı — satırı vurgulanır. */
  highlightUsername?: string | null;
  highlightMemberId?: string | null;
  limit?: number;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<ChessDuelloLeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    chessduelloFullLeaderboard(clubId)
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
        setRows(sorted);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows(null);
        setError(err instanceof ChessDuelloApiError ? err.message : 'Klan sıralaması alınamadı');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const lowerHi = highlightUsername?.trim().toLowerCase() || null;
  const isHighlighted = (e: ChessDuelloLeaderboardEntry) =>
    (!!highlightMemberId && e.id === highlightMemberId) ||
    (!!lowerHi && e.username.trim().toLowerCase() === lowerHi);

  const podium = useMemo(() => (rows ? rows.slice(0, 3) : []), [rows]);
  const rest = useMemo(() => (rows ? rows.slice(3, limit) : []), [rows, limit]);

  if (loading && !rows) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Klan sıralaması yükleniyor…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">{error}</p>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        Henüz ChessDuello klan sıralaması yok. Kulübün ChessDuello anahtarı tanımlı olmalı.
      </p>
    );
  }

  // Podyum sırası: 2 - 1 - 3 (ortada şampiyon)
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as ChessDuelloLeaderboardEntry[];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Swords className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-black text-white">Klan Sıralaması</h3>
      </div>

      {/* Podyum */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end">
        {podiumOrder.map((e) => {
          const place = e.rank;
          const champ = place === 1;
          const ring = champ ? 'ring-amber-400' : place === 2 ? 'ring-slate-300' : 'ring-amber-700';
          const badge = champ ? 'bg-amber-400 text-black' : place === 2 ? 'bg-slate-300 text-black' : 'bg-amber-700 text-white';
          const hi = isHighlighted(e);
          return (
            <div key={e.id} className={`flex flex-col items-center ${champ ? '-mt-3' : ''}`}>
              {champ ? <Crown className="w-5 h-5 text-amber-400 mb-1" /> : <div className="h-6" />}
              <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full ring-2 ${ring} overflow-hidden bg-slate-800 flex items-center justify-center text-slate-300`}>
                {e.avatarUrl ? (
                  <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7" />
                )}
                <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${badge}`}>
                  {place}
                </span>
              </div>
              <div className={`mt-2 w-full rounded-xl px-2 py-2 text-center border ${hi ? 'border-violet-400/60 bg-violet-500/15' : 'border-white/[0.07] bg-slate-800/60'}`}>
                <div className="text-xs font-bold text-white truncate" title={e.username}>{e.username}</div>
                <div className="text-base font-black text-white tabular-nums leading-none mt-0.5">{e.eloRating}</div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">ELO</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Liste (4+) */}
      {rest.length > 0 ? (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.05]">
          {rest.map((e) => {
            const hi = isHighlighted(e);
            return (
              <div
                key={e.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${hi ? 'bg-violet-500/15' : 'bg-slate-900/40'}`}
              >
                <span className="w-7 text-center text-xs font-black text-slate-400 tabular-nums">#{e.rank}</span>
                <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center text-slate-400 shrink-0">
                  {e.avatarUrl ? <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-bold truncate ${hi ? 'text-violet-200' : 'text-white'}`} title={e.username}>
                    {e.username}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-white tabular-nums leading-none">{e.eloRating}</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">ELO</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!compact && rows.length > limit ? (
        <p className="text-[11px] text-slate-500 text-center">İlk {limit} oyuncu gösteriliyor ({rows.length} üye).</p>
      ) : null}
    </div>
  );
}
