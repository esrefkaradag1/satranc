import { clearStudentLichessOAuth } from '../lichessOAuthServer';

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
    res.status(405).json({ error: 'Yalnızca POST desteklenir' });
    return;
  }

  const studentId = String(parseBody(req).studentId ?? '').trim();
  if (!studentId) {
    res.status(400).json({ error: 'studentId gerekli' });
    return;
  }

  const result = await clearStudentLichessOAuth(studentId);
  if (!result.ok) {
    res.status(500).json({ error: result.error || 'Bağlantı kaldırılamadı' });
    return;
  }

  res.status(200).json({ ok: true });
}
