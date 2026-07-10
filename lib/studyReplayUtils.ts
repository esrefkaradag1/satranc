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
    .filter((row) => String(row.chapter_id ?? '') === cid)
    .filter((row) => {
      const payload = row.payload;
      return !!payload && typeof payload === 'object' && Boolean((payload as Record<string, unknown>).vsComputer);
    })
    .sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')));

  for (const row of rows) {
    const history = getVsComputerHistory(row.payload);
    if (history.length > 0) return history;
  }
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

    let plyIndex = typeof event.moveIndex === 'number' ? event.moveIndex : 0;
    const auto = applyPuzzleAutoReplies(
      game.fen(),
      chapter.moves ?? normalized.studentMoves,
      plyIndex + 1,
      normalized.studentColor,
    );
    for (const reply of auto.playedSans) {
      applyMove(game, reply);
    }
    plyIndex = auto.nextIndex;

    steps.push({
      fen: game.fen(),
      eventIndex: idx,
      label: san,
      isWrong: false,
    });
  });

  return steps;
}

export function buildChapterReplaySteps(
  chapter: StudyChapter | undefined,
  events: StudyEvent[],
  vsMoveHistory: string[] = [],
): ReplayStep[] {
  const startFen = chapterReplayStartFen(chapter);

  if (isVsComputerChapter(chapter) && vsMoveHistory.length > 0) {
    return buildStepsFromMoveList(startFen, vsMoveHistory);
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
