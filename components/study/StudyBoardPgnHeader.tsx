import React from 'react';
import type { StudyBoardPgnDisplay } from '../../lib/studyPgnTags';
import type { BoardOrientation } from '../chess/ChessBoardFrame';

type Props = {
  display: StudyBoardPgnDisplay;
  boardOrientation?: BoardOrientation;
  /** player-top/bottom = tahta kenarındaki renk etiketi */
  variant: 'player-top' | 'player-bottom';
  className?: string;
};

function playerForEdge(
  display: StudyBoardPgnDisplay,
  orientation: BoardOrientation,
  edge: 'top' | 'bottom',
): { title: string | null; name: string | null } {
  const whiteSide = { title: display.whiteTitle, name: display.white };
  const blackSide = { title: display.blackTitle, name: display.black };
  /** Beyaz perspektif: üst = siyah, alt = beyaz. Siyah perspektif: tersi. */
  const topPlayer = orientation === 'white' ? blackSide : whiteSide;
  const bottomPlayer = orientation === 'white' ? whiteSide : blackSide;
  return edge === 'top' ? topPlayer : bottomPlayer;
}

function PlayerLabel({
  title,
  name,
}: {
  title: string | null;
  name: string | null;
}) {
  if (!title && !name) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
      {title ? (
        <span className="text-[#e6912c] font-bold truncate max-w-full">{title}</span>
      ) : null}
      {name ? (
        <span className="text-slate-200 font-medium truncate max-w-full">{name}</span>
      ) : null}
    </div>
  );
}

export const StudyBoardPgnHeader: React.FC<Props> = ({
  display,
  boardOrientation = 'white',
  variant,
  className = '',
}) => {
  const edge = variant === 'player-top' ? 'top' : 'bottom';
  const player = playerForEdge(display, boardOrientation, edge);
  if (!player.title && !player.name) return null;

  const borderClass = variant === 'player-top' ? 'border-b border-white/5' : 'border-t border-white/5';

  return (
    <div className={`flex items-center min-w-0 px-2 py-1.5 bg-[#262421] ${borderClass} text-[12px] leading-tight ${className}`}>
      <PlayerLabel title={player.title} name={player.name} />
    </div>
  );
};
