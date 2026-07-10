import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Link2, Radio, RefreshCw, Square } from 'lucide-react';
import { parseExternalGameLink, normalizeExternalGamePasteInput } from '../../lib/externalGameLink';
import { startLichessOAuthFlow, LICHESS_OAUTH_SCOPES_BOARD } from '../../lib/lichessOAuth';
import { fetchLichessOAuthStatus } from '../../services/lichessOAuthClient';
import { useStudentExternalGameShare } from '../../hooks/useStudentExternalGameShare';
import type { ExternalGamePasteKind } from '../../lib/externalGamePaste';
import type { LiveStudentBoardSnapshot } from '../LiveLesson';

type Props = {
  studentId: string;
  chessComUsername?: string;
  lichessUsername?: string;
  admitted: boolean;
  onPublish: (snapshot: LiveStudentBoardSnapshot) => void;
  onStop: () => void;
};

function inputKindLabel(kind: ExternalGamePasteKind | null, rawInput: string): string | null {
  if (kind === 'link') {
    const normalized = normalizeExternalGamePasteInput(rawInput);
    if (/emboard/i.test(normalized) || /<iframe/i.test(rawInput)) {
      return 'Embed kodu algılandı (bot oyunu — otomatik güncellenir)';
    }
    return 'Oyun linki algılandı';
  }
  if (kind === 'pgn') return 'PGN algılandı (bot — hamle sonrası yeniden yapıştırın)';
  if (kind === 'fen') return 'FEN algılandı';
  return null;
}

export function StudentExternalGameSharePanel({
  studentId,
  chessComUsername,
  lichessUsername,
  admitted,
  onPublish,
  onStop,
}: Props) {
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthUsername, setOauthUsername] = useState<string | null>(lichessUsername ?? null);
  const [oauthLoading, setOauthLoading] = useState(true);

  const refreshOAuthStatus = useCallback(async () => {
    if (!studentId.trim()) {
      setOauthConnected(false);
      setOauthLoading(false);
      return;
    }
    setOauthLoading(true);
    try {
      const status = await fetchLichessOAuthStatus(studentId);
      setOauthConnected(status.connected);
      setOauthUsername(status.lichessUsername ?? lichessUsername ?? null);
    } catch {
      setOauthConnected(false);
    } finally {
      setOauthLoading(false);
    }
  }, [studentId, lichessUsername]);

  useEffect(() => {
    void refreshOAuthStatus();
  }, [refreshOAuthStatus]);

  const share = useStudentExternalGameShare({
    studentId,
    enabled: admitted,
    lichessOauthConnected: oauthConnected,
    onPublish,
    onStop,
    onOAuthLost: () => { void refreshOAuthStatus(); },
  });

  const parsedLink = parseExternalGameLink(normalizeExternalGamePasteInput(share.linkInput));
  const kindHint = inputKindLabel(share.inputKind, share.linkInput);
  const displayLichessUsername = oauthUsername || lichessUsername;

  return (
    <div className="flex flex-col gap-3 p-3 border-b border-white/[0.06] bg-[#161b26]/50">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Oyunumu paylaş</p>
        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
          <strong className="text-slate-400 font-semibold">Chess.com bot:</strong> Paylaş menüsünden{' '}
          <span className="text-slate-400">PGN</span> metnini,{' '}
          <span className="text-slate-400">FEN</span> alanını veya{' '}
          <span className="text-slate-400">Embed</span> kodunu yapıştırın.
          PGN içindeki <span className="text-slate-500">[Link …]</span> gerçek oyun adresi değildir.
          Canlı PvP maçlarında oyun linki de kullanılabilir.
        </p>
      </div>

      {!admitted ? (
        <p className="text-[10px] text-amber-200/90 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
          Derse alındıktan sonra oyun paylaşabilirsiniz.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold text-slate-500" htmlFor="student-game-paste">
          PGN, FEN, embed veya link
        </label>
        <textarea
          id="student-game-paste"
          value={share.linkInput}
          onChange={(e) => share.setLinkInput(e.target.value)}
          placeholder={'[Event "Play vs Bot"]\n1. d4 Nf6 ...\n\nveya <iframe src="https://www.chess.com/emboard?id=...">'}
          disabled={!admitted || share.mode === 'lichess-oauth'}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 outline-none focus:border-indigo-500/50 disabled:opacity-50 resize-y min-h-[72px] font-mono"
        />
        {kindHint ? (
          <p className="text-[10px] text-emerald-400/90">{kindHint}</p>
        ) : parsedLink ? (
          <p className="text-[10px] text-emerald-400/90">
            {parsedLink.platform === 'lichess' ? 'Lichess' : 'Chess.com'} · {parsedLink.gameId}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!admitted || share.loading}
          onClick={() => void share.startLinkShare()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] font-bold"
        >
          <Link2 className="w-3.5 h-3.5" />
          Paylaş
        </button>
        <button
          type="button"
          disabled={!admitted || share.loading || oauthLoading || !oauthConnected}
          onClick={() => void share.startLichessAutoShare()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 text-sky-200 text-[10px] font-bold"
          title={oauthConnected ? 'Lichess OAuth ile devam eden oyunu otomatik bul' : 'Önce Lichess hesabını bağlayın'}
        >
          <Radio className="w-3.5 h-3.5" />
          Lichess canlı
        </button>
        {share.mode !== 'off' ? (
          <>
            <button
              type="button"
              onClick={() => void share.refreshNow()}
              disabled={share.loading}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-white/10 text-slate-300 text-[10px] font-semibold hover:bg-white/5"
              title="Güncel PGN ile yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${share.loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={share.stopShare}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-red-500/30 text-red-300 text-[10px] font-semibold hover:bg-red-500/10"
            >
              <Square className="w-3 h-3" />
              Durdur
            </button>
          </>
        ) : null}
      </div>

      {oauthLoading ? (
        <p className="text-[10px] text-slate-500">Lichess bağlantısı kontrol ediliyor…</p>
      ) : !oauthConnected ? (
        <button
          type="button"
          onClick={() => void startLichessOAuthFlow(studentId, window.location.hash || '#/ogrenci', LICHESS_OAUTH_SCOPES_BOARD)}
          className="text-left text-[10px] text-sky-400 hover:text-sky-300 font-semibold"
        >
          Lichess hesabını bağla (canlı oyun için board:play izni)
        </button>
      ) : displayLichessUsername ? (
        <p className="text-[10px] text-emerald-400/90">
          Lichess OAuth bağlı · @{displayLichessUsername}
        </p>
      ) : (
        <p className="text-[10px] text-emerald-400/90">Lichess OAuth bağlı</p>
      )}

      {chessComUsername ? (
        <p className="text-[10px] text-slate-500">
          Chess.com @{chessComUsername} — bot oyununda PGN ile manuel, embed ile otomatik güncelleme
        </p>
      ) : null}

      {share.status ? (
        <p className="text-[10px] text-slate-400 rounded-lg border border-white/[0.06] bg-slate-900/50 px-2 py-1.5">
          {share.status}
          {share.lastLabel ? ` · ${share.lastLabel}` : ''}
        </p>
      ) : null}

      {share.mode !== 'off' && parsedLink?.url ? (
        <a
          href={parsedLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
        >
          <ExternalLink className="w-3 h-3" />
          Oyunu platformda aç
        </a>
      ) : null}
    </div>
  );
}
