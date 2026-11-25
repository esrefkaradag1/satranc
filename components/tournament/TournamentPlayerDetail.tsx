import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Flame, X } from 'lucide-react';
import type { Tournament } from '../../types';
import { playerGameLog, type PlayerGameEntry } from '../../lib/tournamentPairing';

interface TournamentPlayerDetailProps {
  tournament: Tournament;
  playerId: string;
  /** Oyuncu adı */
  nameOf: (id: string) => string;
  /** Sıralamadaki yeri (yoksa null) */
  rankOf: (id: string) => number | null;
  onClose: () => void;
}

function pctText(n: number, d: number): string {
  if (d <= 0) return '—';
  return `%${Math.round((n / d) * 100)}`;
}

function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function PointsCell({ g }: { g: PlayerGameEntry }) {
  if (g.outcome === 'pending') {
    return <span className="text-slate-400 font-bold" title="Maç sürüyor">*</span>;
  }
  const tone =
    g.outcome === 'loss' ? 'text-slate-500'
      : g.onFire ? 'text-orange-400'
        : g.outcome === 'win' ? 'text-emerald-400'
          : 'text-amber-300';
  return (
    <span className={`inline-flex items-center gap-1 font-black tabular-nums ${tone}`}>
      {g.onFire && <Flame className="w-3.5 h-3.5" aria-label="Seri bonusu" />}
      {formatPoints(g.points)}
    </span>
  );
}

/**
 * Turnuvada bir oyuncuya tıklayınca açılan özet (lichess Arena oyuncu kartı gibi):
 * toplam puan, maç/kazanma/beraberlik oranı ve her maç için rakip, renk ve alınan puan.
 */
export const TournamentPlayerDetail: React.FC<TournamentPlayerDetailProps> = ({
  tournament,
  playerId,
  nameOf,
  rankOf,
  onClose,
}) => {
  const games = useMemo(() => playerGameLog(tournament, playerId), [tournament, playerId]);
  // En yeni maç en üstte (lichess'teki gibi).
  const ordered = useMemo(() => games.slice().reverse(), [games]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finished = games.filter((g) => g.outcome !== 'pending' && g.outcome !== 'bye');
  const wins = finished.filter((g) => g.outcome === 'win').length;
  const draws = finished.filter((g) => g.outcome === 'draw').length;
  const totalPoints = games.reduce((n, g) => n + g.points, 0);
  const rank = rankOf(playerId);
  const firesCount = games.filter((g) => g.onFire).length;

  const stats: Array<[string, string]> = [
    ['Toplam puan', formatPoints(totalPoints)],
    ['Oynanmış maç', String(finished.length)],
    ['Kazanma oranı', pctText(wins, finished.length)],
    ['Beraberlik oranı', pctText(draws, finished.length)],
    ...(tournament.format === 'arena' && firesCount > 0
      ? ([['Seri bonuslu maç', String(firesCount)]] as Array<[string, string]>)
      : []),
  ];

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${nameOf(playerId)} turnuva maçları`}
        className="w-full max-w-md rounded-2xl bg-[#111827] border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 bg-slate-800/60">
          <h3 className="text-base font-black text-white truncate">
            {rank != null && <span className="text-indigo-300 mr-1.5">{rank}.</span>}
            {nameOf(playerId)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="px-5 py-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm border-b border-white/[0.06]">
          {stats.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-slate-400">{label}</dt>
              <dd className="font-bold text-white tabular-nums text-right">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {ordered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Bu oyuncu henüz maç oynamadı.</p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto divide-y divide-white/[0.05]">
            {ordered.map((g, i) => {
              const oppRank = g.opponentId ? rankOf(g.opponentId) : null;
              return (
                <li
                  key={`${g.roundNo}-${g.opponentId ?? 'bye'}-${i}`}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-white/[0.03]"
                >
                  <span className="w-6 shrink-0 text-xs text-slate-500 tabular-nums">{g.roundNo}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">
                    {g.opponentId == null ? (
                      <span className="text-slate-400 italic">Bay (rakipsiz)</span>
                    ) : (
                      <>
                        {oppRank != null && <span className="text-slate-500 mr-1.5 tabular-nums">#{oppRank}</span>}
                        {nameOf(g.opponentId)}
                      </>
                    )}
                  </span>
                  {g.opponentId != null && (
                    <span
                      title={g.color === 'white' ? 'Beyaz oynadı' : 'Siyah oynadı'}
                      className={`shrink-0 w-3 h-3 rounded-full border ${
                        g.color === 'white' ? 'bg-slate-200 border-slate-300' : 'bg-slate-700 border-slate-500'
                      }`}
                    />
                  )}
                  <span className="w-12 shrink-0 text-right">
                    <PointsCell g={g} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default TournamentPlayerDetail;
