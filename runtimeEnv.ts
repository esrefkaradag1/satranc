declare global {
  interface Window {
    __RUNTIME_ENV__?: Record<string, string | undefined>;
  }
}

export function getRuntimeEnv(name: string): string {
  try {
    const fromWindow =
      typeof window !== 'undefined' ? window.__RUNTIME_ENV__?.[name] : undefined;
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim();
    }

    const fromVite = (import.meta.env as Record<string, string | undefined>)?.[name];
    if (typeof fromVite === 'string' && fromVite.trim()) {
      return fromVite.trim();
    }
  } catch {
    // ignore
  }
  return '';
}
