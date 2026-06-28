import { Chess } from 'chess.js';
import type { StudyChapter } from './studyTypes';
import { DEFAULT_FEN, makeBuilderGame, applyMove, migrateChapter } from './studyUtils';
import type { ParsedPgnChapter } from './pgnChapterParse';
import { looksLikeLichessStudyPuzzle, normalizeStudyChapterPuzzle } from './puzzlePlayUtils';

/** Lichess study PGN export — bölüm bloklarını ayır. */
export function splitLichessStudyPgnBlocks(pgnText: string): string[] {
  const normalized = pgnText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  let blocks = normalized.split(
    /\n\s*\n(?=\s*\[(?:Event|FEN|ChapterName|StudyName|White|Black|Round|Date|Site|Result|SetUp)\s)/i,
  );
  if (blocks.length <= 1) {
    blocks = normalized.split(/\n\s*\n(?=\s*\d+\.\s)/);
  }
  if (blocks.length <= 1 && normalized.trim()) blocks = [normalized];
  return blocks.map((b) => b.trim()).filter(Boolean);
}

function isGameOverFen(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver();
  } catch {
    return false;
  }
}

function fenAfterAllMoves(startFen: string, moves: string[]): string {
  try {
    const g = makeBuilderGame(startFen);
    for (const m of moves) {
      if (!applyMove(g, m)) break;
    }
    return g.fen();
  } catch {
    return startFen;
  }
}

/**
 * Lichess "Etkileşimli ders" benzeri kısa çözüm hatlarını bulmaca moduna al.
 * Uzun açılış/repertuvar bölümleri direct kalır.
 */
export function inferLichessChapterMode(parsed: ParsedPgnChapter): Pick<StudyChapter, 'lessonMode' | 'interactiveType' | 'orientation'> {
  const moves = parsed.moves ?? [];
  if (moves.length === 0) {
    return { lessonMode: 'direct', interactiveType: 'puzzle', orientation: 'white' };
  }

  const lichessPuzzle = looksLikeLichessStudyPuzzle({ fen: parsed.startFen, moves });
  const endFen = fenAfterAllMoves(parsed.startFen, moves);
  const endsDecisively = isGameOverFen(endFen);
  const shortLine = moves.length <= 14;

  if (lichessPuzzle || (shortLine && endsDecisively)) {
    const norm = normalizeStudyChapterPuzzle({ fen: parsed.startFen, moves });
    const orientation: 'white' | 'black' = norm.studentColor === 'b' ? 'black' : 'white';
    return { lessonMode: 'interactive', interactiveType: 'puzzle', orientation };
  }

  return { lessonMode: 'direct', interactiveType: 'puzzle', orientation: 'white' };
}

export function chapterFromParsedPgnBlock(parsed: ParsedPgnChapter, titleFallback: string): Omit<StudyChapter, 'id'> {
  const inferred = inferLichessChapterMode(parsed);
  const ch = migrateChapter({
    title: parsed.title || titleFallback,
    fen: parsed.startFen,
    moves: parsed.moves,
    pgnTags: parsed.pgnTags,
    variations: parsed.variations,
    moveComments: parsed.moveComments,
    moveAnnotations: parsed.moveAnnotations,
    seedTree: parsed.tree,
    lessonMode: inferred.lessonMode,
    interactiveType: inferred.interactiveType,
    orientation: inferred.orientation,
  });
  const { id: _id, ...rest } = ch;
  return rest;
}
