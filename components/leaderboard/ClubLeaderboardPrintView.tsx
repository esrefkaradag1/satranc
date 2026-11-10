import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import type { LeaderboardEntry } from '../../lib/leaderboardUtils';

type Props = {
  clubName: string;
  /** Örn. "Ekim 2026" veya "Bu Hafta" */
  periodLabel: string;
  entries: LeaderboardEntry[];
  generatedAt: number;
  onClose: () => void;
};

function formatDateTimeTR(ms: number): string {
  try {
    return new Date(ms).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/**
 * Lider tablosu raporu — ApplicationPrintView.tsx ile aynı desen (tarayıcının
 * kendi Yazdır/PDF özelliği, ek kütüphane gerekmez). Ay bitip tablo bir sonraki
 * aya geçtikten SONRA bile önceki ayların arşivlenmiş sonucu (`leaderboard_snapshots`
 * tablosu, her ay kendi anahtarında saklanır) buradan seçilip rapor alınabilir.
 */
const ClubLeaderboardPrintView: React.FC<Props> = ({ clubName, periodLabel, entries, generatedAt, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ranked = [...entries].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/90 print:bg-white print:static print:overflow-visible"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaderboard-print-title"
    >
      <div
        className="fixed top-0 left-0 right-0 z-[201] flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-700 print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-white truncate min-w-0">
          Lider Tablosu Raporu: {clubName} — {periodLabel}
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
          >
            <Printer className="w-3.5 h-3.5" />
            Yazdır / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold"
          >
            <X className="w-4 h-4" />
            Kapat
          </button>
        </div>
      </div>

      <article
        id="leaderboard-print-root"
        className="max-w-3xl mx-auto my-8 mt-20 mb-12 p-8 bg-white text-slate-900 rounded-2xl shadow-2xl print:shadow-none print:my-0 print:mt-0 print:max-w-none print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="text-center border-b border-slate-200 pb-6 mb-6">
          <h1 id="leaderboard-print-title" className="text-2xl font-black">Kulüp Lider Tablosu</h1>
          <p className="text-sm text-slate-600 mt-2 font-semibold">{clubName}</p>
          <p className="text-sm text-slate-600 mt-1">{periodLabel}</p>
          <p className="text-xs text-slate-500 mt-1">Rapor oluşturulma: {formatDateTimeTR(generatedAt)}</p>
        </header>

        {ranked.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-10">Bu dönem için kayıt bulunamadı.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-[11px] font-black uppercase text-slate-500">
                <th className="py-2 pr-2 w-10">#</th>
                <th className="py-2 pr-2">Öğrenci</th>
                <th className="py-2 pr-2 text-right">Bulmaca</th>
                <th className="py-2 pr-2 text-right">Maç</th>
                <th className="py-2 pr-2 text-right">G/B/M</th>
                <th className="py-2 pl-2 text-right">Puan</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((e) => (
                <tr key={e.studentId} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-bold text-slate-500 tabular-nums">{e.rank}</td>
                  <td className="py-2 pr-2">
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-[11px] text-slate-500">{e.group || '—'}</div>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{e.puzzles}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{e.games}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[12px]">
                    <span className="text-emerald-700">{e.wins}</span>
                    {' / '}
                    <span className="text-slate-500">{e.draws}</span>
                    {' / '}
                    <span className="text-rose-700">{e.losses}</span>
                  </td>
                  <td className="py-2 pl-2 text-right font-black tabular-nums">{e.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-center print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold"
          >
            <X className="w-4 h-4" />
            Kapat
          </button>
        </div>
      </article>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #leaderboard-print-root, #leaderboard-print-root * { visibility: visible; }
          #leaderboard-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ClubLeaderboardPrintView;
