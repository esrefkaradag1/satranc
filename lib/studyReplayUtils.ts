import type { StudyChapter } from './studyTypes';
import type { StudyEvent } from '../studyEvents';
import { DEFAULT_FEN, applyMove, makeBuilderGame } from './studyUtils';
import { applyPuzzleAutoReplies, normalizeStudyChapterPuzzle } from './puzzlePlayUtils';

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
  if (isPuzzle) return normalizeStudyChapterPuzzle(chapter).startFen;
  return chapter.fen?.trim() || DEFAULT_FEN;
}

function isVsComputerChapter(chapter: StudyChapter | undefined): boolean {
  return chapter?.lessonMode === 'interactive' && chapter.interactiveType === 'vsComputer';
}

function isPuzzleChapter(chapter: StudyChapter | undefined): boolean {
  return chapter?.lessonMode === 'interactive' && (chapter.interactiveType ?? 'puzzle') === 'puzzle';
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
  const rows = presenceRows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .filter((row) => String(row.user_id ?? '') === sid)
    .filter((row) => {
      const payload = row.payload;
      return !!payload && typeof payload === 'object' && Boolean((payload as Record<string, unknown>).vsComputer);
    })
    .sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')));

  const forChapter = rows.filter((row) => String(row.chapter_id ?? '') === cid);
  const candidates = forChapter.length > 0 ? forChapter : rows;

  let best: string[] = [];
  for (const row of candidates) {
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
      if (!applyMove(next, san)) return null;
      return dfs(next.fen(), left.slice(1), [...path, san]);
    }

    // Bilgisayar sırası: sonraki öğrenci hamlesini mümkün kılan yasal cevap(lar)
    for (const reply of game.moves()) {
      const next = makeBuilderGame(fen || DEFAULT_FEN);
      if (!applyMove(next, reply)) continue;
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

/**
 * DB + presence olaylarından veya presence geçmişinden tam ply listesi.
 * Bilgisayar hamleleri kayıtlı değilse öğrenci hamlelerinden geri kurulur.
 */
export function resolveFullVsMoveList(
  chapter: StudyChapter | undefined,
  events: StudyEvent[],
  vsMoveHistory: string[] = [],
): string[] {
  if (vsMoveHistory.length > 0) return vsMoveHistory;
  if (!isVsComputerChapter(chapter)) return [];

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
    // Tam dolu dizi = her iki renk (presence / bilgisayar loglu)
    if (filled === slots.length && slots.length > 0) {
      return slots as string[];
    }
  }

  // moveIndex sırası 0..n-1 ise (presence live events)
  const sequential = [...ordered].sort((a, b) => (a.moveIndex ?? 0) - (b.moveIndex ?? 0));
  if (
    sequential.length > 1
    && sequential.every((e, i) => (e.moveIndex ?? i) === i)
  ) {
    return sequential.map((e) => String(e.playedMove).trim());
  }

  // Yalnızca öğrenci hamleleri (seyrek moveIndex): bilgisayar ply'lerini geri kur
  const studentSans = ordered
    .filter((e) => !isComputerLoggedEvent(e))
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
    if (applyMove(game, move)) {
      steps.push({
        fen: game.fen(),
        eventIndex: idx,
        label: move,
        isWrong: false,
      });
    }
  });
  return steps;
}

function buildPuzzleReplaySteps(
  chapter: StudyChapter,
  events: StudyEvent[],
): ReplayStep[] {
  const normalized = normalizeStudyChapterPuzzle(chapter);
  const startFen = normalized.startFen;
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
    if (!applyMove(game, san)) return;
    steps.push({
      fen: game.fen(),
      eventIndex: idx,
      label: san,
      isWrong: false,
    });

    let plyIndex = typeof event.moveIndex === 'number' ? event.moveIndex : 0;
    const auto = applyPuzzleAutoReplies(
      game.fen(),
      chapter.moves ?? normalized.studentMoves,
      plyIndex + 1,
      normalized.studentColor,
    );
    for (const reply of auto.playedSans) {
      if (!applyMove(game, reply)) break;
      steps.push({
        fen: game.fen(),
        eventIndex: idx,
        label: reply,
        isWrong: false,
      });
    }
  });

  return steps;
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
    if (applyMove(game, san)) {
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

  // Bulmaca: öğrenci hamlesi + otomatik cevapları birlikte göster / oynat
  if (isPuzzleChapter(chapter) && chapter) {
    const rows: ReplayTableRow[] = [];
    const normalized = normalizeStudyChapterPuzzle(chapter);
    const game = makeBuilderGame(normalized.startFen || DEFAULT_FEN);
    let stepIndex = 0;
    ordered.forEach((event, idx) => {
      const san = (event.playedMove ?? '').trim();
      if (!san) return;
      const beforeTurn = game.turn();
      const plyBefore = game.history().length;
      if (event.result === 'wrong') {
        stepIndex += 1;
        rows.push({
          id: `${event.id}-wrong`,
          plyIndex: plyBefore,
          stepIndex,
          moveNo: Math.floor(plyBefore / 2) + 1,
          side: beforeTurn === 'w' ? 'white' : 'black',
          isStudent: true,
          playedMove: san,
          expectedLabel: event.expectedMove || 'Bulmaca',
          result: 'wrong',
          thinkMs: event.thinkMs ?? 0,
          createdAt: event.createdAt ?? null,
        });
        return;
      }
      if (!applyMove(game, san)) return;
      stepIndex += 1;
      rows.push({
        id: event.id,
        plyIndex: plyBefore,
        stepIndex,
        moveNo: Math.floor(plyBefore / 2) + 1,
        side: beforeTurn === 'w' ? 'white' : 'black',
        isStudent: true,
        playedMove: san,
        expectedLabel: event.expectedMove || 'Bulmaca',
        result: event.result === 'solution' ? 'solution' : 'correct',
        thinkMs: event.thinkMs ?? 0,
        createdAt: event.createdAt ?? null,
      });

      let plyIndex = typeof event.moveIndex === 'number' ? event.moveIndex : 0;
      const auto = applyPuzzleAutoReplies(
        game.fen(),
        chapter.moves ?? normalized.studentMoves,
        plyIndex + 1,
        normalized.studentColor,
      );
      for (const reply of auto.playedSans) {
        const replyTurn = game.turn();
        const replyPly = game.history().length;
        if (!applyMove(game, reply)) break;
        stepIndex += 1;
        rows.push({
          id: `${event.id}-auto-${replyPly}-${reply}`,
          plyIndex: replyPly,
          stepIndex,
          moveNo: Math.floor(replyPly / 2) + 1,
          side: replyTurn === 'w' ? 'white' : 'black',
          isStudent: false,
          playedMove: reply,
          expectedLabel: 'Karşı hamle',
          result: 'engine',
          thinkMs: 0,
          createdAt: null,
        });
      }
    });
    return rows;
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