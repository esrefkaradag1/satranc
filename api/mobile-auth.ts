import { mobileAuthHandler } from '../lib/mobileAuth.mjs';

type Req = { method?: string; body?: Record<string, unknown> };
type Res = { status(code: number): { json(body: unknown): void } };

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const result = await mobileAuthHandler(req.body ?? {}, process.env as Record<string, string>);
  res.status(result.status).json(result.body);
}
