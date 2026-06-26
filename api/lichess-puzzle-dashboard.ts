import {
  fetchLichessPuzzleDashboard,
  getStudentLichessToken,
} from '../lib/lichessOAuthServer';

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
  const daysRaw = queryParam(req.query, 'days');
  const days = daysRaw ? Number(daysRaw) : 30;

  if (!studentId) {
    res.status(400).json({ error: 'studentId gerekli' });
    return;
  }

  const token = await getStudentLichessToken(studentId);
  if (!token) {
    res.status(200).json({ error: 'Lichess hesabı bağlı değil', connected: false });
    return;
  }

  try {
    const dashboard = await fetchLichessPuzzleDashboard({ token, days });
    res.status(200).json({ connected: true, dashboard });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulmaca özeti alınamadı';
    res.status(502).json({ error: msg, connected: true });
  }
}
