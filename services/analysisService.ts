/**
 * Stockfish — Sürekli MultiPV Analiz için ayrı Web Worker.
 * EngineAnalysis bileşeni Lichess tarzı çoklu varyant analizi için bunu kullanır.
 * stockfishService (best move / eval) ile çakışmasın diye bağımsız bir worker kullanır.
 */

import { buildTerminalPvLines, getTerminalEval } from '../lib/analysisTerminal';
import { stockfishWorkerUrl, STOCKFISH_ANALYSIS_CANDIDATES } from '../lib/stockfishWorkerUrl';

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
let stopInFlight = false;

// Debounce ve Retry yönetimi
let analysisDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let restartFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let stopWaitListener: ((ev: MessageEvent) => void) | null = null;
let analysisGeneration = 0;
let recoveryRetryCount = 0;
const MAX_RECOVERY_RETRIES = 3;
let subscriberCount = 0;
let lastMainLineDepth = 0;
let lastMainLineUpdateMs = 0;
let activeEngineScript = '';

function usesLegacyDepthSearch(): boolean {
  // Eski stockfish.js (2019): go infinite info satırı vermez
  return activeEngineScript.endsWith('/stockfish.js') || activeEngineScript.endsWith('stockfish.js');
}

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
        if (idx === 0) {
          lastMainLineDepth = parsed.depth;
          lastMainLineUpdateMs = Date.now();
        }
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
    const moveToken = line.slice(9).trim().split(/\s+/)[0] ?? '';
    if ((moveToken === '(none)' || !moveToken) && lastFen && pvLines.every((l) => l === null)) {
      const terminal = getTerminalEval(lastFen);
      if (terminal) {
        applyTerminalAnalysis(terminal);
      }
    }
    if (usesLegacyDepthSearch() && lastFen && subscriberCount > 0 && worker && ready) {
      // Eski stockfish.js: go infinite info vermez; depth/movetime ile yeniden tara
      worker.postMessage(`position fen ${lastFen}`);
      worker.postMessage('go depth 18');
      analysisRunning = true;
      return;
    }
    analysisRunning = false;
    stopInFlight = false;
  }
}

function applyTerminalAnalysis(terminal: NonNullable<ReturnType<typeof getTerminalEval>>): void {
  pvLines = buildTerminalPvLines(terminal, currentNumPv);
  lastMainLineDepth = 1;
  lastMainLineUpdateMs = Date.now();
  emitLines();
  emitDepth(1);
}

function stopEngineAndWait(): Promise<void> {
  if (!worker || !analysisRunning) {
    analysisRunning = false;
    stopInFlight = false;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearStopWait();
      analysisRunning = false;
      stopInFlight = false;
      resolve();
    };

    stopInFlight = true;
    restartScheduled = true;
    stopWaitListener = (ev: MessageEvent) => {
      for (const ln of uciIncomingLines(ev.data)) {
        if (ln.startsWith('bestmove ')) finish();
      }
    };
    worker!.addEventListener('message', stopWaitListener);
    restartFallbackTimer = setTimeout(finish, 3000);

    try {
      worker!.postMessage('stop');
    } catch {
      finish();
    }
  });
}

async function runAnalysis(generation: number): Promise<void> {
  if (generation !== analysisGeneration) return;
  const fen = lastFen;
  if (!fen || !worker || !ready) return;

  const terminal = getTerminalEval(fen);
  if (terminal) {
    if (analysisRunning) {
      try { worker.postMessage('stop'); } catch { /* ignore */ }
      analysisRunning = false;
      stopInFlight = false;
      clearStopWait();
    }
    applyTerminalAnalysis(terminal);
    return;
  }

  if (analysisRunning || stopInFlight) {
    await stopEngineAndWait();
    if (generation !== analysisGeneration) return;
  }

  if (!worker || !ready) return;
  await doStartAnalysis(fen);
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

async function applyEngineOptions(): Promise<void> {
  if (!worker || !ready) return;
  // 2019 wasm/js: Threads zaten 1 (min=max=1); setoption Threads motoru kilitler
  if (currentHash !== 16) {
    try { worker.postMessage(`setoption name Hash value ${currentHash}`); } catch {}
  }
  try { worker.postMessage(`setoption name MultiPV value ${currentNumPv}`); } catch {}
  await waitReady(3000);
}

async function doStartAnalysis(fen: string): Promise<void> {
  if (!worker || !ready) return;

  if (analysisRunning) {
    await stopEngineAndWait();
    await waitReady(2000);
  }

  pvLines = new Array(currentNumPv).fill(null);
  lastMainLineDepth = 0;
  lastMainLineUpdateMs = 0;
  emitLines();
  emitDepth(0);

  log('Starting analysis fen=', fen, 'numPv=', currentNumPv);
  worker.postMessage(`position fen ${fen}`);
  worker.postMessage(usesLegacyDepthSearch() ? 'go depth 18' : 'go infinite');
  analysisRunning = true;
}

function tryCreate(url: string, timeoutMs = 12000): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const workerUrl = stockfishWorkerUrl(url);
    log('Trying worker at', workerUrl);
    let w: Worker;
    try {
      w = new Worker(workerUrl);
    } catch (e) {
      reject(new Error(`new Worker(${workerUrl}) failed: ${(e as Error).message}`));
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
          analysisGeneration += 1;

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
        ? [...STOCKFISH_ANALYSIS_CANDIDATES]
        : currentEngine === 'wasm'
          ? ['/stockfish/stockfish.wasm.js', ...STOCKFISH_ANALYSIS_CANDIDATES]
          : [...STOCKFISH_ANALYSIS_CANDIDATES];
    for (const url of candidates) {
      try {
        const timeout = url.includes('lite') ? 25000 : 15000;
        const w = await tryCreate(url, timeout);
        worker = w;
        activeEngineScript = url;
        ready = true;
        initializing = false;
        recoveryRetryCount = 0;
        await applyEngineOptions();
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

  const filledLines = pvLines.filter((l): l is PvLine => l !== null).length;
  const staleMs = lastMainLineUpdateMs > 0 ? Date.now() - lastMainLineUpdateMs : Infinity;
  if (
    !force
    && trimmed === lastFen
    && analysisRunning
    && filledLines > 0
    && staleMs < 4000
  ) {
    return;
  }

  const generation = ++analysisGeneration;
  pendingFen = trimmed;

  if (trimmed !== lastFen) {
    pvLines = new Array(currentNumPv).fill(null);
    lastMainLineDepth = 0;
    lastMainLineUpdateMs = 0;
    emitLines();
    emitDepth(0);
  }

  lastFen = trimmed;

  if (!worker || !ready) {
    if (!initializing) void initAnalysis();
    return;
  }

  if (analysisDebounceTimer) {
    clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = null;
  }

  analysisDebounceTimer = setTimeout(() => {
    analysisDebounceTimer = null;
    void runAnalysis(generation);
  }, 120);
}

export function stopAnalysis(force = false): void {
  if (!force && subscriberCount > 0) return;
  analysisGeneration += 1;
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
  analysisGeneration += 1;
  try { worker?.terminate(); } catch {}
  worker = null;
  activeEngineScript = '';
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

  if (changed && worker && ready) {
    void applyEngineOptions().then(() => {
      if (lastFen) startAnalysis(lastFen, true);
    });
  }
}

export function subscribeAnalysis(l: Listener): () => void {
  subscriberCount += 1;
  listeners.add(l);
  // Mevcut durumu hemen gönder
  if (l.onLines) l.onLines([...pvLines]);
  if (ready && l.onReady) l.onReady();
  return () => {
    listeners.delete(l);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) stopAnalysis(true);
  };
}

export function getAnalysisHealth(): {
  ready: boolean;
  running: boolean;
  depth: number;
  filledLines: number;
  numPv: number;
  lastUpdateMs: number;
  recoveryRetries: number;
} {
  const filledLines = pvLines.filter((l): l is PvLine => l !== null).length;
  const maxD = pvLines.reduce((m, l) => (l ? Math.max(m, l.depth) : m), 0);
  return {
    ready,
    running: analysisRunning,
    depth: maxD,
    filledLines,
    numPv: currentNumPv,
    lastUpdateMs: lastMainLineUpdateMs,
    recoveryRetries: recoveryRetryCount,
  };
}

export function isAnalysisReady(): boolean {
  return ready;
}

export function isAnalysisInitializing(): boolean {
  return initializing;
}
