import { getStudentLichessOAuthStatus } from '../lib/lichessOAuthServer';

type Req = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
};

function queryParam(q: Record<string, string | string[] | undefined>, key: string): string {
  const raw = q[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Yalnızca GET desteklenir' });
    return;
  }

  const studentId = queryParam(req.query, 'studentId');
  if (!studentId) {
    res.status(400).json({ error: 'studentId gerekli' });
    return;
  }

  const status = await getStudentLichessOAuthStatus(studentId);
  res.status(200).json(status);
}
