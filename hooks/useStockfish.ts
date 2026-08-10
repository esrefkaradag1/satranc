import { useEffect, useRef, useState, useCallback } from 'react';
import {
  initAnalysis,
  startAnalysis,
  stopAnalysis,
  setEngineOptions,
  subscribeAnalysis,
  isAnalysisReady,
  type PvLine as ServicePvLine,
} from '../services/analysisService';

export type PvLine = ServicePvLine;

function pvLinesEqual(a: (PvLine | null)[], b: (PvLine | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (!x || !y) return false;
    if (
      x.multipv !== y.multipv
      || x.depth !== y.depth
      || x.score !== y.score
      || x.mate !== y.mate
      || x.nodes !== y.nodes
      || x.nps !== y.nps
      || x.pv.length !== y.pv.length
    ) {
      return false;
    }
    for (let j = 0; j < x.pv.length; j++) {
      if (x.pv[j] !== y.pv[j]) return false;
    }
  }
  return true;
}

interface UseStockfishOptions {
  numPv?: number;
  enabled?: boolean;
  threads?: number;
  hash?: number;
  engine?: 'lite' | 'wasm' | 'js';
}

interface UseStockfishReturn {
  ready: boolean;
  loading: boolean;
  error: string | null;
  pvLines: (PvLine | null)[];
  depth: number;
  /** Son `analyseFen` çağrısındaki FEN (eski motor satırlarını ayırt etmek için) */
  analysisFen: string | null;
  analyseFen: (fen: string) => void;
  stop: () => void;
  sendCommand: (cmd: string) => void;
}

/**
 * Lichess-vari MultiPV analiz hook'u.
 * Tüm bileşenler tek bir paylaşılan analysisService worker'ı üzerinden çalışır.
 */
export function useStockfish({ numPv = 3, enabled = true, threads = 1, hash = 16, engine = 'lite' }: UseStockfishOptions = {}): UseStockfishReturn {
  const [ready, setReady] = useState<boolean>(() => isAnalysisReady());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pvLines, setPvLines] = useState<(PvLine | null)[]>([]);
  const [depth, setDepth] = useState<number>(0);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const pendingFenRef = useRef<string | null>(null);
  const pvLinesRef = useRef<(PvLine | null)[]>([]);
  const depthRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    setEngineOptions({ numPv, threads, hash, engine });
  }, [numPv, threads, hash, engine]);

  useEffect(() => {
    if (!enabled) return;

    setLoading(!isAnalysisReady());
    setError(null);

    const unsub = subscribeAnalysis({
      onLines: (lines) => {
        // Diziyi multipv indeksine göre koru (sıkıştırma yapma); EngineAnalysis pvLines[i] = multipv i+1
        const next = lines.map((l) => l);
        if (!pvLinesEqual(pvLinesRef.current, next)) {
          pvLinesRef.current = next;
          setPvLines(next);
        }
        const visible = next.filter((l): l is PvLine => l !== null);
        if (visible.length > 0) {
          const maxD = visible.reduce((m, l) => Math.max(m, l.depth), 0);
          if (maxD > 0 && maxD !== depthRef.current) {
            depthRef.current = maxD;
            setDepth(maxD);
          }
        }
      },
      onDepth: (d) => {
        if (d === depthRef.current) return;
        depthRef.current = d;
        setDepth(d);
      },
      onReady: () => {
        setReady(true);
        setLoading(false);
        if (pendingFenRef.current) {
          const f = pendingFenRef.current;
          pendingFenRef.current = null;
          startAnalysis(f);
        }
      },
      onError: (msg) => {
        setError(msg);
        setLoading(false);
      },
    });

    // Motoru başlat
    void initAnalysis().then((ok) => {
      if (ok) {
        setReady(true);
        setLoading(false);
        if (pendingFenRef.current) {
          const f = pendingFenRef.current;
          pendingFenRef.current = null;
          startAnalysis(f);
        }
      }
    });

    return () => {
      unsub();
    };
  }, [enabled]);

  const analyseFen = useCallback((fen: string) => {
    if (!enabledRef.current) return;
    const trimmed = fen.trim();
    if (!trimmed) return;
    setAnalysisFen(trimmed);
    const cleared = pvLinesRef.current.length ? pvLinesRef.current.map(() => null) : pvLinesRef.current;
    if (cleared.length > 0) {
      pvLinesRef.current = cleared;
      setPvLines(cleared);
    }
    depthRef.current = 0;
    setDepth(0);
    if (!isAnalysisReady()) {
      pendingFenRef.current = trimmed;
      void initAnalysis();
      return;
    }
    startAnalysis(trimmed, true);
  }, []);

  const stop = useCallback(() => {
    stopAnalysis();
  }, []);

  const sendCommand = useCallback(() => {
    // Paylaşılan servis modelinde doğrudan UCI komutu yollamak çakışmaya yol açar.
    // Geriye dönük uyumluluk için no-op tutuyoruz.
  }, []);

  return {
    ready,
    loading,
    error,
    pvLines,
    depth,
    analysisFen,
    analyseFen,
    stop,
    sendCommand,
  };
}
