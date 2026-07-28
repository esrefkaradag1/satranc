import { whatsappApiGetHandler, whatsappApiPostHandler } from '../lib/whatsappApi.mjs';

type Req = {
  method?: string;
  url?: string;
  body?: string | Record<string, unknown>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
};

function parseBody(req: Req): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: Req, res: Res) {
  try {
    const result =
      req.method === 'GET'
        ? await whatsappApiGetHandler(req.url, process.env)
        : req.method === 'POST'
          ? await whatsappApiPostHandler(parseBody(req), process.env, req.url)
          : { status: 405, body: { error: 'Yalnızca GET ve POST' } };
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
}
