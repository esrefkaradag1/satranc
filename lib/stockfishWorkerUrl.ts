/**
 * Stockfish worker script URL.
 * Hash fragment kullanmıyoruz — stockfish.js worker wasm dosyasını pathname'den türetir.
 */
export function stockfishWorkerUrl(scriptPath: string): string {
  if (typeof window === 'undefined') return scriptPath;
  return new URL(scriptPath, window.location.origin).href;
}

/** Antrenör analiz paneli — MultiPV + go infinite destekleyen wasm.js öncelikli */
export const STOCKFISH_ANALYSIS_CANDIDATES = [
  '/stockfish/stockfish.wasm.js',
  '/stockfish/stockfish.js',
] as const;

/** Hamle / eval (VS bilgisayar) — hızlı başlatma için js öncelikli */
export const STOCKFISH_MOVE_CANDIDATES = [
  '/stockfish/stockfish.js',
  '/stockfish/stockfish-18-lite-single.js',
  '/stockfish/stockfish.wasm.js',
] as const;

/** @deprecated STOCKFISH_MOVE_CANDIDATES kullanın */
export const STOCKFISH_WORKER_CANDIDATES = STOCKFISH_MOVE_CANDIDATES;
