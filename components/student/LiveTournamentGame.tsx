import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Flag, X } from 'lucide-react';
import { ChessBoardFrame } from '../chess/ChessBoardFrame';
import { CHESSBOARD_ANIMATION, CHESSBOARD_NO_NOTATION, chessboardDomId } from '../../lib/chessBoardUi';
import {
  finishTournamentGame,
  pushTournamentGameMove,
  resignTournamentGame,
  subscribeToTournamentGame,
  type TournamentGame,
  type TournamentGameResult,
} from '../../lib/tournamentGames';

interface LiveTournamentGameProps {
  game: TournamentGame;
  studentId: string;
  whiteName: string;
  blackName: string;
  onClose: () => void;
}

function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Oyun bitişini tespit eder (mat/berabere) — chess.js'in kendi oyun sonu kurallarıyla. */
function detectGameOverResult(chess: Chess): TournamentGameResult | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  return '1/2-1/2'; // pat, yetersiz materyal, 3 tekrar, 50 hamle kuralı
}

/**
 * Turnuva içi canlı (gerçek zamanlı) satranç maçı — lichess Arena'daki gibi, eşleşen
 * iki öğrenci burada gerçekten hamle oynar. Hamle meşruiyeti ve oyun sonu tespiti
 * istemci tarafında `chess.js` ile yapılır (bu projenin diğer gerçek zamanlı
 * özellikleriyle aynı güven modeli); sonuç `tournament_games` tablosuna yazılır ve
 * turnuvanın sıralaması oradan otomatik senkronlanır (bkz. Tournaments.tsx).
 */
export const LiveTournamentGame: React.FC<LiveTournamentGameProps> = ({ game: initialGame, studentId, whiteName, blackName, onClose }) => {
  const [game, setGame] = useState(initialGame);
  const [now, setNow] = useState(() => Date.now());
  const chess = useMemo(() => new Chess(game.fen), [game.fen]);
  const myColor: 'white' | 'black' = game.whiteStudentId === studentId ? 'white' : 'black';
  const isMyTurn = chess.turn() === myColor[0] && game.status === 'active';

  useEffect(() => {
    const unsub = subscribeToTournamentGame(game.id, setGame);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Saat hesapları: son senkron noktasından (turnStartedAt) bu yana geçen süre, sırası gelen
  // tarafın kalan süresinden düşülür. Her iki istemci de aynı hesaplamayı bağımsız yapar;
  // kim önce tespit ederse zaman aşımını o yazar (finishTournamentGame'deki status='active'
  // koruması sayesinde ikinci yazma zararsızca hiçbir şey değiştirmez).
  const elapsedSinceSync = game.turnStartedAt ? Math.max(0, now - new Date(game.turnStartedAt).getTime()) : 0;
  const whiteTimeMs = game.status === 'active' && chess.turn() === 'w' ? Math.max(0, game.whiteTimeMs - elapsedSinceSync) : game.whiteTimeMs;
  const blackTimeMs = game.status === 'active' && chess.turn() === 'b' ? Math.max(0, game.blackTimeMs - elapsedSinceSync) : game.blackTimeMs;

  const flaggedRef = useRef(false);
  useEffect(() => {
    if (game.status !== 'active' || flaggedRef.current) return;
    if (whiteTimeMs <= 0) {
      flaggedRef.current = true;
      void finishTournamentGame({ gameId: game.id, result: '0-1' });
    } else if (blackTimeMs <= 0) {
      flaggedRef.current = true;
      void finishTournamentGame({ gameId: game.id, result: '1-0' });
    }
  }, [whiteTimeMs, blackTimeMs, game.status, game.id]);

  const handleDrop = useCallback(
    (args: { sourceSquare: string; targetSquare: string }) => {
      if (!isMyTurn) return false;
      try {
        const move = chess.move({ from: args.sourceSquare, to: args.targetSquare, promotion: 'q' });
        if (!move) return false;
      } catch {
        return false;
      }

      const turnStartedAt = new Date().toISOString();
      // Şu anki (hamleyi oynayan tarafın kalan süresi düşülmüş) saatler buradan itibaren geçerli;
      // artış (increment) MVP kapsamında yok, sadece kalan süre taşınır.
      const nextWhiteMs = whiteTimeMs;
      const nextBlackMs = blackTimeMs;

      const result = detectGameOverResult(chess);
      const movesArr = chess.history();
      if (result) {
        void finishTournamentGame({ gameId: game.id, result, fen: chess.fen(), moves: movesArr });
      } else {
        void pushTournamentGameMove({
          gameId: game.id,
          fen: chess.fen(),
          moves: movesArr,
          whiteTimeMs: nextWhiteMs,
          blackTimeMs: nextBlackMs,
          turnStartedAt,
        });
      }
      setGame((g) => ({
        ...g,
        fen: chess.fen(),
        moves: movesArr,
        whiteTimeMs: nextWhiteMs,
        blackTimeMs: nextBlackMs,
        turnStartedAt,
        ...(result ? { status: 'finished', result, finishedAt: new Date().toISOString() } : {}),
      }));
      return true;
    },
    [chess, isMyTurn, myColor, whiteTimeMs, blackTimeMs, game.id],
  );

  const handleResign = () => {
    if (game.status !== 'active') return;
    if (!window.confirm('Maçı pes etmek istediğinize emin misiniz?')) return;
    void resignTournamentGame(game.id, myColor);
    setGame((g) => ({ ...g, status: 'finished', result: myColor === 'white' ? '0-1' : '1-0', finishedAt: new Date().toISOString() }));
  };

  const resultLabel = (() => {
    if (!game.result) return null;
    if (game.result === '1/2-1/2') return 'Berabere';
    const winnerIsMe = (game.result === '1-0' && myColor === 'white') || (game.result === '0-1' && myColor === 'black');
    return winnerIsMe ? 'Kazandınız! 🏆' : 'Kaybettiniz';
  })();

  const topName = myColor === 'white' ? blackName : whiteName;
  const bottomName = myColor === 'white' ? whiteName : blackName;
  const topTimeMs = myColor === 'white' ? blackTimeMs : whiteTimeMs;
  const bottomTimeMs = myColor === 'white' ? whiteTimeMs : blackTimeMs;
  const topIsTurn = (myColor === 'white' ? chess.turn() === 'b' : chess.turn() === 'w') && game.status === 'active';
  const bottomIsTurn = !topIsTurn && game.status === 'active';

  const boardOptions = {
    id: chessboardDomId('tournament-live', game.id),
    position: chess.fen(),
    boardOrientation: myColor,
    darkSquareStyle: { backgroundColor: '#779952' },
    lightSquareStyle: { backgroundColor: '#edeed1' },
    ...CHESSBOARD_ANIMATION,
    allowDragging: isMyTurn,
    onPieceDrop: handleDrop,
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <h3 className="text-sm font-bold text-white">Canlı Turnuva Maçı</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${topIsTurn ? 'bg-indigo-500/15 border border-indigo-500/30' : 'bg-slate-800/50'}`}>
            <span className="text-sm font-semibold text-slate-200 truncate">{topName}</span>
            <span className="font-mono font-bold text-white tabular-nums">{formatClock(topTimeMs)}</span>
          </div>

          <ChessBoardFrame boardOrientation={myColor} className="max-w-full mx-auto relative">
            <Chessboard options={{ ...boardOptions, ...CHESSBOARD_NO_NOTATION }} />
          </ChessBoardFrame>

          <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${bottomIsTurn ? 'bg-indigo-500/15 border border-indigo-500/30' : 'bg-slate-800/50'}`}>
            <span className="text-sm font-semibold text-slate-200 truncate">{bottomName} (siz)</span>
            <span className="font-mono font-bold text-white tabular-nums">{formatClock(bottomTimeMs)}</span>
          </div>

          {game.status === 'finished' ? (
            <div className="text-center py-3">
              <p className="text-lg font-black text-white">{resultLabel}</p>
              <button type="button" onClick={onClose} className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
                Kapat
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResign}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-sm font-semibold transition-colors"
            >
              <Flag className="w-4 h-4" /> Pes Et
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LiveTournamentGame;
