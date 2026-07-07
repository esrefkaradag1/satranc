import { Chess } from 'chess.js';
import type { HomeworkPuzzleAttempt, Puzzle } from '../types';
import {
  applySolutionMoveOnGame,
  fenBeforeSolutionMove,
  initCoachStyleSession,
  puzzleBoardOrientationForStudent,
} from './puzzlePlayUtils';

export type HomeworkReplayFrame = {
  fen: string;
  caption: string;
  tone: 'neutral' | 'student' | 'wrong' | 'correct' | 'setup' | 'reset';
  moveSan?: string;
  attemptIndex?: number;
};

function tryApply(game: Chess, san: string): boolean {
  return !!applySolutionMoveOnGame(game, san);
}

function pushFrame(
  frames: HomeworkReplayFrame[],
  fen: string,
  caption: string,
  tone: HomeworkReplayFrame['tone'],
  extra?: Partial<HomeworkReplayFrame>,
) {
  const last = frames[frames.length - 1];
  if (last && last.fen === fen && last.caption === caption) return;
  frames.push({ fen, caption, tone, ...extra });
}

/** Rakip cevaplarını çözüm hattından oyna (doğru deneme). */
function playOpponentReplies(
  game: Chess,
  playFen: string,
  solutionMoves: string[],
  studentColor: 'w' | 'b',
  fromPly: number,
  frames: HomeworkReplayFrame[],
): number {
  let ply = fromPly;
  while (ply < solutionMoves.length) {
    let turn: 'w' | 'b';
    try {
      turn = new Chess(fenBeforeSolutionMove(playFen, solutionMoves, ply)).turn();
    } catch {
      break;
    }
    if (turn === studentColor) break;
    const san = solutionMoves[ply]!;
    if (!tryApply(game, san)) {
      ply += 1;
      continue;
    }
    pushFrame(frames, game.fen(), `Rakip: ${san}`, 'neutral', { moveSan: san });
    ply += 1;
  }
  return ply;
}

function replaySingleAttempt(
  playFen: string,
  studentColor: 'w' | 'b',
  solutionMoves: string[],
  attempt: HomeworkPuzzleAttempt,
  attemptIndex: number,
  frames: HomeworkReplayFrame[],
) {
  if (attemptIndex > 0) {
    pushFrame(frames, playFen, `Deneme ${attemptIndex + 1}`, 'reset', { attemptIndex });
  } else {
    pushFrame(frames, playFen, 'Deneme 1', 'neutral', { attemptIndex: 0 });
  }

  const studentMoves = attempt.movesPlayed.map((m) => String(m).trim()).filter(Boolean);
  if (studentMoves.length === 0) {
    const endFen = attempt.finalFen?.trim() || playFen;
    const caption = attempt.correct
      ? 'Doğru çözüldü'
      : attempt.hintUsed
        ? 'İpucu kullanıldı — hamle kaydı yok'
        : 'Hamle kaydı yok';
    pushFrame(
      frames,
      endFen,
      caption,
      attempt.correct ? 'correct' : 'wrong',
      { attemptIndex },
    );
    return;
  }

  const game = new Chess(playFen);
  let solPly = 0;

  for (let i = 0; i < studentMoves.length; i++) {
    const san = studentMoves[i]!;
    const fenBefore = game.fen();

    if (!tryApply(game, san)) {
      pushFrame(
        frames,
        fenBefore,
        `Hamle uygulanamadı: ${san}`,
        'wrong',
        { moveSan: san, attemptIndex },
      );
      break;
    }

    pushFrame(
      frames,
      game.fen(),
      `Öğrenci: ${san}`,
      attempt.correct ? 'student' : 'wrong',
      { moveSan: san, attemptIndex },
    );

    if (!attempt.correct) break;

    solPly = playOpponentReplies(
      game,
      playFen,
      solutionMoves.length ? solutionMoves : attempt.solutionMoves,
      studentColor,
      solPly + 1,
      frames,
    );
    solPly += 1;
  }

  if (attempt.correct) {
    pushFrame(
      frames,
      attempt.finalFen?.trim() || game.fen(),
      'Doğru!',
      'correct',
      { attemptIndex },
    );
  } else {
    pushFrame(
      frames,
      attempt.finalFen?.trim() || game.fen(),
      'Yanlış deneme',
      'wrong',
      { attemptIndex },
    );
  }
}

export function buildHomeworkPuzzleReplay(
  puzzle: Puzzle,
  attempts: HomeworkPuzzleAttempt[],
): {
  frames: HomeworkReplayFrame[];
  boardOrientation: 'white' | 'black';
  hasPlayableContent: boolean;
} {
  const session = initCoachStyleSession(puzzle);
  const { rawFen, playFen, setupMoveSan, solutionMoves, studentColor } = session;
  const sorted = [...attempts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const frames: HomeworkReplayFrame[] = [];
  const solution = solutionMoves.length
    ? solutionMoves
    : sorted.find((a) => a.solutionMoves.length)?.solutionMoves ?? [];

  pushFrame(frames, rawFen, 'Başlangıç', 'neutral');

  if (setupMoveSan && rawFen !== playFen) {
    const setupGame = new Chess(rawFen);
    if (tryApply(setupGame, setupMoveSan)) {
      pushFrame(frames, setupGame.fen(), `Kurulum: ${setupMoveSan}`, 'setup', { moveSan: setupMoveSan });
    }
  }

  if (sorted.length === 0) {
    pushFrame(frames, playFen, 'Deneme yok', 'neutral');
  } else {
    sorted.forEach((attempt, idx) => {
      replaySingleAttempt(
        playFen,
        studentColor,
        solution,
        attempt,
        idx,
        frames,
      );
    });
  }

  return {
    frames,
    boardOrientation: puzzleBoardOrientationForStudent(studentColor),
    hasPlayableContent: sorted.length > 0 && frames.length > 1,
  };
}
