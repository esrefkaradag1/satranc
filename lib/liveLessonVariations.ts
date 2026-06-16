import { makeBuilderGame, applyMove } from './studyUtils';

export type LiveVariationRef = [number, number, number];

export function liveLessonFenAt(
  baseFen: string,
  mainMoves: string[],
  variations: Record<number, string[][]>,
  mainPly: number,
  currentVariation: LiveVariationRef | null,
): string {
  try {
    const g = makeBuilderGame(baseFen);
    if (currentVariation) {
      const [mainLinePos, varGroupIdx, varMoveIdx] = currentVariation;
      for (let i = 0; i < mainLinePos; i++) {
        if (!applyMove(g, mainMoves[i]!)) break;
      }
      const varMoves = variations[mainLinePos]?.[varGroupIdx] ?? [];
      for (let i = 0; i <= varMoveIdx && i < varMoves.length; i++) {
        if (!applyMove(g, varMoves[i]!)) break;
      }
      return g.fen();
    }
    for (let i = 0; i < mainPly; i++) {
      if (!applyMove(g, mainMoves[i]!)) break;
    }
    return g.fen();
  } catch {
    return baseFen;
  }
}

export function liveLessonActivePlyCount(
  mainMoves: string[],
  variations: Record<number, string[][]>,
  currentVariation: LiveVariationRef | null,
): number {
  if (!currentVariation) return mainMoves.length;
  const line = variations[currentVariation[0]]?.[currentVariation[1]] ?? [];
  return line.length;
}

export function sanitizeLiveVariations(raw: unknown): Record<number, string[][]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<number, string[][]> = {};
  for (const [key, groups] of Object.entries(raw as Record<string, unknown>)) {
    const ply = parseInt(key, 10);
    if (!Number.isFinite(ply) || !Array.isArray(groups)) continue;
    const lines = groups
      .filter((g): g is unknown[] => Array.isArray(g))
      .map((g) => g.filter((m): m is string => typeof m === 'string' && m.trim().length > 0));
    if (lines.length) out[ply] = lines;
  }
  return out;
}
