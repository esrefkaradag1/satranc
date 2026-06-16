import { useCallback, useEffect, useState } from 'react';

export type BoardViewMode = '2d' | '3d';

const STORAGE_KEY = 'netchess_board_view_mode';

export function useBoardViewMode(): [BoardViewMode, (mode: BoardViewMode) => void] {
  const [mode, setModeState] = useState<BoardViewMode>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '3d' ? '3d' : '2d';
    } catch {
      return '2d';
    }
  });

  const setMode = useCallback((next: BoardViewMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  return [mode, setMode];
}
