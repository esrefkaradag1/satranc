import { useEffect, useState } from 'react';

export function useDashboard3DEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setEnabled(false);
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setEnabled(!!gl);
    } catch {
      setEnabled(false);
    }
  }, []);

  return enabled;
}
