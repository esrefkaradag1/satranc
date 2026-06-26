import { Chess, type Square } from 'chess.js';
import type { Study, StudyChapter, StudentPlaysColor } from './studyTypes';
import { formatMoveGlyphs, parseMoveGlyphs } from './studyAnnotations';

export const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const STUDY_EDITOR_SELECTION_KEY = 'netchess_study_editor_selection';
export const EMOJIS = ['♟️','👾','🏆','⭐','🎯','🔬','📚','🎓','🌟','🔥','⚡','💡','🦁','🐉','🎭'];
export const PROGRESS_KEY = 'netchess_student_progress';
export const STUDY_SELECTION_KEY_PREFIX = 'netchess_student_selection';
export const VC_PROGRESS_KEY_PREFIX = 'netchess_vc_progress';

export function loadEditorSelection(): { studyId: string | null; chapterIndex: number; moveIndex: number } {
  try {
    const raw = localStorage.getItem(STUDY_EDITOR_SELECTION_KEY);
    if (!raw) return { studyId: null, chapterIndex: 0, moveIndex: 0 };
    const parsed = JSON.parse(raw) as { studyId?: string | null; chapterIndex?: number; moveIndex?: number };
    return {
      studyId: parsed.studyId ?? null,
      chapterIndex: Number.isFinite(parsed.chapterIndex) ? Math.max(0, Number(parsed.chapterIndex)) : 0,
      moveIndex: Number.isFinite(parsed.moveIndex) ? Math.max(0, Number(parsed.moveIndex)) : 0,
    };
  } catch {
    return { studyId: null, chapterIndex: 0, moveIndex: 0 };
  }
}

export function saveEditorSelection(studyId: string | null, chapterIndex: number, moveIndex: number) {
  try {
    localStorage.setItem(
      STUDY_EDITOR_SELECTION_KEY,
      JSON.stringify({
        studyId,
        chapterIndex: Math.max(0, chapterIndex),
        moveIndex: Math.max(0, moveIndex),
      }),
    );
  } catch {}
}

export function studySelectionKey(studentId: string | null): string {
  return `${STUDY_SELECTION_KEY_PREFIX}:${studentId ? String(studentId) : 'anon'}`;
}

export function loadStudySelection(studentId: string | null): { studyId: string | null; chapterIndex: number } {
  try {
    const raw = localStorage.getItem(studySelectionKey(studentId));
    if (!raw) return { studyId: null, chapterIndex: 0 };
    const parsed = JSON.parse(raw) as { studyId?: string | null; chapterIndex?: number };
    return {
      studyId: parsed.studyId ?? null,
      chapterIndex: Number.isFinite(parsed.chapterIndex) ? Math.max(0, Number(parsed.chapterIndex)) : 0,
    };
  } catch {
    return { studyId: null, chapterIndex: 0 };
  }
}

export function saveStudySelection(studentId: string | null, studyId: string | null, chapterIndex: number) {
  try {
    localStorage.setItem(
      studySelectionKey(studentId),
      JSON.stringify({ studyId, chapterIndex: Math.max(0, chapterIndex) }),
    );
  } catch {}
}

export function loadProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveProgress(p: Record<string, number>) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

export function vcProgressKey(studentId: string | null): string {
  return `${VC_PROGRESS_KEY_PREFIX}:${studentId ? String(studentId) : 'anon'}`;
}

export function loadVcProgress(studentId: string | null): Record<string, { fen: string; history: string[]; gameOver: boolean }> {
  try {
    const raw = localStorage.getItem(vcProgressKey(studentId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveVcProgress(studentId: string | null, p: Record<string, { fen: string; history: string[]; gameOver: boolean }>) {
  try { localStorage.setItem(vcProgressKey(studentId), JSON.stringify(p)); } catch {}
}

export function genId() {
  return Math.random().toString(36).slice(2, 12);
}

export function migrateChapter(ch: Partial<StudyChapter>): StudyChapter {
  return {
    id: ch.id ?? genId(),
    title: ch.title ?? 'Bölüm',
    fen: ch.fen ?? DEFAULT_FEN,
    moves: ch.moves ?? [],
    orientation: ch.orientation ?? 'white',
    lessonMode: ch.lessonMode === 'interactive' ? 'interactive' : 'direct',
    interactiveType: ch.interactiveType === 'liveAnalysis' ? 'liveAnalysis' : ch.interactiveType === 'vsComputer' ? 'vsComputer' : 'puzzle',
    guidedPrompt: ch.guidedPrompt ?? '',
    moveHint: ch.moveHint ?? '',
    difficulty: typeof ch.difficulty === 'number' ? ch.difficulty : 5,
    comment: ch.comment ?? '',
    tags: ch.tags ?? [],
    moveComments: ch.moveComments ?? {},
    moveAnnotations: ch.moveAnnotations ?? {},
    variations: ch.variations ?? {},
    arrows: Array.isArray(ch.arrows) ? ch.arrows : [],
    circles: ch.circles ?? {},
  };
}

export function migrateStudy(s: Partial<Study>): Study {
  return {
    id: s.id ?? genId(),
    title: s.title ?? 'Çalışma',
    emoji: s.emoji ?? '♟️',
    description: s.description ?? '',
    chapters: (s.chapters ?? []).map(migrateChapter),
    memberIds: s.memberIds ?? [],
    createdAt: s.createdAt ?? new Date().toISOString(),
    visibility: s.visibility ?? 'public',
    chat: s.chat ?? 'members',
    computerAnalysis: s.computerAnalysis ?? 'none',
    openingExplorer: s.openingExplorer ?? 'everyone',
    clonePermission: s.clonePermission ?? 'everyone',
    shareExport: s.shareExport ?? 'everyone',
    syncEnabled: s.syncEnabled ?? true,
    studyComments: s.studyComments ?? 'none',
    tags: s.tags ?? [],
    topicTags: s.topicTags ?? [],
    chatMessages: s.chatMessages ?? [],
    liked: s.liked ?? false,
    likes: s.likes ?? 0,
    studentPlaysColor: normalizeStudentPlaysColor(s.studentPlaysColor),
    studentCreated: s.studentCreated ?? false,
    createdByStudentId: s.createdByStudentId ?? null,
    practiceLogs: s.practiceLogs ?? {},
    categoryId:
      typeof s.categoryId === 'string' && s.categoryId.trim() !== '' ? s.categoryId.trim() : null,
  };
}

export function setFenTurn(fen: string, turn: 'w' | 'b'): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return fen;
  parts[1] = turn;
  return parts.join(' ');
}

export function makeBuilderGame(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    // biome-ignore lint/suspicious/noExplicitAny: chess.js v1 options
    return new Chess(fen, { skipValidation: true } as any);
  }
}

export type GameOutcomeDescription = {
  kind: 'checkmate' | 'stalemate' | 'draw_insufficient' | 'draw_threefold' | 'draw_fifty' | 'draw_other';
  title: string;
  subtitle: string;
};

/** Oyun bittiyse (mat, pat, beraberlik) Türkçe kısa açıklama; aksi halde null. */
export function describeGameOutcomeFromFen(fen: string): GameOutcomeDescription | null {
  try {
    const g = makeBuilderGame(fen);
    if (!g.isGameOver()) return null;
    if (g.isCheckmate()) {
      const winner = g.turn() === 'w' ? 'Siyah' : 'Beyaz';
      const loser = g.turn() === 'w' ? 'Beyaz' : 'Siyah';
      return {
        kind: 'checkmate',
        title: 'Şah mat',
        subtitle: `${winner} kazandı. ${loser} mat oldu.`,
      };
    }
    if (g.isStalemate()) {
      return {
        kind: 'stalemate',
        title: 'Pat',
        subtitle: 'Hamle yok; oyun berabere (pat).',
      };
    }
    if (g.isInsufficientMaterial()) {
      return {
        kind: 'draw_insufficient',
        title: 'Beraberlik',
        subtitle: 'Yetersiz taş materialı — berabere.',
      };
    }
    if (g.isThreefoldRepetition()) {
      return {
        kind: 'draw_threefold',
        title: 'Beraberlik',
        subtitle: 'Üç tekerrür — berabere.',
      };
    }
    if (g.isDrawByFiftyMoves()) {
      return {
        kind: 'draw_fifty',
        title: 'Beraberlik',
        subtitle: '50 hamle kuralı — berabere.',
      };
    }
    return {
      kind: 'draw_other',
      title: 'Beraberlik',
      subtitle: 'Oyun kurallarına göre berabere.',
    };
  } catch {
    return null;
  }
}

/** Şah mat pozisyonunda mat olan tarafın kral karesi (tahta vurgusu için). */
export function matedKingSquareFromFen(fen: string): Square | null {
  try {
    const g = makeBuilderGame(fen);
    if (!g.isCheckmate()) return null;
    const loser: 'w' | 'b' = g.turn();
    for (const row of g.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === loser) {
          return cell.square;
        }
      }
    }
  } catch {}
  return null;
}

export function applyMove(game: Chess, moveStr: string): boolean {
  if (!moveStr?.trim()) return false;
  let s = moveStr.trim().replace(/^\d+\.+/, '').replace(/\s+/g, '').replace(/[?!+#]+$/, '');
  
  try {
    const m1 = game.move(s);
    if (m1) return true;
  } catch {}

  try {
    if (s.length >= 4) {
      const from = s.slice(0, 2);
      const to = s.slice(2, 4);
      const promo = s.slice(4, 5) || undefined;
      const m2 = promo
        ? game.move({ from: from as any, to: to as any, promotion: promo as any })
        : game.move({ from: from as any, to: to as any });
      if (m2) return true;
    }
  } catch {}

  try {
    const m3 = game.move(s.toLowerCase());
    if (m3) return true;
  } catch {}

  try {
    const m4 = game.move(s.replace(/[+#]/g, ''));
    if (m4) return true;
  } catch {}

  // Fallback: directly relocate the piece (for edited/non-standard positions)
  if (s.length >= 4) {
    try {
      const from = s.slice(0, 2) as Square;
      const to = s.slice(2, 4) as Square;
      const piece = game.get(from);
      if (piece) {
        game.remove(from);
        const captured = game.get(to);
        if (captured) game.remove(to);
        game.put(piece, to);
        return true;
      }
    } catch {}
  }

  return false;
}

export function fenToCurrentFen(chapter: StudyChapter, upTo: number): string {
  try {
    const game = makeBuilderGame(chapter.fen || DEFAULT_FEN);
    const moves = chapter.moves ?? [];
    const count = Math.min(upTo, moves.length);
    for (let i = 0; i < count; i++) {
      if (!applyMove(game, moves[i])) break;
    }
    return game.fen();
  } catch {
    return chapter.fen || DEFAULT_FEN;
  }
}

export function sideToMove(fen: string): 'white' | 'black' {
  const parts = fen.split(' ');
  return parts[1] === 'b' ? 'black' : 'white';
}

export function normalizeStudentPlaysColor(value: unknown): StudentPlaysColor {
  if (value === 'white' || value === 'black' || value === 'both' || value === 'none') return value;
  return 'both';
}

export function studentPlaysColorLabel(value: StudentPlaysColor): string {
  switch (value) {
    case 'none':
      return 'Taş oynatma kapalı';
    case 'white':
      return 'Sadece beyaz';
    case 'black':
      return 'Sadece siyah';
    default:
      return 'Her iki taraf';
  }
}

/** Öğrencinin verilen FEN'de bu renkteki taşı sürükleyip oynatıp oynatamayacağı. */
export function canStudentDragPieceOnFen(
  studentPlaysColor: StudentPlaysColor,
  fen: string,
  pieceColorChar: string,
): boolean {
  if (studentPlaysColor === 'none') return false;
  if (studentPlaysColor === 'both') return true;
  const allowed = studentPlaysColor === 'white' ? 'w' : 'b';
  if (pieceColorChar !== allowed) return false;
  const turnCode = sideToMove(fen) === 'white' ? 'w' : 'b';
  return turnCode === allowed;
}

export function studentCanMovePieces(studentPlaysColor: StudentPlaysColor): boolean {
  return studentPlaysColor !== 'none';
}

export function buildPgn(study: Study, chapter: StudyChapter): string {
  const lines = [
    `[Event "${study.title}"]`,
    `[Site "netchess"]`,
    `[Date "${new Date().toLocaleDateString('tr-TR')}"]`,
    `[White "?"]`,
    `[Black "?"]`,
    `[Result "*"]`,
    `[SetUp "1"]`,
    `[FEN "${chapter.fen || DEFAULT_FEN}"]`,
    '',
  ];
  const moves = chapter.moves ?? [];
  const variations = chapter.variations ?? {};
  const startNum = parseInt(chapter.fen?.split(' ')[5] ?? '1') || 1;
  const isBlackStart = chapter.fen?.split(' ')[1] === 'b';

  const moveNumber = (plyIdx: number): number => {
    if (isBlackStart) return startNum + Math.floor((plyIdx + 1) / 2);
    return startNum + Math.floor(plyIdx / 2);
  };

  const isWhiteTurn = (plyIdx: number): boolean => {
    if (isBlackStart) return plyIdx % 2 !== 0;
    return plyIdx % 2 === 0;
  };

  const renderVariation = (varLine: string[], parentPly: number): string => {
    if (!varLine || varLine.length === 0) return '';
    let text = '( ';
    const parentIsWhite = isWhiteTurn(parentPly);
    for (let vi = 0; vi < varLine.length; vi++) {
      const thisIsWhite = (vi % 2 === 0) ? parentIsWhite : !parentIsWhite;
      const mn = parentIsWhite
        ? moveNumber(parentPly) + Math.floor(vi / 2)
        : moveNumber(parentPly) + Math.floor((vi + 1) / 2);
      if (vi === 0 || thisIsWhite) {
        text += `${mn}${thisIsWhite ? '.' : '...'} `;
      }
      text += varLine[vi] + ' ';
    }
    text += ') ';
    return text;
  };

  let moveText = '';
  for (let i = 0; i < moves.length; i++) {
    const isW = isWhiteTurn(i);
    if (isW) moveText += `${moveNumber(i)}. `;
    else if (i === 0 && isBlackStart) moveText += `${moveNumber(i)}... `;
    
    const ann = formatMoveGlyphs(parseMoveGlyphs(chapter.moveAnnotations?.[i]));
    moveText += moves[i] + ann + ' ';

    const com = chapter.moveComments?.[i] ?? '';
    if (com) moveText += `{ ${com} } `;

    const varGroups = variations[i];
    if (varGroups && varGroups.length > 0) {
      for (const varLine of varGroups) {
        moveText += renderVariation(varLine, i);
      }
      if (i + 1 < moves.length && isW) {
        moveText += `${moveNumber(i)}... `;
      } else if (i + 1 < moves.length && !isW) {
        moveText += `${moveNumber(i + 1)}. `;
      }
    }
  }
  lines.push((moveText.trim() || '*') + ' *');
  return lines.join('\n');
}

const PGN_SAN_TOKEN =
  /\b(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h](?:=[NBRQ])?[+#]?)\b/g;

/** PGN bloğundan başlangıç FEN ve hamle listesi çıkarır (FEN etiketli pozisyonlar dahil). */
export function parsePgnBlockToMoves(block: string): { startFen: string; moves: string[] } {
  const trimmed = block.trim();
  if (!trimmed) return { startFen: DEFAULT_FEN, moves: [] };
  const fenMatch = trimmed.match(/\[FEN\s+"([^"]+)"\s*\]/i);
  const startFen = fenMatch ? fenMatch[1].trim() : DEFAULT_FEN;

  try {
    const g = new Chess();
    g.loadPgn(trimmed);
    const moves = g.history();
    if (moves.length > 0) {
      return { startFen: fenMatch ? startFen : DEFAULT_FEN, moves };
    }
  } catch {
    /* fallback below */
  }

  try {
    const g2 = new Chess(startFen);
    const movetext = trimmed
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\d+\.(?:\.\.)?/g, ' ')
      .trim();
    const sans = movetext.match(PGN_SAN_TOKEN) ?? [];
    for (const san of sans) {
      const m = g2.move(san);
      if (!m) break;
    }
    return { startFen, moves: g2.history() };
  } catch {
    return { startFen, moves: [] };
  }
}

export function parsePgnMoveMeta(pgnText: string): { comments: Record<number, string>; annotations: Record<number, string> } {
  const comments: Record<number, string> = {};
  const annotations: Record<number, string> = {};
  const movetext = pgnText
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\[[^\]]*\]\s*$/gm, ' ')
    .replace(/\$\d+/g, ' ')
    .trim();
  const tokens = movetext.match(/\{[^}]*\}|(?:\d+\.(?:\.\.)?)|[^\s]+/g) ?? [];
  let idx = -1;
  for (const tk of tokens) {
    if (/^\d+\.(?:\.\.)?$/.test(tk)) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tk)) continue;
    if (tk.startsWith('{') && tk.endsWith('}')) {
      if (idx >= 0) comments[idx] = tk.slice(1, -1).trim();
      continue;
    }
    idx += 1;
    const m = tk.match(/(!!|\?\?|!\?|\?!|!|\?)$/);
    if (m) annotations[idx] = m[1];
  }
  return { comments, annotations };
}

export function engineLevelFromDifficulty(difficulty?: number): number {
  return Math.max(1, Math.min(10, Math.round(difficulty ?? 5)));
}

export function cpLossThresholdForDifficulty(difficulty?: number): number {
  const d = Math.max(1, Math.min(10, Math.round(difficulty ?? 5)));
  if (d <= 4) return 9999;
  if (d === 5) return 140;
  if (d === 6) return 110;
  if (d === 7) return 85;
  if (d === 8) return 65;
  if (d === 9) return 45;
  return 30;
}

export function chapterModeBadge(ch: StudyChapter): { label: string; cls: string } {
  const mode = ch.lessonMode ?? 'direct';
  const it = ch.interactiveType ?? 'puzzle';
  if (mode !== 'interactive') {
    return { label: 'Direkt', cls: 'bg-slate-700/70 text-slate-200 border-slate-600/60' };
  }
  if (it === 'liveAnalysis') {
    return { label: 'Canlı Analiz', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  }
  if (it === 'vsComputer') {
    return { label: 'VS Bilgisayar', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' };
  }
  return { label: 'Puzzle', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
}

/** Sidebar list label: "Bölüm 2 · Puzzle" (same as student view). */
export function formatChapterListLabel(
  ch: StudyChapter,
  opts?: { titleOverride?: string; allChapters?: StudyChapter[] },
): string {
  const rawTitle = String(opts?.titleOverride ?? ch.title ?? '').trim();
  const modeLabel = chapterModeBadge(ch).label;
  const all = opts?.allChapters;
  let disambig = '';
  if (all && all.length > 1) {
    const sameMeta = (c: StudyChapter) =>
      (c.title || '').trim() === (rawTitle || 'Adsız') &&
      (c.lessonMode ?? 'direct') === (ch.lessonMode ?? 'direct') &&
      (c.interactiveType ?? 'puzzle') === (ch.interactiveType ?? 'puzzle');
    if (all.filter(sameMeta).length > 1) {
      disambig = ` (${ch.id.slice(0, 6)})`;
    }
  }
  return rawTitle
    ? `${rawTitle} · ${modeLabel}${disambig}`
    : `${modeLabel}${disambig}`;
}

export function chapterListLabelMatches(
  ch: StudyChapter,
  query: string,
  allChapters?: StudyChapter[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const label = formatChapterListLabel(ch, { allChapters }).toLowerCase();
  return label.includes(q) || (ch.title || '').toLowerCase().includes(q);
}

export const LICHESS_PIECE = (p: string) => `https://lichess1.org/assets/piece/cburnett/${p}.svg`;
