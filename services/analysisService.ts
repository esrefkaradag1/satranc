/**
 * Stockfish — Sürekli MultiPV Analiz için ayrı Web Worker.
 * EngineAnalysis bileşeni Lichess tarzı çoklu varyant analizi için bunu kullanır.
 * stockfishService (best move / eval) ile çakışmasın diye bağımsız bir worker kullanır.
 */

export interface PvLine {
  multipv: number;
  depth: number;
  score: number;
  mate: number | null;
  pv: string[];
  nodes: number;
  nps: number;
}

type Listener = {
  onLines?: (lines: (PvLine | null)[]) => void;
  onDepth?: (depth: number) => void;
  onReady?: () => void;
  onError?: (err: string) => void;
};

let worker: Worker | null = null;
let ready = false;
let initializing = false;
let initPromise: Promise<boolean> | null = null;

let currentNumPv = 3;
let currentThreads = 1;
let currentHash = 16;
type EngineVariant = 'lite' | 'wasm' | 'js';
let currentEngine: EngineVariant = 'lite';

let pvLines: (PvLine | null)[] = [];
let analysisRunning = false;
let pendingFen: string | null = null;
let lastFen: string | null = null;
const listeners = new Set<Listener>();
let readyWaitResolve: (() => void) | null = null;
let restartScheduled = false;

// Debounce ve Retry yönetimi
let analysisDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let restartFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let stopWaitListener: ((ev: MessageEvent) => void) | null = null;
let analysisSeq = 0;
let recoveryRetryCount = 0;
const MAX_RECOVERY_RETRIES = 3;

function isValidFen(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return false;
  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return false;
  return true;
}

function clearStopWait(): void {
  if (restartFallbackTimer) {
    clearTimeout(restartFallbackTimer);
    restartFallbackTimer = null;
  }
  if (stopWaitListener && worker) {
    worker.removeEventListener('message', stopWaitListener);
    stopWaitListener = null;
  }
  restartScheduled = false;
}

function log(...args: unknown[]) {
  console.log('[AnalysisEngine]', ...args);
}

/** Worker tek mesajda birden çok satır gönderebilir */
function uciIncomingLines(data: unknown): string[] {
  const raw = typeof data === 'string' ? data : String(data ?? '');
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function parseInfoLine(line: string): PvLine | null {
  const depthMatch = line.match(/\bdepth (\d+)/);
  const pvMatch = line.match(/\bpv (.+)/);
  if (!depthMatch || !pvMatch) return null;
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  if (!cpMatch && !mateMatch) return null;
  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const nodesMatch = line.match(/\bnodes (\d+)/);
  const npsMatch = line.match(/\bnps (\d+)/);
  return {
    multipv: multipvMatch ? parseInt(multipvMatch[1], 10) : 1,
    depth: parseInt(depthMatch[1], 10),
    score: cpMatch ? parseInt(cpMatch[1], 10) / 100 : 0,
    mate: mateMatch ? parseInt(mateMatch[1], 10) : null,
    pv: pvMatch[1].trim().split(/\s+/),
    nodes: nodesMatch ? parseInt(nodesMatch[1], 10) : 0,
    nps: npsMatch ? parseInt(npsMatch[1], 10) : 0,
  };
}

let debugCount = 0;
let infoLogCount = 0;

function emitLines() {
  const arr = [...pvLines];
  for (const l of listeners) l.onLines?.(arr);
}
function emitDepth(d: number) {
  for (const l of listeners) l.onDepth?.(d);
}
function emitReady() {
  for (const l of listeners) l.onReady?.();
}
function emitError(msg: string) {
  for (const l of listeners) l.onError?.(msg);
}

function handleMessage(line: string) {
  if (debugCount < 12) {
    log('msg:', line);
    debugCount += 1;
  }

  if (line === 'readyok') {
    if (readyWaitResolve) {
      const fn = readyWaitResolve;
      readyWaitResolve = null;
      fn();
    }
    return;
  }

  if (line.startsWith('info ') && line.includes(' pv ')) {
    if (infoLogCount < 3) {
      log('INFO PV:', line);
      infoLogCount += 1;
    }
    const parsed = parseInfoLine(line);
    if (parsed) {
      const idx = parsed.multipv - 1;
      if (idx >= 0 && idx < currentNumPv) {
        const next: (PvLine | null)[] = [...pvLines];
        while (next.length < currentNumPv) next.push(null);
        next.length = currentNumPv;
        next[idx] = parsed;
        pvLines = next;
        emitLines();
        const valid = next.filter((l): l is PvLine => l !== null);
        const maxD = valid.reduce((m, l) => Math.max(m, l.depth), 0);
        if (maxD > 0) emitDepth(maxD);
      }
    }
    return;
  }
  if (line.startsWith('bestmove ')) {
    log('bestmove:', line);
    analysisRunning = false;
  }
}

function waitReady(timeoutMs = 2000): Promise<void> {
  if (!worker || !ready) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      readyWaitResolve = null;
      resolve();
    }, timeoutMs);

    readyWaitResolve = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };

    try { 
      worker.postMessage('isready'); 
    } catch (err) { 
      log('isready postMessage failed:', err);
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve();
      }
    }
  });
}

function doStartAnalysis(fen: string): void {
  if (!worker || !ready) return;

  pvLines = new Array(currentNumPv).fill(null);
  emitLines();
  emitDepth(0);

  log('Starting analysis fen=', fen, 'numPv=', currentNumPv, 'threads=', currentThreads, 'hash=', currentHash);
  try { worker.postMessage(`setoption name Threads value ${currentThreads}`); } catch {}
  try { worker.postMessage(`setoption name Hash value ${currentHash}`); } catch {}
  try { worker.postMessage(`setoption name MultiPV value ${currentNumPv}`); } catch {}
  try { worker.postMessage('setoption name UCI_AnalyseMode value true'); } catch {}
  worker.postMessage(`position fen ${fen}`);
  worker.postMessage('go infinite');
  analysisRunning = true;
}

function tryCreate(url: string, timeoutMs = 8000): Promise<Worker> {
  return new Promise((resolve, reject) => {
    log('Trying worker at', url);
    let w: Worker;
    try {
      w = new Worker(url);
    } catch (e) {
      reject(new Error(`new Worker(${url}) failed: ${(e as Error).message}`));
      return;
    }
    let settled = false;
    const buf: string[] = [];
    const t = setTimeout(() => {
      if (!settled) {
        settled = true;
        w.terminate();
        reject(new Error(`uciok timeout at ${url}`));
      }
    }, timeoutMs);

    const onMsg = (e: MessageEvent<string>) => {
      for (const line of uciIncomingLines(e.data)) {
        buf.push(line);
        if (line === 'uciok' && !settled) {
          settled = true;
          clearTimeout(t);
          w.removeEventListener('message', onMsg);
          w.addEventListener('message', (ev: MessageEvent<string>) => {
            for (const l of uciIncomingLines(ev.data)) handleMessage(l);
          });
          for (const m of buf) handleMessage(m);
          log('Worker ready at', url);
          resolve(w);
          break;
        }
      }
    };
    w.addEventListener('message', onMsg);
    w.addEventListener('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        w.terminate();
        reject(new Error(`Worker error at ${url}: ${err.message}`));
      } else {
        log('Worker runtime error:', err.message);
        // Worker öldüyse temizle ve yeniden başlatılması için hazırla
        try { w.terminate(); } catch {}
        if (worker === w) {
          clearStopWait();
          worker = null;
          ready = false;
          analysisRunning = false;
          initializing = false;
          initPromise = null;
          analysisSeq += 1;

          if (recoveryRetryCount < MAX_RECOVERY_RETRIES) {
            recoveryRetryCount++;
            emitError(`Motor çöktü, yeniden başlatılıyor... (${recoveryRetryCount}/${MAX_RECOVERY_RETRIES})`);
            const fenToResume = lastFen;
            if (fenToResume) {
              setTimeout(() => {
                void initAnalysis().then((ok) => {
                  if (ok && fenToResume) startAnalysis(fenToResume, true);
                });
              }, 400);
            }
          } else {
            log('Max recovery retries reached. Stopping.');
            emitError('Motor sürekli çöküyor, lütfen sayfayı yenileyin veya motor ayarlarını (lite/wasm) değiştirin.');
          }
        }
      }
    });
    w.postMessage('uci');
  });
}

export async function initAnalysis(): Promise<boolean> {
  if (ready && worker) return true;
  if (initPromise) return initPromise;

  initializing = true;
  initPromise = (async () => {
    const candidates =
      currentEngine === 'lite'
        ? ['/stockfish/stockfish-18-lite-single.js', '/stockfish/stockfish.wasm.js', '/stockfish/stockfish.js']
        : currentEngine === 'wasm'
          ? ['/stockfish/stockfish.wasm.js', '/stockfish/stockfish.js', '/stockfish/stockfish-18-lite-single.js']
          : ['/stockfish/stockfish.js', '/stockfish/stockfish.wasm.js', '/stockfish/stockfish-18-lite-single.js'];
    for (const url of candidates) {
      try {
        const w = await tryCreate(url, 8000);
        worker = w;
        ready = true;
        initializing = false;
        recoveryRetryCount = 0; // Başarıyla açılırsa sıfırla
        log('Initialized with', url);
        emitReady();
        // Bekleyen analiz varsa başlat
        if (pendingFen) {
          const f = pendingFen;
          pendingFen = null;
          startAnalysis(f);
        }
        return true;
      } catch (err) {
        console.warn('[AnalysisEngine]', (err as Error).message);
      }
    }
    initializing = false;
    emitError('Motor yüklenemedi');
    return false;
  })();
  return initPromise;
}

export function startAnalysis(fen: string, force = false): void {
  const trimmed = fen.trim();
  if (!isValidFen(trimmed)) return;

  if (!force && trimmed === lastFen && (analysisRunning || pendingFen === trimmed)) {
    return;
  }

  const seq = ++analysisSeq;

  if (analysisDebounceTimer) {
    clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = null;
  }

  if (trimmed !== lastFen) {
    pvLines = new Array(currentNumPv).fill(null);
    emitLines();
    emitDepth(0);
  }

  lastFen = trimmed;

  if (!worker || !ready) {
    pendingFen = trimmed;
    if (!initializing) void initAnalysis();
    return;
  }

  analysisDebounceTimer = setTimeout(() => {
    analysisDebounceTimer = null;
    if (seq !== analysisSeq) return;

    if (!worker || !ready) {
      pendingFen = trimmed;
      return;
    }

    const begin = (targetFen: string) => {
      if (seq !== analysisSeq || !worker || !ready) return;
      doStartAnalysis(targetFen);
    };

    if (analysisRunning) {
      pendingFen = trimmed;
      if (restartScheduled) return;
      restartScheduled = true;
      clearStopWait();

      const resume = () => {
        if (seq !== analysisSeq) return;
        restartScheduled = false;
        clearStopWait();
        const f = pendingFen ?? trimmed;
        pendingFen = null;
        begin(f);
      };

      stopWaitListener = (ev: MessageEvent) => {
        for (const line of uciIncomingLines(ev.data)) {
          if (line.startsWith('bestmove ')) resume();
        }
      };
      worker.addEventListener('message', stopWaitListener);
      restartFallbackTimer = setTimeout(resume, 600);

      try {
        worker.postMessage('stop');
        analysisRunning = false;
      } catch (e) {
        log('Stop message failed:', e);
        resume();
      }
      return;
    }

    begin(trimmed);
  }, 180);
}

export function stopAnalysis(): void {
  analysisSeq += 1;
  if (analysisDebounceTimer) {
    clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = null;
  }
  clearStopWait();
  pendingFen = null;
  if (!worker) return;
  if (analysisRunning) {
    try { worker.postMessage('stop'); } catch {}
    analysisRunning = false;
  }
}

function resetEngineState(): void {
  clearStopWait();
  analysisSeq += 1;
  try { worker?.terminate(); } catch {}
  worker = null;
  ready = false;
  initializing = false;
  initPromise = null;
  analysisRunning = false;
  pendingFen = null;
  // pvLines / listeners kalsın; yeni worker gelince tekrar dolacak
}

export function setEngineOptions(opts: { numPv?: number; threads?: number; hash?: number; engine?: EngineVariant }): void {
  let changed = false;
  let engineChanged = false;
  if (opts.numPv != null && opts.numPv !== currentNumPv) {
    currentNumPv = opts.numPv;
    changed = true;
  }
  if (opts.threads != null && opts.threads !== currentThreads) {
    currentThreads = opts.threads;
    changed = true;
  }
  if (opts.hash != null && opts.hash !== currentHash) {
    currentHash = opts.hash;
    changed = true;
  }
  if (opts.engine != null && opts.engine !== currentEngine) {
    currentEngine = opts.engine;
    engineChanged = true;
  }

  if (engineChanged) {
    const fenToResume = lastFen;
    resetEngineState();
    emitError('Motor yeniden başlatılıyor...');
    void initAnalysis().then((ok) => {
      if (ok) {
        emitReady();
        if (fenToResume) startAnalysis(fenToResume, true);
      }
    });
    return;
  }

  if (changed && worker && ready && lastFen) {
    // Yeni ayarlarla yeniden başlat
    setTimeout(() => { if (lastFen) startAnalysis(lastFen, true); }, 30);
  }
}

export function subscribeAnalysis(l: Listener): () => void {
  listeners.add(l);
  // Mevcut durumu hemen gönder
  if (l.onLines) l.onLines([...pvLines]);
  if (ready && l.onReady) l.onReady();
  return () => { listeners.delete(l); };
}

export function isAnalysisReady(): boolean {
  return ready;
}

export function isAnalysisInitializing(): boolean {
  return initializing;
}
