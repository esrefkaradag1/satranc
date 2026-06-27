import type { Square } from 'chess.js';
import type { StudyChapter } from '../studyTypes';
import type { StudyTree } from './types';
import type { StudyChapterState } from './types';
import { DEFAULT_FEN, applyMove, makeBuilderGame } from '../studyUtils';
import { promoteVariationLegacy } from './treeModel';

/** Sync ağacındaki güncel yolun FEN'i — hamle listesini yeniden oynatmaktan güvenilir. */
export function fenAtSyncPath(state: StudyChapterState | null | undefined): string | null {
  if (!state?.currentPath?.length) return null;
  const nodeId = state.currentPath[state.currentPath.length - 1];
  const fen = state.tree.nodes[nodeId]?.fen;
  return fen && fen.trim() ? fen : null;
}

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

/**
 * Hamle dizgesini (SAN veya düz UCI) verilen FEN üzerinde SAN olarak gösterir.
 */
export function displaySanForStoredMove(label: string, beforeFen: string): string {
  const trimmed = (label || '').trim();
  if (!trimmed) return '';

  const uciMatch = trimmed.match(UCI_RE);
  if (uciMatch) {
    try {
      const g = makeBuilderGame(beforeFen);
      const from = uciMatch[1]!.toLowerCase() as Square;
      const to = uciMatch[2]!.toLowerCase() as Square;
      const promo = uciMatch[3]?.toLowerCase() as 'q' | 'r' | 'b' | 'n' | undefined;
      const mv = promo
        ? g.move({ from, to, promotion: promo })
        : g.move({ from, to });
      if (mv?.san) return mv.san;
    } catch {
      /* keep raw */
    }
    return trimmed;
  }

  try {
    const g = makeBuilderGame(beforeFen);
    const stripped = trimmed.replace(/^\d+\.{1,3}\s*/, '').replace(/[?!+#]+$/, '');
    const mv = g.move(stripped);
    if (mv?.san) return mv.san;
  } catch {
    /* keep */
  }
  return trimmed;
}

function fenAfterMainlinePlies(startFen: string, mainMoves: string[], ply: number): string {
  const g = makeBuilderGame(startFen);
  const n = Math.max(0, Math.min(ply, mainMoves.length));
  for (let i = 0; i < n; i++) {
    if (!applyMove(g, mainMoves[i]!)) break;
  }
  return g.fen();
}

/** Varyasyon satırındaki hamleleri (UCI kalıntısı varsa) SAN listesine çevirir. */
export function variationLineSans(startFen: string, mainMoves: string[], branchAfterPly: number, varMoves: string[]): string[] {
  let fen = fenAfterMainlinePlies(startFen, mainMoves, branchAfterPly);
  const out: string[] = [];
  for (const raw of varMoves) {
    const label = (raw || '').trim();
    if (!label) continue;
    out.push(displaySanForStoredMove(label, fen));
    const adv = makeBuilderGame(fen);
    if (applyMove(adv, label)) fen = adv.fen();
  }
  return out;
}

export function sanitizeChapterVariations(chapter: StudyChapter, mainMovesForReplay: string[]): Record<number, string[][]> {
  const raw = chapter.variations ?? {};
  const root = chapter.fen || DEFAULT_FEN;
  return Object.fromEntries(
    Object.entries(raw).map(([key, groups]) => {
      const ply = parseInt(key, 10);
      if (!Number.isFinite(ply) || !Array.isArray(groups)) {
        return [key, groups];
      }
      return [
        key,
        groups.map((line) => (Array.isArray(line) ? variationLineSans(root, mainMovesForReplay, ply, line) : line)),
      ];
    }),
  ) as Record<number, string[][]>;
}

/** Ana hattaki verilen FEN'e sahip düğüm; yoksa ana hattın son düğümü. */
export function mainlineNodeIdForFen(tree: StudyTree, fen: string): string {
  const ml = tree.mainline;
  for (let i = ml.length - 1; i >= 0; i--) {
    const id = ml[i]!;
    const n = tree.nodes[id];
    if (n?.fen === fen) return id;
  }
  return ml[ml.length - 1] ?? tree.rootId;
}

/**
 * Ana hattaki hamleleri SAN listesine çevirir (tahta ile liste senkronu).
 * Her hamle, düğümün ebeveyninin FEN'i üzerinde yorumlanır (ara düğümde fen eksikliği hatasını önler).
 */
/** Varyasyon dalının SAN listesini (ana hatta birleşene kadar) toplar */
function followFirstLineSans(tree: StudyTree, startId: string, mainSet: Set<string>, maxLen = 32): string[] {
  const line: string[] = [];
  let cur = tree.nodes[startId];
  let guard = 0;
  while (cur && guard < maxLen) {
    guard++;
    if (cur.san) line.push(cur.san);
    const nextId = (cur.children ?? [])[0];
    if (!nextId) break;
    if (mainSet.has(nextId)) break;
    cur = tree.nodes[nextId];
  }
  return line;
}

export function mainlineSansDiffer(a: string[], b: string[]): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

/** Kayıtlı bölüm hamleleri ile canlı sync ağacını birleştirir; oynanan hamleler listede kaybolmasın. */
export function mergeMainlineMoves(raw: string[], tree: string[]): string[] {
  if (!tree.length) return raw;
  if (!raw.length) return tree;
  if (!mainlineSansDiffer(raw, tree)) {
    return tree.length >= raw.length ? tree : raw;
  }
  if (raw.length < tree.length) {
    let samePrefix = true;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== tree[i]) {
        samePrefix = false;
        break;
      }
    }
    if (samePrefix) return raw;
  }
  if (tree.length >= raw.length) return tree;
  for (let i = 0; i < tree.length; i++) {
    if (raw[i] !== tree[i]) return tree;
  }
  return raw;
}

/** Ağaç + kayıtlı bölüm varyasyonlarını birleştirir (legacy-only dallar kaybolmasın). */
export function mergeVariationRecords(
  chapterVars: Record<number, string[][]>,
  treeVars: Record<number, string[][]>,
): Record<number, string[][]> {
  const out: Record<number, string[][]> = { ...treeVars };
  for (const [key, groups] of Object.entries(chapterVars)) {
    const k = Number(key);
    if (!Number.isFinite(k) || !Array.isArray(groups)) continue;
    const existing = out[k] ?? [];
    const merged = existing.map((line) => [...line]);
    for (const line of groups) {
      if (!Array.isArray(line) || !line.length) continue;
      const sig = line.join('\0');
      if (!merged.some((g) => g.join('\0') === sig)) merged.push([...line]);
    }
    if (merged.length) out[k] = merged;
  }
  return out;
}

/** Lichess tarzı: varyasyonu ana hatta yükseltir — ağaç modeli (children[0] = ana hat). */
export function promoteVariationLines(
  moves: string[],
  variations: Record<number, string[][]>,
  mainLinePos: number,
  varGroupIdx: number,
  startFen: string = DEFAULT_FEN,
): { moves: string[]; variations: Record<number, string[][]>; nextMoveIndex: number } | null {
  return promoteVariationLegacy(moves, variations, mainLinePos, varGroupIdx, startFen);
}

/** Sync ağacından eski `variations` kaydı formatına dönüştürür */
export function buildLegacyVariationsFromTree(tree: StudyTree): Record<number, string[][]> {
  const variations: Record<number, string[][]> = {};
  const mainline = tree.mainline ?? [];
  const mainSet = new Set(mainline);

  for (let i = 0; i < mainline.length; i++) {
    const nodeId = mainline[i];
    const node = tree.nodes[nodeId];
    if (!node) continue;
    const mainChild = mainline[i + 1] ?? null;
    const altChildren = (node.children ?? []).filter((cid) => cid && cid !== mainChild);
    if (altChildren.length === 0) continue;
    // mainline[i] düğümünden ayrılan varyasyonlar → legacy anahtar = i (k öncesi hamle sayısı)
    const moveIndex = i;
    const groups: string[][] = [];
    const seen = new Set<string>();
    for (const childId of altChildren) {
      const line = followFirstLineSans(tree, childId, mainSet);
      if (!line.length) continue;
      const key = line.join('\0');
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(line);
    }
    if (groups.length) variations[moveIndex] = groups;
  }

  return variations;
}

/** Varyasyon satırındaki belirli hamle indeksine karşılık gelen ağaç düğümü. */
export function findVariationNodeAtMoveIndex(
  tree: StudyTree,
  mainLinePos: number,
  varGroupIdx: number,
  varMoveIdx: number,
  legacyVariations?: Record<number, string[][]>,
): string | null {
  const branchId = findVariationBranchNodeId(tree, mainLinePos, varGroupIdx, legacyVariations);
  if (!branchId) return null;
  const mainSet = new Set(tree.mainline);
  let nodeId = branchId;
  for (let i = 0; i < varMoveIdx; i++) {
    const node = tree.nodes[nodeId];
    if (!node) return nodeId;
    const nextId = node.children?.[0];
    if (!nextId || mainSet.has(nextId)) return nodeId;
    nodeId = nextId;
  }
  return nodeId;
}

/** Varyasyon grubunun ilk düğüm kimliğini bulur */
export function findVariationBranchNodeId(
  tree: StudyTree,
  mainLinePos: number,
  varGroupIdx: number,
  legacyVariations?: Record<number, string[][]>,
): string | null {
  const variations = mergeVariationRecords(
    legacyVariations ?? {},
    buildLegacyVariationsFromTree(tree),
  );
  const targetLine = variations[mainLinePos]?.[varGroupIdx];
  if (!targetLine?.length) return null;

  const parentMlIndex = Math.max(0, Math.min(tree.mainline.length - 1, mainLinePos));
  const parentId = tree.mainline[parentMlIndex];
  const parent = tree.nodes[parentId];
  if (!parent) return null;

  const mainChild = tree.mainline[parentMlIndex + 1] ?? null;
  const mainSet = new Set(tree.mainline);
  const altChildren = (parent.children ?? []).filter((cid) => cid && cid !== mainChild);

  let groupIdx = 0;
  const seen = new Set<string>();
  for (const childId of altChildren) {
    const line = followFirstLineSans(tree, childId, mainSet);
    if (!line.length) continue;
    const key = line.join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    if (groupIdx === varGroupIdx) return childId;
    if (key === targetLine.join('\0')) return childId;
    groupIdx++;
  }

  const firstSan = targetLine[0];
  const bySan = altChildren.filter((cid) => {
    const n = tree.nodes[cid];
    return !!n && String(n.san ?? '') === String(firstSan);
  });
  return bySan[varGroupIdx] ?? bySan[0] ?? null;
}

export function mainlineSansFromTree(tree: StudyTree, rootFen: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < tree.mainline.length; i++) {
    const id = tree.mainline[i]!;
    const n = tree.nodes[id];
    const label = (n?.san || '').trim();
    if (!label) continue;
    const pid = n.parentId;
    const beforeFen = pid && tree.nodes[pid]?.fen ? tree.nodes[pid]!.fen : rootFen;
    out.push(displaySanForStoredMove(label, beforeFen));
  }
  return out;
}
