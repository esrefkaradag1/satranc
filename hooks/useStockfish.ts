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
  const pendingFenRef = useRef<string | null>(null);
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
        setPvLines(lines.map((l) => l));
        const visible = lines.filter((l): l is PvLine => l !== null);
        if (visible.length > 0) {
          const maxD = visible.reduce((m, l) => Math.max(m, l.depth), 0);
          if (maxD > 0) setDepth(maxD);
        }
      },
      onDepth: (d) => setDepth(d),
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
    setPvLines((prev) => (prev.length ? prev.map(() => null) : prev));
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
    analyseFen,
    stop,
    sendCommand,
  };
}
