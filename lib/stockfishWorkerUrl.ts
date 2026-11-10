/**
 * Stockfish worker script URL.
 * Hash fragment kullanmıyoruz — stockfish.js worker wasm dosyasını pathname'den türetir.
 */
export function stockfishWorkerUrl(scriptPath: string): string {
  if (typeof window === 'undefined') return scriptPath;
  return new URL(scriptPath, window.location.origin).href;
}

/**
 * Antrenör analiz paneli — MultiPV + go infinite destekleyen modern NNUE'li
 * Stockfish 18 öncelikli. (`currentEngine` varsayılanı 'lite' bu dosyayı
 * kastediyordu ama liste hiç içermiyordu — SF18 analiz panelinde hiç
 * kullanılmıyordu, sessizce 2019 Stockfish 10'a düşülüyordu.)
 */
export const STOCKFISH_ANALYSIS_CANDIDATES = [
  '/stockfish/stockfish-18-lite-single.js',
  '/stockfish/stockfish.wasm.js',
  '/stockfish/stockfish.js',
] as const;

/**
 * Hamle / eval (VS bilgisayar). Modern NNUE'li Stockfish 18 önce denenir — eskiden
 * burada "hızlı başlatma için" diye 2019 Stockfish 10 (NNUE yok, çok daha zayıf
 * değerlendirme) ilk sırada denenip neredeyse her zaman o yükleniyordu; "VS
 * Bilgisayar" rakibi gerçekte neredeyse hiç Stockfish 18 olmuyordu. SF18 başarısız
 * olursa eski motor son çare olarak kalıyor.
 */
export const STOCKFISH_MOVE_CANDIDATES = [
  '/stockfish/stockfish-18-lite-single.js',
  '/stockfish/stockfish.wasm.js',
  '/stockfish/stockfish.js',
] as const;

/** @deprecated STOCKFISH_MOVE_CANDIDATES kullanın */
export const STOCKFISH_WORKER_CANDIDATES = STOCKFISH_MOVE_CANDIDATES;
