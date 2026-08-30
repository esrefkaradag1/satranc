import type { StudyChapter } from './studyTypes';
import type { StudyEvent } from '../studyEvents';
import { DEFAULT_FEN, makeBuilderGame } from './studyUtils';
import { applyPuzzleMove, normalizeStudyChapterPuzzle } from './puzzlePlayUtils';
import { mainlineSansFromTree } from './studySync/moveList';

export type ReplayStep = {
  fen: string;
  eventIndex: number | null;
  label: string;
  isWrong: boolean;
};

function sortEvents(events: StudyEvent[]): StudyEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0);
    if (timeDiff !== 0) return timeDiff;
    return (a.moveIndex ?? 0) - (b.moveIndex ?? 0);
  });
}

export function dedupeStudyEvents(events: StudyEvent[]): StudyEvent[] {
  const sorted = sortEvents(events);
  const out: StudyEvent[] = [];
  const seen = new Set<string>();
  for (const event of sorted) {
    const key = [
      event.moveIndex ?? 0,
      event.playedMove ?? '',
      event.expectedMove ?? '',
      event.result ?? '',
      event.createdAt ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

export function chapterReplayStartFen(chapter: StudyChapter | undefined): string {
  if (!chapter) return DEFAULT_FEN;
  const isPuzzle =
    chapter.lessonMode === 'interactive' && (chapter.interactiveType ?? 'puzzle') === 'puzzle';
  if (isPuzzle) return normalizeStudyChapterPuzzle(enrichChapterMoves(chapter)).startFen;
  return chapter.fen?.trim() || DEFAULT_FEN;
}

function isVsComputerChapter(chapter: StudyChapter | undefined): boolean {
  return chapter?.lessonMode === 'interactive' && chapter.interactiveType === 'vsComputer';
}

function isPuzzleChapter(chapter: StudyChapter | undefined): boolean {
  return chapter?.lessonMode === 'interactive' && (chapter.interactiveType ?? 'puzzle') === 'puzzle';
}

/** seedTree ana hattını chapter.moves ile birleştir (ödev replay ağacı da görsün). */
function enrichChapterMoves(chapter: StudyChapter): StudyChapter {
  const legacy = (chapter.moves ?? []).filter(Boolean);
  if (!chapter.seedTree?.mainline?.length) return chapter;
  try {
    const rootFen = chapter.fen?.trim() || DEFAULT_FEN;
    const fromTree = mainlineSansFromTree(chapter.seedTree, rootFen);
    if (fromTree.length <= legacy.length) return chapter;
    return { ...chapter, moves: fromTree };
  } catch {
    return chapter;
  }
}

function getVsComputerHistory(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const candidates = [data.vcHistory, data.history, data.moves];
  for (const item of candidates) {
    if (Array.isArray(item)) return item.filter((move): move is string => typeof move === 'string');
  }
  return [];
}

/** Presence satırından öğrenci + bölüm için tam oyun geçmişi (bilgisayar hamleleri dahil). */
export function extractVsComputerHistory(
  presenceRows: unknown[],
  studentId: string,
  chapterId: string,
): string[] {
  const sid = String(studentId);
  const cid = String(chapterId);
  if (!cid) return [];

  const rows = presenceRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .filter((row) => String(row.user_id ?? '') === sid)
    .filter((row) => String(row.chapter_id ?? '') === cid)
    .filter((row) => {
      const payload = row.payload;
      return !!payload && typeof payload === 'object' && Boolean((payload as Record<string, unknown>).vsComputer);
    })
    .sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')));

  let best: string[] = [];
  for (const row of rows) {
    const history = getVsComputerHistory(row.payload);
    if (history.length > best.length) best = history;
  }
  return best;
}

/** Öğrenci-only kayıtlardan bilgisayar hamlelerini ara pozisyonlarla geri kur. */
export function reconstructVsFullMoveList(
  startFen: string,
  studentMoves: string[],
  studentOrientation: 'white' | 'black' = 'white',
): string[] {
  const remaining = studentMoves.map((m) => m.trim()).filter(Boolean);
  if (remaining.length === 0) return [];

  const studentTurn = studentOrientation === 'white' ? 'w' : 'b';

  const dfs = (fen: string, left: string[], path: string[]): string[] | null => {
    if (left.length === 0) return path;
    const game = makeBuilderGame(fen || DEFAULT_FEN);
    if (game.isGameOver()) return null;

    if (game.turn() === studentTurn) {
      const san = left[0];
      const next = makeBuilderGame(fen || DEFAULT_FEN);
      if (!applyPuzzleMove(next, san)) return null;
      return dfs(next.fen(), left.slice(1), [...path, san]);
    }

    for (const reply of game.moves()) {
      const next = makeBuilderGame(fen || DEFAULT_FEN);
      if (!applyPuzzleMove(next, reply)) continue;
      const found = dfs(next.fen(), left, [...path, reply]);
      if (found) return found;
    }
    return null;
  };

  return dfs(startFen || DEFAULT_FEN, remaining, []) ?? [];
}

function isComputerLoggedEvent(event: StudyEvent): boolean {
  const expected = (event.expectedMove ?? '').trim().toLowerCase();
  return expected === 'bilgisayar' || expected === 'engine' || expected === 'computer';
}

/** Presence kaynaklı vs-computer satırlarını bulmaca bölümlerinden ayıkla. */
function puzzleStudentEvents(events: StudyEvent[]): StudyEvent[] {
  return dedupeStudyEvents(events).filter((e) => {
    if (e.id.startsWith('presence-')) return false;
    if (isComputerLoggedEvent(e)) return false;
    return !!(e.playedMove ?? '').trim();
  });
}

/**
 * DB + presence olaylarından veya presence geçmişinden tam ply listesi.
 * Bilgisayar hamleleri kayıtlı değilse öğrenci hamlelerinden geri kurulur.
 */
export function resolveFullVsMoveList(
  chapter: StudyChapter | undefined,
  events: StudyEvent[],
  vsMoveHistory: string[] = [],
): string[] {
  if (!isVsComputerChapter(chapter)) return [];
  if (vsMoveHistory.length > 0) return vsMoveHistory;

  const ordered = dedupeStudyEvents(events).filter((e) => (e.playedMove ?? '').trim());
  if (ordered.length === 0) return [];

  const maxIdx = Math.max(...ordered.map((e) => (typeof e.moveIndex === 'number' ? e.moveIndex : -1)), -1);
  if (maxIdx >= 0) {
    const slots: (string | null)[] = Array.from({ length: maxIdx + 1 }, () => null);
    for (const event of ordered) {
      const idx = typeof event.moveIndex === 'number' ? event.moveIndex : -1;
      if (idx < 0) continue;
      const san = (event.playedMove ?? '').trim();
      if (san) slots[idx] = san;
    }
    const filled = slots.filter((m) => !!m).length;
    if (filled === slots.length && slots.length > 0) {
      return slots as string[];
    }
  }

  const sequential = [...ordered].sort((a, b) => (a.moveIndex ?? 0) - (b.moveIndex ?? 0));
  if (
    sequential.length > 1
    && sequential.every((e, i) => (e.moveIndex ?? i) === i)
  ) {
    return sequential.map((e) => String(e.playedMove).trim());
  }

  const studentSans = ordered
    .filter((e) => !isComputerLoggedEvent(e) && !e.id.startsWith('presence-'))
    .map((e) => String(e.playedMove).trim())
    .filter(Boolean);
  const reconstructed = reconstructVsFullMoveList(
    chapterReplayStartFen(chapter),
    studentSans,
    chapter?.orientation === 'black' ? 'black' : 'white',
  );
  if (reconstructed.length > 0) return reconstructed;

  return [];
}

function buildStepsFromMoveList(startFen: string, moves: string[]): ReplayStep[] {
  const steps: ReplayStep[] = [{ fen: startFen, eventIndex: null, label: 'Başlangıç', isWrong: false }];
  const game = makeBuilderGame(startFen || DEFAULT_FEN);
  moves.forEach((san, idx) => {
    const move = san.trim();
    if (!move) return;
    const played = applyPuzzleMove(game, move);
    if (played) {
      steps.push({
        fen: game.fen(),
        eventIndex: idx,
        label: played.san || move,
        isWrong: false,
      });
    }
  });
  return steps;
}

function syncLineCursorToFen(startFen: string, line: string[], targetFen: string): number {
  const g = makeBuilderGame(startFen || DEFAULT_FEN);
  if (g.fen() === targetFen) return 0;
  for (let i = 0; i < line.length; i++) {
    if (!applyPuzzleMove(g, line[i]!)) return i;
    if (g.fen() === targetFen) return i + 1;
  }
  return line.length;
}

/**
 * Bulmaca için oynanan tam ply listesi (öğrenci + karşı hamleler).
 * Önce çözüm hattı + kayıtlar; hat yoksa öğrenci SAN'larından geri kurulum.
 */
function resolvePuzzlePlayedMoves(
  chapter: StudyChapter,
  events: StudyEvent[],
): { startFen: string; moves: string[]; studentColor: 'w' | 'b' } {
  const enriched = enrichChapterMoves(chapter);
  const normalized = normalizeStudyChapterPuzzle(enriched);
  const line = normalized.studentMoves;
  const startFen = normalized.startFen;
  const studentColor = normalized.studentColor;
  const ordered = puzzleStudentEvents(events);
  const orientation = chapter.orientation === 'black' ? 'black' : 'white';

  if (line.length > 0 && ordered.length > 0) {
    const g = makeBuilderGame(startFen || DEFAULT_FEN);
    const played: string[] = [];
    let cursor = 0;
    let solved = false;

    for (const event of ordered) {
      if (event.result === 'wrong') continue;
      const san = (event.playedMove ?? '').trim();
      if (!san) continue;

      while (cursor < line.length && g.turn() !== studentColor) {
        if (!applyPuzzleMove(g, line[cursor]!)) break;
        played.push(line[cursor]!);
        cursor += 1;
      }

      if (!applyPuzzleMove(g, san)) continue;
      played.push(san);
      cursor = syncLineCursorToFen(startFen, line, g.fen());

      while (cursor < line.length && g.turn() !== studentColor) {
        if (!applyPuzzleMove(g, line[cursor]!)) break;
        played.push(line[cursor]!);
        cursor += 1;
      }

      if (event.result === 'solution') solved = true;
    }

    if (solved) {
      while (cursor < line.length) {
        if (!applyPuzzleMove(g, line[cursor]!)) break;
        played.push(line[cursor]!);
        cursor += 1;
      }
    }

    if (played.length > 0) return { startFen, moves: played, studentColor };
  }

  const studentSans = ordered
    .filter((e) => e.result !== 'wrong')
    .map((e) => String(e.playedMove ?? '').trim())
    .filter(Boolean);
  const reconstructed = reconstructVsFullMoveList(startFen, studentSans, orientation);
  if (reconstructed.length > 0) return { startFen, moves: reconstructed, studentColor };

  return { startFen, moves: studentSans, studentColor };
}

function buildPuzzleReplaySteps(
  chapter: StudyChapter,
  events: StudyEvent[],
): ReplayStep[] {
  const { startFen, moves } = resolvePuzzlePlayedMoves(chapter, events);
  if (moves.length > 0) return buildStepsFromMoveList(startFen, moves);

  return [{ fen: startFen, eventIndex: null, label: 'Başlangıç', isWrong: false }];
}

export function buildChapterReplaySteps(
  chapter: StudyChapter | undefined,
  events: StudyEvent[],
  vsMoveHistory: string[] = [],
): ReplayStep[] {
  const startFen = chapterReplayStartFen(chapter);
  const fullMoves = resolveFullVsMoveList(chapter, events, vsMoveHistory);

  if (isVsComputerChapter(chapter) && fullMoves.length > 0) {
    return buildStepsFromMoveList(startFen, fullMoves);
  }

  if (isPuzzleChapter(chapter) && chapter) {
    return buildPuzzleReplaySteps(chapter, events);
  }

  const steps: ReplayStep[] = [{ fen: startFen, eventIndex: null, label: 'Başlangıç', isWrong: false }];
  const game = makeBuilderGame(startFen || DEFAULT_FEN);
  const ordered = dedupeStudyEvents(events);

  ordered.forEach((event, idx) => {
    const san = (event.playedMove ?? '').trim();
    if (!san) return;
    if (event.result === 'wrong') {
      steps.push({
        fen: game.fen(),
        eventIndex: idx,
        label: `${san} (yanlış)`,
        isWrong: true,
      });
      return;
    }
    if (applyPuzzleMove(game, san)) {
      steps.push({
        fen: game.fen(),
        eventIndex: idx,
        label: san,
        isWrong: false,
      });
    }
  });

  return steps;
}

/** Tablo satırı hamle numarası */
export function displayStudyEventMoveNo(
  event: StudyEvent,
  eventIdx: number,
  chapter: StudyChapter | undefined,
): number {
  if (isVsComputerChapter(chapter)) {
    if (event.expectedMove == null && typeof event.moveIndex === 'number' && event.moveIndex >= 0) {
      return Math.floor(event.moveIndex / 2) + 1;
    }
    return eventIdx + 1;
  }
  if (isPuzzleChapter(chapter)) {
    return Math.floor((event.moveIndex ?? 0) / 2) + 1;
  }
  return eventIdx + 1;
}

/** Bilgisayara karşı bölümde yalnızca öğrenci hamleleri (presence tam geçmiş varsa filtrelenir). */
export function studentOnlyStudyEvents(
  events: StudyEvent[],
  chapter: StudyChapter | undefined,
  vsMoveHistory: string[] = [],
): StudyEvent[] {
  const ordered = dedupeStudyEvents(events);
  if (!isVsComputerChapter(chapter)) return ordered;

  if (vsMoveHistory.length > 0) {
    const studentOrientation = chapter?.orientation ?? 'white';
    const studentPlies = new Set<number>();
    vsMoveHistory.forEach((_move, plyIdx) => {
      const isWhitePly = plyIdx % 2 === 0;
      const isStudentPly = studentOrientation === 'white' ? isWhitePly : !isWhitePly;
      if (isStudentPly) studentPlies.add(plyIdx);
    });
    const studentMoves = vsMoveHistory.filter((_m, plyIdx) => studentPlies.has(plyIdx));
    return studentMoves.map((move, i) => ({
      id: `vc-replay-${i}-${move}`,
      studyId: ordered[0]?.studyId ?? '',
      chapterId: ordered[0]?.chapterId ?? chapter?.id ?? '',
      studentId: ordered[0]?.studentId ?? '',
      moveIndex: i * 2,
      expectedMove: null,
      playedMove: move,
      result: 'correct' as const,
      thinkMs: ordered[i]?.thinkMs ?? 0,
      createdAt: ordered[i]?.createdAt ?? ordered[0]?.createdAt ?? new Date().toISOString(),
    }));
  }

  return ordered.filter((e) => !e.id.startsWith('presence-') || e.expectedMove == null);
}

export type ReplayTableRow = {
  id: string;
  plyIndex: number;
  /** steps dizisindeki indeks (0 = başlangıç, 1 = ilk hamle sonrası) */
  stepIndex: number;
  moveNo: number;
  side: 'white' | 'black';
  isStudent: boolean;
  playedMove: string;
  expectedLabel: string;
  result: 'correct' | 'wrong' | 'solution' | 'engine';
  thinkMs: number;
  createdAt: string | null;
};

/** Tablo için tüm hamleler (her iki renk / bilgisayar dahil). */
export function buildReplayTableRows(
  chapter: StudyChapter | undefined,
  events: StudyEvent[],
  vsMoveHistory: string[] = [],
): ReplayTableRow[] {
  const ordered = dedupeStudyEvents(events);
  const fullMoves = resolveFullVsMoveList(chapter, events, vsMoveHistory);

  if (isVsComputerChapter(chapter) && fullMoves.length > 0) {
    const studentOrientation = chapter?.orientation ?? 'white';
    const studentEvents = ordered.filter((e) => {
      if (e.id.startsWith('presence-') && isComputerLoggedEvent(e)) return false;
      const ply = e.moveIndex;
      if (typeof ply !== 'number') return !!(e.playedMove ?? '').trim();
      const isWhitePly = ply % 2 === 0;
      return studentOrientation === 'white' ? isWhitePly : !isWhitePly;
    });
    let studentEventCursor = 0;
    return fullMoves.map((move, plyIdx) => {
      const isWhitePly = plyIdx % 2 === 0;
      const isStudent = studentOrientation === 'white' ? isWhitePly : !isWhitePly;
      let thinkMs = 0;
      let createdAt: string | null = null;
      if (isStudent && studentEventCursor < studentEvents.length) {
        const ev = studentEvents[studentEventCursor];
        thinkMs = ev?.thinkMs ?? 0;
        createdAt = ev?.createdAt ?? null;
        studentEventCursor += 1;
      }
      return {
        id: `vc-full-${plyIdx}-${move}`,
        plyIndex: plyIdx,
        stepIndex: plyIdx + 1,
        moveNo: Math.floor(plyIdx / 2) + 1,
        side: isWhitePly ? 'white' : 'black',
        isStudent,
        playedMove: move,
        expectedLabel: isStudent ? 'Öğrenci' : 'Bilgisayar',
        result: isStudent ? 'correct' : 'engine',
        thinkMs,
        createdAt,
      };
    });
  }

  if (isPuzzleChapter(chapter) && chapter) {
    const { startFen, moves, studentColor } = resolvePuzzlePlayedMoves(chapter, events);
    if (moves.length === 0) return [];

    const studentEvents = puzzleStudentEvents(events).filter((e) => e.result !== 'wrong');
    let studentEventCursor = 0;
    const game = makeBuilderGame(startFen || DEFAULT_FEN);

    return moves.map((move, plyIdx) => {
      const turnBefore = game.turn();
      applyPuzzleMove(game, move);
      const isStudent = turnBefore === studentColor;
      let thinkMs = 0;
      let createdAt: string | null = null;
      let result: ReplayTableRow['result'] = isStudent ? 'correct' : 'engine';
      let expectedLabel = isStudent ? 'Bulmaca' : 'Karşı hamle';
      if (isStudent && studentEventCursor < studentEvents.length) {
        const ev = studentEvents[studentEventCursor];
        thinkMs = ev?.thinkMs ?? 0;
        createdAt = ev?.createdAt ?? null;
        expectedLabel = ev?.expectedMove || 'Bulmaca';
        if (ev?.result === 'solution') result = 'solution';
        studentEventCursor += 1;
      }
      return {
        id: `puzzle-full-${plyIdx}-${move}`,
        plyIndex: plyIdx,
        stepIndex: plyIdx + 1,
        moveNo: Math.floor(plyIdx / 2) + 1,
        side: turnBefore === 'w' ? 'white' as const : 'black' as const,
        isStudent,
        playedMove: move,
        expectedLabel,
        result,
        thinkMs,
        createdAt,
      };
    });
  }

  return ordered.map((event, idx) => {
    const ply = typeof event.moveIndex === 'number' ? event.moveIndex : idx;
    const isWhitePly = ply % 2 === 0;
    return {
      id: event.id,
      plyIndex: ply,
      stepIndex: idx + 1,
      moveNo: displayStudyEventMoveNo(event, idx, chapter),
      side: isWhitePly ? 'white' : 'black',
      isStudent: true,
      playedMove: event.playedMove || '—',
      expectedLabel: event.expectedMove || 'Serbest',
      result: event.result === 'wrong' ? 'wrong' : event.result === 'solution' ? 'solution' : 'correct',
      thinkMs: event.thinkMs ?? 0,
      createdAt: event.createdAt ?? null,
    };
  });
}
