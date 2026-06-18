/**
 * Lichess / PGN ağaç modeli — ana hat = her düğümdeki ilk çocuk (children[0]).
 *
 * Başlangıç
 * ├── e4  ← ana hat (children[0])
 * ├── d4  ← varyasyon
 * └── g4
 *
 * "Ana devam yolu yap" → seçilen kardeş children dizisinde başa alınır, mainline yeniden hesaplanır.
 * PGN: 1. g4 (1. e4) (1. d4)
 */

import { DEFAULT_FEN, applyMove, makeBuilderGame } from '../studyUtils';
import type { NodeId, StudyNode, StudyTree } from './types';
import {
  buildInitialTree,
  genNodeId,
  promoteBranchToMainline,
  rebuildMainlineFromTree,
} from './apply';

function followFirstLineSans(tree: StudyTree, startId: NodeId, mainSet: Set<NodeId>, maxLen = 512): string[] {
  const line: string[] = [];
  let cur = tree.nodes[startId];
  let guard = 0;
  while (cur && guard < maxLen) {
    guard++;
    if (cur.san) line.push(cur.san);
    const nextId = cur.children?.[0];
    if (!nextId || mainSet.has(nextId)) break;
    cur = tree.nodes[nextId];
  }
  return line;
}

function mainlineSansFromTree(tree: StudyTree, rootFen: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < tree.mainline.length; i++) {
    const id = tree.mainline[i]!;
    const n = tree.nodes[id];
    const label = (n?.san || '').trim();
    if (!label) continue;
    out.push(label);
  }
  return out;
}

function buildLegacyVariationsFromTree(tree: StudyTree): Record<number, string[][]> {
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

export type LegacyChapterMoves = {
  fen?: string;
  moves: string[];
  variations?: Record<number, string[][]>;
};

export type LegacyPromoteResult = {
  moves: string[];
  variations: Record<number, string[][]>;
  nextMoveIndex: number;
};

/** Ana hat = children[0] zinciri (Lichess pathIsMainline). */
export function mainlineNodeIds(tree: StudyTree): NodeId[] {
  return rebuildMainlineFromTree(tree);
}

/** Bir düğümün ana hat çocuğu (yoksa undefined). */
export function mainlineChild(tree: StudyTree, nodeId: NodeId): StudyNode | null {
  const node = tree.nodes[nodeId];
  const childId = node?.children?.[0];
  if (!childId) return null;
  return tree.nodes[childId] ?? null;
}

/** Ana hat dışındaki çocuklar (PGN parantez varyasyonları). */
export function variationChildren(tree: StudyTree, nodeId: NodeId): StudyNode[] {
  const node = tree.nodes[nodeId];
  if (!node?.children?.length) return [];
  const mainId = node.children[0];
  return node.children
    .slice(1)
    .map((id) => tree.nodes[id])
    .filter((n): n is StudyNode => !!n);
}

function addMoveChain(
  tree: StudyTree,
  parentId: NodeId,
  sans: string[],
): { tree: StudyTree; lastId: NodeId } {
  let nextTree = tree;
  let pid = parentId;
  for (const raw of sans) {
    const san = (raw || '').trim();
    if (!san) continue;
    const parent = nextTree.nodes[pid];
    if (!parent) break;

    const existing = (parent.children ?? [])
      .map((cid) => nextTree.nodes[cid])
      .find((n) => n && String(n.san ?? '').trim() === san);
    if (existing) {
      pid = existing.id;
      continue;
    }

    const g = makeBuilderGame(parent.fen);
    if (!applyMove(g, san)) break;
    const childId = genNodeId();
    const child: StudyNode = {
      id: childId,
      parentId: pid,
      children: [],
      san,
      fen: g.fen(),
      ply: parent.ply + 1,
      comments: [],
      glyphs: [],
      shapes: [],
    };
    const nextNodes = { ...nextTree.nodes, [childId]: child };
    nextNodes[pid] = { ...parent, children: [...(parent.children ?? []), childId] };
    nextTree = { ...nextTree, nodes: nextNodes };
    pid = childId;
  }
  return { tree: nextTree, lastId: pid };
}

/**
 * Legacy `moves` + `variations` kaydından Lichess tarzı ağaç oluşturur.
 * `variations[k]` → ana hatta k. hamle yerine geçen alternatifler (k öncesi korunur).
 */
export function buildTreeFromLegacy(chapter: LegacyChapterMoves): StudyTree {
  const startFen = (chapter.fen || '').trim() || DEFAULT_FEN;
  let tree = buildInitialTree(startFen);
  const mainSans = chapter.moves ?? [];

  const { tree: withMain } = addMoveChain(tree, tree.rootId, mainSans);
  tree = { ...withMain, mainline: rebuildMainlineFromTree(withMain) };

  const vars = chapter.variations ?? {};
  const sortedKeys = Object.keys(vars)
    .map(Number)
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);

  for (const key of sortedKeys) {
    const groups = vars[key];
    if (!Array.isArray(groups)) continue;
    const parentId = tree.mainline[key] ?? tree.rootId;
    if (!tree.nodes[parentId]) continue;
    for (const line of groups) {
      if (!Array.isArray(line) || !line.length) continue;
      const { tree: next } = addMoveChain(tree, parentId, line);
      tree = { ...next, mainline: rebuildMainlineFromTree(next) };
    }
  }

  return { ...tree, mainline: rebuildMainlineFromTree(tree) };
}

export function exportLegacyFromTree(tree: StudyTree, startFen?: string): LegacyChapterMoves {
  const fen = startFen?.trim() || tree.nodes[tree.rootId]?.fen || DEFAULT_FEN;
  return {
    fen,
    moves: mainlineSansFromTree(tree, fen),
    variations: buildLegacyVariationsFromTree(tree),
  };
}

/**
 * Lichess `promoteAt`: seçilen dalı her seviyede children[0] yap.
 */
export function promoteVariationInTree(tree: StudyTree, branchNodeId: NodeId): StudyTree {
  return promoteBranchToMainline(tree, branchNodeId);
}

function findBranchNodeId(
  tree: StudyTree,
  mainLinePos: number,
  varGroupIdx: number,
  legacyVariations: Record<number, string[][]>,
): NodeId | null {
  const targetLine = legacyVariations[mainLinePos]?.[varGroupIdx];
  if (!targetLine?.length) return null;

  const parentId = tree.mainline[mainLinePos] ?? tree.rootId;
  const parent = tree.nodes[parentId];
  if (!parent) return null;

  const mainChildId = tree.mainline[mainLinePos + 1] ?? null;
  const altIds = (parent.children ?? []).filter((cid) => cid && cid !== mainChildId);

  let groupIdx = 0;
  const seen = new Set<string>();
  for (const childId of altIds) {
    const line = collectLineSans(tree, childId, new Set(tree.mainline));
    if (!line.length) continue;
    const sig = line.join('\0');
    if (seen.has(sig)) continue;
    seen.add(sig);
    if (groupIdx === varGroupIdx || sig === targetLine.join('\0')) return childId;
    groupIdx++;
  }

  const firstSan = targetLine[0];
  const bySan = altIds.filter((cid) => String(tree.nodes[cid]?.san ?? '') === String(firstSan));
  return bySan[varGroupIdx] ?? bySan[0] ?? null;
}

function collectLineSans(tree: StudyTree, startId: NodeId, mainSet: Set<NodeId>): string[] {
  const out: string[] = [];
  let cur = tree.nodes[startId];
  let guard = 0;
  while (cur && guard < 512) {
    guard++;
    if (cur.san) out.push(cur.san);
    const nextId = cur.children?.[0];
    if (!nextId || mainSet.has(nextId)) break;
    cur = tree.nodes[nextId];
  }
  return out;
}

/** Legacy format üzerinde ana hat yükseltme — içeride ağaç modeli kullanılır. */
export function promoteVariationLegacy(
  moves: string[],
  variations: Record<number, string[][]>,
  mainLinePos: number,
  varGroupIdx: number,
  startFen: string = DEFAULT_FEN,
): LegacyPromoteResult | null {
  const tree = buildTreeFromLegacy({ fen: startFen, moves, variations });
  const branchId = findBranchNodeId(tree, mainLinePos, varGroupIdx, variations);
  if (!branchId) return null;

  const promoted = promoteVariationInTree(tree, branchId);
  const exported = exportLegacyFromTree(promoted, startFen);
  return {
    moves: exported.moves,
    variations: exported.variations ?? {},
    nextMoveIndex: exported.moves.length,
  };
}
