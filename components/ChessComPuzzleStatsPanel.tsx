import React, { useState } from 'react';
import { Clock, ExternalLink, Star } from 'lucide-react';
import type { ChessComMemberStats, ChessComPuzzleAttempt, ChessComStats } from '../services/chessPlatformService';
import ChessComRecentPuzzlesTable from './ChessComRecentPuzzlesTable';
import ChessComPuzzleViewerModal from './ChessComPuzzleViewerModal';

type ChessComPuzzleStatsPanelProps = {
  memberStats: ChessComMemberStats | null;
  pubStats?: ChessComStats | null;
  username?: string;
};

function formatIsoDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDuration(totalSeconds: number, attempts: number): string {
  if (attempts <= 0 || totalSeconds <= 0) return '—';
  const avg = Math.round(totalSeconds / attempts);
  const m = Math.floor(avg / 60);
  const s = avg % 60;
  return m > 0 ? `${m} saat ${s} dakika` : `${s} saniye`;
}

const ChessComPuzzleStatsPanel: React.FC<ChessComPuzzleStatsPanelProps> = ({
  memberStats,
  pubStats,
  username,
}) => {
  const [viewerAttempt, setViewerAttempt] = useState<ChessComPuzzleAttempt | null>(null);
  const tactics = memberStats?.tactics;
  const rush = memberStats?.puzzleRush;
  const pubTacticsHigh = pubStats?.tactics?.highest?.rating ?? 0;
  const hasTactics =
    (tactics != null && (tactics.rating > 0 || tactics.attemptCount > 0)) || pubTacticsHigh > 0;
  const hasRush = rush != null && rush.highestScore > 0;

  if (!hasTactics && !hasRush) {
    return (
      <p className="text-slate-500 text-sm py-6 text-center rounded-xl bg-slate-800/40 border border-slate-700/50">
        Bulmaca istatistiği bulunamadı. Chess.com kullanıcı adını kontrol edin veya sayfayı yenileyin.
      </p>
    );
  }

  const currentRating =
    tactics?.rating && tactics.rating > 0
      ? tactics.rating
      : pubTacticsHigh > 0
        ? pubTacticsHigh
        : null;
  const highest = tactics?.highestRating ?? pubStats?.tactics?.highest?.rating;
  const lowest = tactics?.lowestRating ?? pubStats?.tactics?.lowest?.rating;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧩</span>
            <div>
              <h3 className="text-base font-black text-white">Bulmacalar</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Puanlı taktik bulmacalar</p>
            </div>
          </div>
          {username ? (
            <a
              href={`https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
            >
              <ExternalLink className="w-3 h-3" /> Chess.com&apos;da aç
            </a>
          ) : null}
        </div>

        {currentRating != null ? (
          <div className="mb-5">
            <div className="text-4xl md:text-5xl font-black text-white tabular-nums">{currentRating}</div>
            <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">Güncel bulmaca rating</div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {highest != null ? (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">En Yüksek Puan</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{highest}</div>
              {tactics?.highestRatingDate ? (
                <div className="text-[9px] text-slate-500 mt-0.5">{formatIsoDate(tactics.highestRatingDate)}</div>
              ) : null}
            </div>
          ) : null}
          {lowest != null ? (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">En Düşük</div>
              <div className="text-2xl font-black text-rose-400 mt-1">{lowest}</div>
            </div>
          ) : null}
          {tactics?.attemptCount != null && tactics.attemptCount > 0 ? (
            <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-4 py-3 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Puanlı Bulmacalar</div>
              <div className="text-2xl font-black text-sky-400 mt-1">{tactics.attemptCount.toLocaleString('tr-TR')}</div>
            </div>
          ) : null}
          {tactics?.totalSeconds != null && tactics.attemptCount > 0 ? (
            <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Puanlı Antrenman</div>
              <div className="text-sm font-black text-violet-300 mt-2 leading-tight">
                {formatDuration(tactics.totalSeconds, tactics.attemptCount)}
              </div>
            </div>
          ) : null}
        </div>

        {tactics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-emerald-500/5 border border-slate-700/40 px-3 py-2 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Doğru</div>
              <div className="text-lg font-black text-emerald-400">{tactics.passedCount.toLocaleString('tr-TR')}</div>
            </div>
            <div className="rounded-lg bg-rose-500/5 border border-slate-700/40 px-3 py-2 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Yanlış</div>
              <div className="text-lg font-black text-rose-400">{tactics.failedCount.toLocaleString('tr-TR')}</div>
            </div>
            <div className="rounded-lg bg-amber-500/5 border border-slate-700/40 px-3 py-2 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Başarı Oranı</div>
              <div className="text-lg font-black text-amber-400">
                {tactics.attemptCount > 0
                  ? `%${Math.round((tactics.passedCount / tactics.attemptCount) * 100)}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-slate-700/30 border border-slate-700/40 px-3 py-2 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Ort. Süre</div>
              <div className="text-lg font-black text-slate-300">
                {tactics.attemptCount > 0 && tactics.totalSeconds > 0
                  ? `${Math.round(tactics.totalSeconds / tactics.attemptCount)}s`
                  : '—'}
              </div>
            </div>
          </div>
        ) : null}

        {tactics?.lastDate ? (
          <div className="mt-4 text-[10px] text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Son bulmaca: {formatIsoDate(tactics.lastDate)}
          </div>
        ) : null}
      </div>

      {hasRush && rush ? (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Bulmaca Hücumu</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">En İyi Skor</div>
              <div className="text-xl font-black text-amber-400">{rush.highestScore}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Ort. Skor</div>
              <div className="text-xl font-black text-orange-400">{rush.avgScore.toFixed(1)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Oturum</div>
              <div className="text-xl font-black text-slate-300">{rush.attemptCount}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Toplam</div>
              <div className="text-xl font-black text-slate-300">{rush.totalPuzzleAttempts.toLocaleString('tr-TR')}</div>
            </div>
          </div>
        </div>
      ) : null}

      {username ? (
        <ChessComRecentPuzzlesTable username={username} onPuzzleClick={setViewerAttempt} />
      ) : null}

      <p className="text-[10px] text-slate-600 leading-relaxed px-1">
        Özet istatistikler Chess.com callback ile alınır. Tüm bulmaca geçmişi için üstteki{' '}
        <span className="text-slate-400">Bulmacalar</span> sekmesine bakın.
      </p>

      <ChessComPuzzleViewerModal attempt={viewerAttempt} onClose={() => setViewerAttempt(null)} />
    </div>
  );
};

export default ChessComPuzzleStatsPanel;
