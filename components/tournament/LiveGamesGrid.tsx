import React, { useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { CHESSBOARD_NO_NOTATION, chessboardDomId } from '../../lib/chessBoardUi';
import type { TournamentGame } from '../../lib/tournamentGames';
import { formatClock, lastMoveStyles, liveClocks, replayPositions } from './liveGameUtils';

export type PlayerInfo = { name: string; rank: number | null };

interface LiveGamesGridProps {
  games: TournamentGame[];
  player: (studentId: string) => PlayerInfo;
  onOpen: (game: TournamentGame) => void;
}

function PlayerStrip({ info, ms, onMove, flagged }: { info: PlayerInfo; ms: number; onMove: boolean; flagged: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
      <span className="min-w-0 flex items-center gap-1.5">
        {info.rank != null && <span className="shrink-0 font-bold text-slate-500 tabular-nums">#{info.rank}</span>}
        <span className="truncate font-semibold text-slate-200">{info.name}</span>
      </span>
      <span
        className={`shrink-0 font-mono font-bold tabular-nums ${
          flagged ? 'text-rose-400' : onMove ? (ms < 30_000 ? 'text-rose-300' : 'text-amber-300') : 'text-slate-400'
        }`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

function MiniGame({ game, player, onOpen, now }: { game: TournamentGame; player: LiveGamesGridProps['player']; onOpen: () => void; now: number }) {
  const positions = useMemo(() => replayPositions(game.moves), [game.moves]);
  const { whiteMs, blackMs, turn } = liveClocks(game, now);
  const white = player(game.whiteStudentId);
  const black = player(game.blackStudentId);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${white.name} – ${black.name} maçını canlı izle`}
      className="group text-left rounded-xl overflow-hidden bg-slate-900/70 border border-slate-700/50 hover:border-indigo-400/60 hover:shadow-lg hover:shadow-indigo-500/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {/* Lichess'teki gibi: siyah üstte, beyaz altta */}
      <PlayerStrip info={black} ms={blackMs} onMove={turn === 'b'} flagged={blackMs <= 0} />
      <div className="pointer-events-none">
        <Chessboard
          options={{
            id: chessboardDomId('tournament-mini', game.id),
            position: game.fen,
            boardOrientation: 'white',
            allowDragging: false,
            darkSquareStyle: { backgroundColor: '#b58863' },
            lightSquareStyle: { backgroundColor: '#f0d9b5' },
            squareStyles: lastMoveStyles(positions[positions.length - 1]),
            ...CHESSBOARD_NO_NOTATION,
          }}
        />
      </div>
      <PlayerStrip info={white} ms={whiteMs} onMove={turn === 'w'} flagged={whiteMs <= 0} />
    </button>
  );
}

/** Turnuvada o an süren maçlar — küçük tahtalar; tıklayınca canlı izleme açılır. */
export const LiveGamesGrid: React.FC<LiveGamesGridProps> = ({ games, player, onOpen }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (games.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Süren Maçlar
        </h2>
        <span className="text-xs text-slate-500">{games.length} maç · izlemek için tıklayın</span>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {games.map((g) => (
          <MiniGame key={g.id} game={g} player={player} now={now} onOpen={() => onOpen(g)} />
        ))}
      </div>
    </div>
  );
};

export default LiveGamesGrid;
