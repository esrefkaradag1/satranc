/**
 * Stockfish — tarayıcıda stockfish.js Worker ile UCI
 * Bulmaca / çalışma alanında en iyi hamle ve değerlendirme için kullanılır.
 */

import { stockfishWorkerUrl, STOCKFISH_MOVE_CANDIDATES } from '../lib/stockfishWorkerUrl';

let worker: Worker | null = null;
let ready = false;
let initializing = false;
let pending: { resolve: (value: string | null) => void; reject: (e: Error) => void } | null = null;
let lastScore: number = 0;

export interface PvLine {
  multipv: number;
  depth: number;
  score: number;
  mate: number | null;
  pv: string[];
  nodes: number;
  nps: number;
}

let multiPvLines: PvLine[] = [];
let multiPvCallback: ((lines: PvLine[]) => void) | null = null;
let currentMultiPv = 1;
let analysisRunning = false;
let readyResolve: (() => void) | null = null;

function log(...args: unknown[]) {
  console.log('[Stockfish]', ...args);
}

function uciIncomingLines(data: unknown): string[] {
  const raw = typeof data === 'string' ? data : String(data ?? '');
  return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function parseInfoLine(line: string): PvLine | null {
  const depthMatch = line.match(/\bdepth (\d+)/);
  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)/);
  const nodesMatch = line.match(/\bnodes (\d+)/);
  const npsMatch = line.match(/\bnps (\d+)/);

  if (!depthMatch || !pvMatch) return null;

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

function handleWorkerMessage(line: string): void {
  if (line === 'uciok') {
    log('Received uciok - engine ready');
    // uciok alındığında motor hazır kabul et (readyok bekleme)
    if (!ready) {
      ready = true;
      initializing = false;
      // Varsayılan ayarları uygula
      worker?.postMessage('setoption name Threads value 1');
      worker?.postMessage('setoption name Hash value 16');
      log('Engine ready');
    }
    if (readyResolve) {
      const fn = readyResolve;
      readyResolve = null;
      fn();
    }
  }

  // readyok gelirse de kabul et (bazı versiyonlar gönderir)
  if (line === 'readyok') {
    if (!ready) {
      ready = true;
      initializing = false;
      log('Engine ready (readyok)');
    }
    if (readyResolve) {
      const fn = readyResolve;
      readyResolve = null;
      fn();
    }
  }

  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  if (cpMatch) lastScore = parseInt(cpMatch[1], 10) / 100;

  const mateMatchLine = line.match(/\bscore mate (-?\d+)/);
  if (mateMatchLine) lastScore = parseInt(mateMatchLine[1], 10) > 0 ? 100 : -100;

  if (line.startsWith('info ') && line.includes(' pv ') && multiPvCallback) {
    const pvLine = parseInfoLine(line);
    if (pvLine) {
      const idx = pvLine.multipv - 1;
      if (idx >= 0 && idx < currentMultiPv) {
        const newLines = [...multiPvLines];
        newLines[idx] = pvLine;
        multiPvLines = newLines;
        multiPvCallback(newLines);
      }
    }
  }

  if (line.startsWith('bestmove ')) {
    analysisRunning = false;
    const m = line.slice(9).split(' ')[0];
    const move = m && m !== '(none)' ? m : null;
    if (pending) {
      pending.resolve(move);
      pending = null;
    }
  }
}

let engineQueue: Promise<void> = Promise.resolve();

function runOnEngineQueue<T>(job: () => Promise<T>): Promise<T> {
  const next = engineQueue.then(() => job());
  engineQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function stopOngoingEngineWork(): Promise<void> {
  if (!worker || !ready) return;
  if (analysisRunning) {
    worker.postMessage('stop');
    analysisRunning = false;
    await waitReady();
  }
  if (pending) {
    const p = pending;
    pending = null;
    p.reject(new Error('Interrupted'));
  }
}

function tryCreateWorker(url: string): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const workerUrl = stockfishWorkerUrl(url);
    log('Trying worker at', workerUrl);
    let w: Worker;
    try {
      w = new Worker(workerUrl);
    } catch (e) {
      reject(new Error(`Worker at ${url} failed: ${(e as Error).message}`));
      return;
    }
    let settled = false;

    const timeoutMs = url.includes('lite') ? 20000 : 12000;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        w.terminate();
        reject(new Error(`Worker at ${url} did not respond in time`));
      }
    }, timeoutMs);

    w.onmessage = (e: MessageEvent<string>) => {
      for (const line of uciIncomingLines(e.data)) {
        if (!settled && line === 'uciok') {
          settled = true;
          clearTimeout(timeout);
          w.onmessage = (ev: MessageEvent<string>) => {
            for (const ln of uciIncomingLines(ev.data)) handleWorkerMessage(ln);
          };
          handleWorkerMessage(line);
          resolve(w);
          return;
        }
      }
    };

    w.onerror = (err) => {
      console.error('[Stockfish] Worker error from', url, err);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        w.terminate();
        reject(new Error(`Worker at ${url} failed`));
      } else {
        if (pending) {
          pending.reject(new Error('Stockfish worker error'));
          pending = null;
        }
        worker = null;
        ready = false;
      }
    };

    w.postMessage('uci');
  });
}

export async function initStockfish(): Promise<boolean> {
  if (ready && worker) return true;
  if (initializing) {
    return new Promise(resolve => {
      const check = setInterval(() => { if (ready) { clearInterval(check); resolve(true); } }, 100);
      setTimeout(() => { if (!ready) { clearInterval(check); resolve(false); } }, 10000);
    });
  }

  initializing = true;

  for (const url of STOCKFISH_MOVE_CANDIDATES) {
    try {
      const w = await tryCreateWorker(url);
      worker = w;
      log('Successfully initialized with', url);
      return true;
    } catch (e) {
      console.warn('[Stockfish]', (e as Error).message);
    }
  }

  initializing = false;
  console.error('[Stockfish] All worker URLs failed');
  return false;
}

export function getBestMoveFromStockfish(
  fen: string,
  movetimeMs: number,
  searchDepth?: number,
): Promise<string | null> {
  if (!worker || !ready) return Promise.resolve(null);
  const depth = searchDepth != null && searchDepth > 0 ? Math.round(searchDepth) : 0;
  const maxWait = depth > 0 ? Math.max(movetimeMs, 6000) + 800 : movetimeMs + 800;
  return runOnEngineQueue(async () => {
    await stopOngoingEngineWork();
    return new Promise<string | null>((resolve, reject) => {
      let settled = false;
      const finish = (move: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimeout);
        pending = null;
        resolve(move);
      };
      pending = {
        resolve: (move) => finish(move),
        reject: (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(hardTimeout);
          pending = null;
          reject(err);
        },
      };
      worker!.postMessage(`position fen ${fen}`);
      if (depth > 0) {
        worker!.postMessage(`go depth ${depth}`);
      } else {
        worker!.postMessage(`go movetime ${Math.max(100, movetimeMs)}`);
      }
      const hardTimeout = setTimeout(() => {
        if (!settled) worker?.postMessage('stop');
        finish(null);
      }, maxWait);
    });
  });
}

export function getEvalFromStockfish(fen: string, movetimeMs = 500): Promise<number> {
  if (!worker || !ready) return Promise.resolve(0);
  const w = worker;
  return runOnEngineQueue(async () => {
    await stopOngoingEngineWork();
    return new Promise<number>((resolve) => {
      let score = 0;
      const onMsg = (e: MessageEvent) => {
        for (const line of uciIncomingLines(e.data)) {
          const cpMatch = line.match(/\bscore cp (-?\d+)/);
          if (cpMatch) score = parseInt(cpMatch[1], 10) / 100;
          const mateMatch = line.match(/\bscore mate (-?\d+)/);
          if (mateMatch) score = parseInt(mateMatch[1], 10) > 0 ? 100 : -100;
          if (line.startsWith('bestmove ')) {
            w.removeEventListener('message', onMsg);
            resolve(score);
            return;
          }
        }
      };
      w.addEventListener('message', onMsg);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(`go movetime ${Math.max(150, movetimeMs)}`);
      setTimeout(() => {
        w.removeEventListener('message', onMsg);
        resolve(score);
      }, movetimeMs + 1800);
    });
  });
}

function waitReady(): Promise<void> {
  if (!worker) return Promise.resolve();
  return new Promise(resolve => {
    readyResolve = resolve;
    worker!.postMessage('isready');
    setTimeout(() => { if (readyResolve) { readyResolve = null; resolve(); } }, 2000);
  });
}

export async function startMultiPvAnalysis(fen: string, callback: (lines: PvLine[]) => void, numPv = 3): Promise<void> {
  if (!worker || !ready) return;

  if (analysisRunning) {
    worker.postMessage('stop');
    analysisRunning = false;
    await waitReady();
  }

  currentMultiPv = numPv;
  multiPvLines = new Array(numPv).fill(null);
  multiPvCallback = callback;

  worker.postMessage(`setoption name MultiPV value ${numPv}`);
  worker.postMessage(`position fen ${fen}`);
  worker.postMessage('go infinite');
  analysisRunning = true;
}

export function stopAnalysis(): void {
  multiPvCallback = null;
  if (worker && analysisRunning) {
    worker.postMessage('stop');
    analysisRunning = false;
  }
}

export function isStockfishReady(): boolean {
  return ready;
}

export function isStockfishLoading(): boolean {
  return initializing;
}
