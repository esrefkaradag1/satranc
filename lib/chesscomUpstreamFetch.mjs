const DEFAULT_TIMEOUT_MS = 15000;

function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer.unref === 'function') timer.unref();
  return controller.signal;
}

/** Chess.com upstream istekleri — zaman aşımı ve tutarlı User-Agent. */
export async function fetchChessComUpstream(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const signal = init.signal ?? createTimeoutSignal(timeoutMs);
  return fetch(url, {
    ...init,
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'NetChessAcademy/1.0',
      ...(init.headers ?? {}),
    },
  });
}
