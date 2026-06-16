import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, X as XIcon } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import {
  fetchChessComPuzzlesBundleWithMeta,
  formatChessComPuzzleTime,
  type ChessComPuzzleAttempt,
  type ChessComPuzzleTab,
} from '../services/chessPlatformService';
import { formatChessComApiError } from '../lib/chesscomPuzzleParse';
import { CHESSBOARD_NO_NOTATION } from '../lib/chessBoardUi';

type ChessComRecentPuzzlesTableProps = {
  username: string;
  onPuzzleClick: (attempt: ChessComPuzzleAttempt) => void;
  /** Oyunlar sekmesindeki gibi kompakt başlık */
  compact?: boolean;
};

const TABS: { id: ChessComPuzzleTab; label: string }[] = [
  { id: 'rated', label: 'Puanlı' },
  { id: 'learning', label: 'Özel' },
  { id: 'rush', label: 'Hücum' },
];

function formatPuzzleDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function MiniBoardPreview({ fen, flip }: { fen?: string; flip?: boolean }) {
  if (!fen?.trim()) return null;
  return (
    <div className="hidden lg:block absolute right-2 top-1/2 -translate-y-1/2 z-10 w-[120px] h-[120px] rounded-lg border-2 border-white/90 shadow-xl overflow-hidden pointer-events-none">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: flip ? 'black' : 'white',
          allowDragging: false,
          showNotation: false,
          darkSquareStyle: { backgroundColor: '#779952' },
          lightSquareStyle: { backgroundColor: '#edeed1' },
          ...CHESSBOARD_NO_NOTATION,
        }}
      />
    </div>
  );
}

const ChessComRecentPuzzlesTable: React.FC<ChessComRecentPuzzlesTableProps> = ({
  username,
  onPuzzleClick,
  compact = false,
}) => {
  const [tab, setTab] = useState<ChessComPuzzleTab>('rated');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [bundle, setBundle] = useState<{
    rated: ChessComPuzzleAttempt[];
    learning: ChessComPuzzleAttempt[];
    rush: ChessComPuzzleAttempt[];
    profileUrl?: string;
  } | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const un = username.trim();
    if (!un) {
      setBundle(null);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await fetchChessComPuzzlesBundleWithMeta(un);
      setBundle(data);
      setLoadError(error ? formatChessComApiError(error) : null);
    } catch {
      setBundle(null);
      setLoadError('Chess.com bulmacaları yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const rawAttempts = useMemo(() => {
    if (!bundle) return [];
    if (tab === 'learning') return bundle.learning;
    if (tab === 'rush') return bundle.rush;
    return bundle.rated;
  }, [bundle, tab]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const a of rawAttempts) {
      if (!a.date) continue;
      months.add(a.date.slice(0, 7));
    }
    return [...months].sort().reverse();
  }, [rawAttempts]);

  const attempts = useMemo(() => {
    if (monthFilter === 'all') return rawAttempts;
    return rawAttempts.filter((a) => a.date?.startsWith(monthFilter));
  }, [rawAttempts, monthFilter]);

  const profileUrl =
    bundle?.profileUrl ??
    (username.trim()
      ? `https://www.chess.com/member/${encodeURIComponent(username.trim())}/stats/puzzles`
      : undefined);

  const hoverAttempt = attempts.find((a) => a.id === hoverId);

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 overflow-hidden">
      <div className={`px-4 ${compact ? 'pt-3 pb-2' : 'pt-4 pb-2'} border-b border-slate-700/50`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className={`${compact ? 'text-sm' : 'text-base'} font-black text-white`}>En Son Bulmacalar</h3>
            {rawAttempts.length > 0 ? (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {attempts.length.toLocaleString('tr-TR')}
                {monthFilter !== 'all' ? ` / ${rawAttempts.length.toLocaleString('tr-TR')}` : ''} bulmaca
                {monthFilter !== 'all' ? ' (filtreli)' : ' · Chess.com son kayıtlar'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Chess.com&apos;da aç
              </a>
            ) : null}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium disabled:opacity-50"
            >
              Yenile
            </button>
          </div>
        </div>
        {availableMonths.length > 0 ? (
          <label className="flex items-center gap-2 text-[10px] text-slate-400 mb-2">
            Ay:
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-600 text-white text-xs [color-scheme:dark]"
            >
              <option value="all">Tümü</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {new Date(`${m}-01T12:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex gap-4 border-b border-slate-700/60 -mb-px">
          {TABS.map((t) => {
            const count =
              t.id === 'rated'
                ? bundle?.rated.length ?? 0
                : t.id === 'learning'
                  ? bundle?.learning.length ?? 0
                  : bundle?.rush.length ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`pb-2 text-xs font-bold uppercase tracking-wide transition-colors border-b-2 ${
                  tab === t.id
                    ? 'text-white border-white'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                {t.label}
                {count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {loading && !bundle ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          Bulmacalar yükleniyor…
        </div>
      ) : null}

      {loadError ? (
        <div className="px-4 py-6 text-center text-sm text-rose-400/90 leading-relaxed border-b border-slate-700/40">
          {loadError}
          <p className="text-[10px] text-slate-500 mt-2">Kullanıcı adını ve Chess.com profil gizliliğini kontrol edin.</p>
        </div>
      ) : null}

      {!loading && !loadError && attempts.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500 leading-relaxed">
          {monthFilter !== 'all' ? 'Seçilen ayda bulmaca yok.' : 'Bu sekmede Chess.com\'da kayıtlı bulmaca yok.'}
          {profileUrl ? (
            <>
              {' '}
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline"
              >
                Profilde görüntüle
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {attempts.length > 0 ? (
        <div className="relative">
          <div className="hidden sm:grid grid-cols-[88px_72px_56px_64px_56px_56px_1fr] gap-2 px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700/40">
            <span>Tarih</span>
            <span>Kimlik No</span>
            <span className="text-right">Puan</span>
            <span className="text-center">Hamleler</span>
            <span className="text-center">Ort Süre</span>
            <span className="text-center">Zamanım</span>
            <span className="text-right">Sonuç</span>
          </div>
          <div className="max-h-[min(50vh,420px)] overflow-y-auto">
            {attempts.map((a) => (
              <button
                key={`${tab}-${a.id}`}
                type="button"
                onClick={() => onPuzzleClick(a)}
                onMouseEnter={() => setHoverId(a.id)}
                onMouseLeave={() => setHoverId(null)}
                className={`relative w-full text-left grid grid-cols-2 sm:grid-cols-[88px_72px_56px_64px_56px_56px_1fr] gap-x-2 gap-y-1 px-4 py-2.5 border-b border-slate-700/30 transition-colors cursor-pointer ${
                  hoverId === a.id
                    ? 'bg-slate-700/50 border-l-4 border-l-emerald-500'
                    : 'hover:bg-slate-700/30 border-l-4 border-l-transparent'
                }`}
              >
                <span className="text-xs text-slate-300 sm:col-auto">{formatPuzzleDate(a.date)}</span>
                <span className="text-xs font-mono text-sky-400 sm:col-auto">{a.id}</span>
                <span className="text-xs text-slate-300 tabular-nums sm:text-right">{a.puzzleRating}</span>
                <span className="text-xs text-slate-400 tabular-nums sm:text-center">
                  {a.movesCorrect}/{a.movesTotal}
                </span>
                <span className="text-xs text-slate-500 tabular-nums sm:text-center">
                  {formatChessComPuzzleTime(a.avgTimeSec)}
                </span>
                <span className="text-xs text-slate-300 tabular-nums sm:text-center">
                  {formatChessComPuzzleTime(a.myTimeSec)}
                </span>
                <span className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2 text-xs">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded ${
                      a.passed ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {a.passed ? <Check className="w-3 h-3" /> : <XIcon className="w-3 h-3" />}
                  </span>
                  <span className={a.ratingChange >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {a.ratingChange > 0 ? `+${a.ratingChange}` : a.ratingChange}
                  </span>
                  <span className="text-slate-500 tabular-nums">{a.myRatingAfter}</span>
                </span>
              </button>
            ))}
          </div>
          {hoverAttempt?.fen ? <MiniBoardPreview fen={hoverAttempt.fen} flip={hoverAttempt.flipBoard} /> : null}
        </div>
      ) : null}
    </div>
  );
};

export default ChessComRecentPuzzlesTable;
