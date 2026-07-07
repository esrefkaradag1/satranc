import { trainingNotifyHandler } from '../lib/trainingWhatsAppNotify.mjs';

type Req = {
  method?: string;
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca POST' });
    return;
  }
  try {
    const result = await trainingNotifyHandler(parseBody(req), process.env);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
}
