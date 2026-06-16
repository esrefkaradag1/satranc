import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import type { LichessGame } from '../services/chessPlatformService';

/** Lichess resmi gömülü oynatıcı — tüm varyantlar, hamleler ve son pozisyon doğru (chess.js standart satrançla ayrıştırılamaz) */
function lichessEmbedUrl(gameId: string): string {
  const id = encodeURIComponent(gameId.trim());
  return `https://lichess.org/embed/${id}?theme=green&bg=dark`;
}

const LichessGameViewerModal: React.FC<{
  game: LichessGame | null;
  onClose: () => void;
}> = ({ game, onClose }) => {
  const embedSrc = useMemo(() => (game?.id ? lichessEmbedUrl(game.id) : ''), [game?.id]);

  useEffect(() => {
    if (!game?.id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game?.id, onClose]);

  if (!game?.id) return null;

  const white = game.players?.white?.user?.name ?? 'Beyaz';
  const black = game.players?.black?.user?.name ?? 'Siyah';

  const title = `${white} — ${black}`;
  const subtitle = [game.speed || game.perf, game.status, game.winner ? `Kazanan: ${game.winner}` : null]
    .filter(Boolean)
    .join(' · ');

  const gamePageUrl = `https://lichess.org/${encodeURIComponent(game.id)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lichess-viewer-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[96vh] flex flex-col rounded-2xl border border-slate-600/60 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-700/80 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id="lichess-viewer-title" className="text-base sm:text-lg font-black text-white truncate">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-xs text-slate-400 mt-1 truncate">{subtitle}</p>
            ) : null}
            <p className="text-[11px] text-slate-500 mt-1">
              Hamleler ve son pozisyon Lichess gömülü oynatıcıda gösterilir (varyant maçları dahil).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={gamePageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Lichess’te aç
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-black">
          <iframe
            key={game.id}
            src={embedSrc}
            title={`Lichess: ${title}`}
            className="w-full h-[min(72vh,720px)] sm:h-[min(75vh,780px)] border-0 block"
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen"
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LichessGameViewerModal;
