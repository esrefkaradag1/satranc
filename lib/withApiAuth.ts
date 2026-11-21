import { authorizeApiRequest } from './apiAuth.mjs';

/**
 * Vercel uç noktalarını (api/*.ts) ortak kimlik doğrulamasıyla sarar — Faz 2b.
 * Kural tablosu ve doğrulama lib/apiAuth.mjs'te (Docker ve geliştirme sunucusuyla aynı).
 */
// biome-ignore lint/suspicious/noExplicitAny: Vercel req/res tipleri uç noktaya göre değişiyor
type AnyHandler = (req: any, res: any) => unknown;

function parseBody(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function normalizeQuery(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
  }
  return out;
}

export function withApiAuth(route: string, handler: AnyHandler): AnyHandler {
  // biome-ignore lint/suspicious/noExplicitAny: bkz. AnyHandler
  return async (req: any, res: any) => {
    const denied = authorizeApiRequest({
      route,
      method: String(req?.method ?? 'GET'),
      headers: req?.headers ?? {},
      query: normalizeQuery(req?.query),
      body: parseBody(req?.body),
      env: process.env,
    });
    if (denied) {
      res.status(denied.status).json(denied.body);
      return;
    }
    return handler(req, res);
  };
}
