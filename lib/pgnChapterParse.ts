import { DEFAULT_FEN, makeBuilderGame, applyMove } from './studyUtils';
import { headersToPgnTags, sortPgnTags } from './studyPgnTags';
import { buildInitialTree, rebuildMainlineFromTree, genNodeId } from './studySync/apply';
import { exportLegacyFromTree } from './studySync/treeModel';
import type { StudyTree, StudyNode, NodeId } from './studySync/types';
import type { Shape } from './studySync/types';

type PgnToken =
  | { type: 'moveNumber'; value: string }
  | { type: 'san'; san: string; glyphs: string[] }
  | { type: 'comment'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'nag'; value: number }
  | { type: 'result'; value: string };

export type ParsedPgnChapter = {
  startFen: string;
  title?: string;
  pgnTags: Array<[string, string]>;
  moves: string[];
  moveComments: Record<number, string>;
  moveAnnotations: Record<number, string | string[]>;
  variations: Record<number, string[][]>;
  tree: StudyTree;
};

const SAN_WITH_GLYPH =
  /^((?:O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h](?:=[NBRQ])?[+#]?))((?:!!|\?\?|!\?|\?!|!|\?)+)?$/;

const NAG_TO_GLYPH: Record<number, string> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  5: '!?',
  6: '?!',
};

function extractHeaders(block: string): { headers: Record<string, string>; movetext: string } {
  const headers: Record<string, string> = {};
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const movetextLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*\[([A-Za-z0-9_]+)\s+"([^"]*)"\]\s*$/);
    if (m) headers[m[1]] = m[2];
    else movetextLines.push(line);
  }
  return { headers, movetext: movetextLines.join(' ').trim() };
}

function splitSanGlyphs(raw: string): { san: string; glyphs: string[] } | null {
  const m = raw.match(SAN_WITH_GLYPH);
  if (m) {
    const glyphs = m[2] ? m[2].match(/!!|\?\?|!\?|\?!|!|\?/g) ?? [] : [];
    return { san: m[1], glyphs };
  }
  if (/^(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h](?:=[NBRQ])?[+#]?)$/.test(raw)) {
    return { san: raw, glyphs: [] };
  }
  return null;
}

function tokenizeMovetext(movetext: string): PgnToken[] {
  const out: PgnToken[] = [];
  let i = 0;
  while (i < movetext.length) {
    const c = movetext[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') {
      let j = i + 1;
      while (j < movetext.length && movetext[j] !== '}') j++;
      const value = movetext.slice(i + 1, j).trim();
      if (value) out.push({ type: 'comment', value });
      i = j + 1;
      continue;
    }
    if (c === '(') { out.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { out.push({ type: 'rparen' }); i++; continue; }
    if (c === '$') {
      let j = i + 1;
      while (j < movetext.length && /\d/.test(movetext[j])) j++;
      const n = parseInt(movetext.slice(i + 1, j), 10);
      if (Number.isFinite(n)) out.push({ type: 'nag', value: n });
      i = j;
      continue;
    }
    let j = i;
    while (j < movetext.length && !/[\s(){}]/.test(movetext[j])) j++;
    const word = movetext.slice(i, j);
    if (/^\d+\.(?:\.\.)?$/.test(word)) out.push({ type: 'moveNumber', value: word });
    else if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(word)) out.push({ type: 'result', value: word });
    else {
      const parsed = splitSanGlyphs(word);
      if (parsed) out.push({ type: 'san', san: parsed.san, glyphs: parsed.glyphs });
    }
    i = j;
  }
  return out;
}

function attachComment(tree: StudyTree, nodeId: NodeId, text: string): StudyTree {
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  const id = genNodeId();
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: {
        ...node,
        comments: [...node.comments, { id, by: 'pgn', text, createdAt: new Date().toISOString() }],
      },
    },
  };
}

function attachGlyphs(tree: StudyTree, nodeId: NodeId, glyphs: string[]): StudyTree {
  if (!glyphs.length) return tree;
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: { ...node, glyphs: [...node.glyphs, ...glyphs] },
    },
  };
}

function lichessShapeColor(code: string): string {
  switch (code.toUpperCase()) {
    case 'Y': return '#e68a00cc';
    case 'R': return '#c02020cc';
    case 'B': return '#003088cc';
    default: return '#15781Bcc';
  }
}

/** Lichess yorum etiketleri: [%cal Ge2e4] ok, [%csl Ge4] daire. */
export function parseLichessDiagramShapes(text: string): Shape[] {
  const shapes: Shape[] = [];
  const calMatch = text.match(/\[%cal\s+([^\]]+)\]/i);
  if (calMatch?.[1]) {
    for (const raw of calMatch[1].split(',')) {
      const token = raw.trim();
      if (token.length < 5) continue;
      const color = lichessShapeColor(token[0]!);
      const from = token.slice(1, 3).toLowerCase();
      const to = token.slice(3, 5).toLowerCase();
      if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
        shapes.push({ startSquare: from, endSquare: to, color });
      }
    }
  }
  const cslMatch = text.match(/\[%csl\s+([^\]]+)\]/i);
  if (cslMatch?.[1]) {
    for (const raw of cslMatch[1].split(',')) {
      const token = raw.trim();
      if (token.length < 3) continue;
      const color = lichessShapeColor(token[0]!);
      const sq = token.slice(1, 3).toLowerCase();
      if (/^[a-h][1-8]$/.test(sq)) {
        shapes.push({ startSquare: sq, endSquare: sq, color });
      }
    }
  }
  return shapes;
}

function stripLichessDiagramTags(text: string): string {
  return text
    .replace(/\[%cal[^\]]*\]/gi, '')
    .replace(/\[%csl[^\]]*\]/gi, '')
    .replace(/\[%clk[^\]]*\]/gi, '')
    .replace(/\[%emt[^\]]*\]/gi, '')
    .replace(/\[%eval[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function attachShapes(tree: StudyTree, nodeId: NodeId, shapes: Shape[]): StudyTree {
  if (!shapes.length) return tree;
  const node = tree.nodes[nodeId];
  if (!node) return tree;
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: { ...node, shapes: [...node.shapes, ...shapes] },
    },
  };
}

function addMoveNode(tree: StudyTree, parentId: NodeId, san: string, glyphs: string[]): { tree: StudyTree; nodeId: NodeId | null } {
  const parent = tree.nodes[parentId];
  if (!parent) return { tree, nodeId: null };
  const g = makeBuilderGame(parent.fen);
  if (!applyMove(g, san)) return { tree, nodeId: null };

  const existing = (parent.children ?? [])
    .map((cid) => tree.nodes[cid])
    .find((n) => n && String(n.san ?? '').trim() === san);
  if (existing) {
    let next = tree;
    if (glyphs.length) next = attachGlyphs(next, existing.id, glyphs);
    return { tree: next, nodeId: existing.id };
  }

  const childId = genNodeId();
  const child: StudyNode = {
    id: childId,
    parentId,
    children: [],
    san,
    fen: g.fen(),
    ply: parent.ply + 1,
    comments: [],
    glyphs: [...glyphs],
    shapes: [],
  };
  const nextNodes = { ...tree.nodes, [childId]: child };
  nextNodes[parentId] = { ...parent, children: [...(parent.children ?? []), childId] };
  return { tree: { ...tree, nodes: nextNodes }, nodeId: childId };
}

/** Parantez varyasyonunun hangi düğümden dallanacağını belirler (Lichess uyumlu). */
function resolveVariationParentId(
  tree: StudyTree,
  lastNodeId: NodeId,
  tokens: PgnToken[],
  pos: { i: number },
): NodeId {
  let peek = pos.i;
  while (peek < tokens.length && (tokens[peek].type === 'comment' || tokens[peek].type === 'nag')) peek++;
  const mn = tokens[peek];
  if (mn?.type === 'moveNumber') {
    const raw = mn.value;
    const num = parseInt(raw.split(/[.\s]/)[0] ?? '1', 10) || 1;
    const isBlackOnly = raw.includes('...');
    if (num === 1 && !isBlackOnly) return tree.rootId;
    if (num === 1 && isBlackOnly) return tree.nodes[lastNodeId]?.parentId ?? tree.rootId;
    return lastNodeId;
  }
  return tree.nodes[lastNodeId]?.parentId ?? tree.rootId;
}

function parseSequence(
  tree: StudyTree,
  parentId: NodeId,
  tokens: PgnToken[],
  pos: { i: number },
  stopAt: 'rparen' | 'eof',
): { tree: StudyTree; lastNodeId: NodeId | null } {
  let currentParentId = parentId;
  let lastNodeId: NodeId | null = null;

  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (stopAt === 'rparen' && tok.type === 'rparen') break;
    if (tok.type === 'result') break;

    if (tok.type === 'moveNumber') { pos.i++; continue; }

    if (tok.type === 'comment') {
      if (lastNodeId) tree = attachComment(tree, lastNodeId, tok.value);
      pos.i++;
      continue;
    }

    if (tok.type === 'nag') {
      const glyph = NAG_TO_GLYPH[tok.value];
      if (glyph && lastNodeId) tree = attachGlyphs(tree, lastNodeId, [glyph]);
      pos.i++;
      continue;
    }

    if (tok.type === 'lparen') {
      pos.i++;
      const branchParentId = lastNodeId
        ? resolveVariationParentId(tree, lastNodeId, tokens, pos)
        : currentParentId;
      const nested = parseSequence(tree, branchParentId, tokens, pos, 'rparen');
      tree = nested.tree;
      if (tokens[pos.i]?.type === 'rparen') pos.i++;
      continue;
    }

    if (tok.type === 'rparen') break;

    if (tok.type === 'san') {
      const extraGlyphs = [...tok.glyphs];
      pos.i++;
      while (pos.i < tokens.length) {
        const next = tokens[pos.i];
        if (next.type === 'nag') {
          const g = NAG_TO_GLYPH[next.value];
          if (g) extraGlyphs.push(g);
          pos.i++;
          continue;
        }
        break;
      }

      const added = addMoveNode(tree, currentParentId, tok.san, extraGlyphs);
      tree = added.tree;
      if (!added.nodeId) continue;
      lastNodeId = added.nodeId;
      currentParentId = added.nodeId;

      if (pos.i < tokens.length && tokens[pos.i].type === 'comment') {
        const rawComment = tokens[pos.i].value;
        const diagramShapes = parseLichessDiagramShapes(rawComment);
        if (diagramShapes.length) tree = attachShapes(tree, lastNodeId, diagramShapes);
        const clean = stripLichessDiagramTags(rawComment);
        if (clean) tree = attachComment(tree, lastNodeId, clean);
        pos.i++;
      }
      continue;
    }

    pos.i++;
  }

  return { tree, lastNodeId };
}

function legacyMetaFromMainline(tree: StudyTree): {
  moveComments: Record<number, string>;
  moveAnnotations: Record<number, string | string[]>;
} {
  const moveComments: Record<number, string> = {};
  const moveAnnotations: Record<number, string | string[]> = {};
  const mainline = tree.mainline ?? [];
  for (let i = 1; i < mainline.length; i++) {
    const node = tree.nodes[mainline[i]!];
    if (!node) continue;
    const idx = i - 1;
    const commentText = node.comments.map((c) => c.text).join('\n').trim();
    if (commentText) moveComments[idx] = commentText;
    if (node.glyphs.length === 1) moveAnnotations[idx] = node.glyphs[0]!;
    else if (node.glyphs.length > 1) moveAnnotations[idx] = [...node.glyphs];
  }
  return { moveComments, moveAnnotations };
}

/** PGN bloğunu ana hat + varyant + yorum + sembollerle birlikte ayrıştırır. */
export function parsePgnBlockToChapter(block: string): ParsedPgnChapter {
  const trimmed = block.trim();
  if (!trimmed) {
    const empty = buildInitialTree(DEFAULT_FEN);
    return { startFen: DEFAULT_FEN, pgnTags: [], moves: [], moveComments: {}, moveAnnotations: {}, variations: {}, tree: empty };
  }

  const { headers, movetext } = extractHeaders(trimmed);
  const startFen = headers.FEN?.trim() || DEFAULT_FEN;
  const title = headers.ChapterName?.trim() || headers.Event?.trim() || undefined;
  const pgnTags = headersToPgnTags(headers);

  if (!movetext || movetext === '*') {
    const empty = buildInitialTree(startFen);
    return { startFen, title, pgnTags, moves: [], moveComments: {}, moveAnnotations: {}, variations: {}, tree: empty };
  }

  const tokens = tokenizeMovetext(movetext);
  let tree = buildInitialTree(startFen);
  const parsed = parseSequence(tree, tree.rootId, tokens, { i: 0 }, 'eof');
  tree = { ...parsed.tree, mainline: rebuildMainlineFromTree(parsed.tree) };

  const legacy = exportLegacyFromTree(tree, startFen);
  const meta = legacyMetaFromMainline(tree);

  return {
    startFen: legacy.fen ?? startFen,
    title,
    pgnTags,
    moves: legacy.moves ?? [],
    moveComments: meta.moveComments,
    moveAnnotations: meta.moveAnnotations,
    variations: legacy.variations ?? {},
    tree,
  };
}
