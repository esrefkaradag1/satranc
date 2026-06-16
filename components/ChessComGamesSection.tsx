import React from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import type { ChessComGame } from '../services/chessPlatformService';

function formatChessComDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ChessComGamesSectionProps = {
  games: ChessComGame[];
  username: string;
  profileUsername?: string;
  loading?: boolean;
  progress?: number;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onGameClick: (game: ChessComGame) => void;
  refreshDisabled?: boolean;
};

const ChessComGamesSection: React.FC<ChessComGamesSectionProps> = ({
  games,
  username,
  profileUsername,
  loading,
  progress = 0,
  onRefresh,
  onLoadMore,
  hasMore,
  loadingMore,
  onGameClick,
  refreshDisabled,
}) => {
  const me = (username || profileUsername || '').toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-white">Oyun geçmişi</h3>
          {games.length > 0 ? (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {games.length.toLocaleString('tr-TR')} oyun yüklendi
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {username ? (
            <a
              href={`https://www.chess.com/member/${encodeURIComponent(username)}/games`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Chess.com&apos;da aç
            </a>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshDisabled}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium disabled:opacity-50"
            >
              Yenile
            </button>
          ) : null}
        </div>
      </div>

      {loading && games.length === 0 ? (
        <div className="rounded-lg bg-slate-800/50 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            Maçlar yükleniyor…
            {progress > 0 ? ` ${progress.toLocaleString('tr-TR')} oyun` : ''}
          </span>
        </div>
      ) : null}

      {!loading && games.length === 0 ? (
        <p className="text-slate-500 text-sm py-8 text-center rounded-xl bg-slate-800/40 border border-slate-700/50">
          Kayıtlı oyun bulunamadı.
        </p>
      ) : null}

      {games.length > 0 ? (
        <>
          <div className="hidden sm:grid grid-cols-[72px_1fr_72px_64px_48px_80px] gap-2 px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-700/60">
            <span>Tür</span>
            <span>Oyuncular</span>
            <span className="text-center">Sonuç</span>
            <span className="text-center">Doğruluk</span>
            <span className="text-center">Hamle</span>
            <span className="text-right">Tarih</span>
          </div>
          <div className="space-y-1.5 max-h-[min(65vh,560px)] overflow-y-auto pr-1">
            {games.map((g, idx) => {
              const whiteName = (g.white?.username ?? '').toLowerCase();
              const blackName = (g.black?.username ?? '').toLowerCase();
              const isWhite = whiteName === me;
              const isBlack = blackName === me;
              const myResult = isWhite ? (g.white?.result ?? '') : (g.black?.result ?? '');
              const isWin = myResult === 'win';
              const isLoss = ['checkmated', 'resigned', 'timeout', 'abandoned', 'lose', 'loss'].includes(myResult);
              const isDraw = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(myResult);
              const resultLabel = isWin ? 'Galibiyet' : isLoss ? 'Mağlubiyet' : isDraw ? 'Beraberlik' : myResult || '—';
              const scoreText = isWin ? (isWhite ? '1 - 0' : '0 - 1') : isLoss ? (isWhite ? '0 - 1' : '1 - 0') : '½ - ½';
              const timeClass = g.time_class || '—';
              const timeIcon = timeClass === 'rapid' ? '⏱' : timeClass === 'blitz' ? '⚡' : timeClass === 'bullet' ? '🔴' : timeClass === 'daily' ? '📅' : '♟';
              const endDate = g.end_time ? formatChessComDate(g.end_time) : '';
              const myAccuracy = isWhite ? g.accuracies?.white : g.accuracies?.black;
              const oppAccuracy = isWhite ? g.accuracies?.black : g.accuracies?.white;
              let moveCount = 0;
              if (g.pgn) {
                const moveMatches = g.pgn.match(/\d+\./g);
                if (moveMatches) moveCount = moveMatches.length;
              }
              const borderColor = isWin ? 'border-l-emerald-500' : isLoss ? 'border-l-rose-500' : 'border-l-slate-500';

              return (
                <button
                  key={g.uuid || g.url || idx}
                  type="button"
                  onClick={() => onGameClick(g)}
                  className={`w-full text-left rounded-lg bg-slate-800/40 border border-slate-700/50 border-l-4 ${borderColor} px-3 py-2.5 hover:border-emerald-500/40 hover:bg-slate-800/70 transition-colors cursor-pointer`}
                >
                  <div className="grid grid-cols-[72px_1fr_72px_64px_48px_80px] gap-2 items-center">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-sm leading-none">{timeIcon}</span>
                      <span className="text-[9px] text-slate-500 uppercase font-bold mt-0.5 truncate max-w-[68px]">
                        {g.time_control || timeClass}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-sm bg-white border border-slate-600 shrink-0" />
                        <span className={`font-medium truncate ${isWhite ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {g.white?.username ?? 'Anonim'}
                        </span>
                        <span className="text-slate-500 shrink-0">({g.white?.rating ?? '?'})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs mt-0.5">
                        <span className="w-2 h-2 rounded-sm bg-slate-700 border border-slate-600 shrink-0" />
                        <span className={`font-medium truncate ${isBlack ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {g.black?.username ?? 'Anonim'}
                        </span>
                        <span className="text-slate-500 shrink-0">({g.black?.rating ?? '?'})</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-black ${isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'}`}>
                        {scoreText}
                      </div>
                      <div className={`text-[9px] font-bold uppercase ${isWin ? 'text-emerald-500' : isLoss ? 'text-rose-500' : 'text-slate-500'}`}>
                        {resultLabel}
                      </div>
                    </div>
                    <div className="text-center">
                      {myAccuracy != null ? (
                        <>
                          <div className="text-xs font-bold text-sky-400">{myAccuracy.toFixed(1)}</div>
                          {oppAccuracy != null ? (
                            <div className="text-[9px] text-slate-500">{oppAccuracy.toFixed(1)}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[9px] text-slate-600">—</span>
                      )}
                    </div>
                    <div className="text-center text-xs font-bold text-slate-400">{moveCount > 0 ? moveCount : '—'}</div>
                    <div className="text-right text-[10px] text-slate-500 flex items-center justify-end gap-1">
                      <Calendar className="w-3 h-3 hidden sm:block" />
                      {endDate}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">{games.length.toLocaleString('tr-TR')} oyun</span>
            {hasMore && onLoadMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Devam (20)
              </button>
            ) : games.length > 0 ? (
              <span className="text-[11px] text-emerald-400 font-medium">Tümü yüklendi</span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ChessComGamesSection;
