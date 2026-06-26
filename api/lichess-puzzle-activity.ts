import {
  fetchLichessPuzzleActivityForDay,
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
  const day = queryParam(req.query, 'day') || new Date().toISOString().slice(0, 10);
  const maxRaw = queryParam(req.query, 'max');
  const max = maxRaw ? Number(maxRaw) : undefined;

  if (!studentId) {
    res.status(400).json({ error: 'studentId gerekli' });
    return;
  }

  const token = await getStudentLichessToken(studentId);
  if (!token) {
    res.status(200).json({ error: 'Lichess hesabı bağlı değil', connected: false, puzzles: [] });
    return;
  }

  try {
    const puzzles = await fetchLichessPuzzleActivityForDay({ token, dayIso: day, max });
    res.status(200).json({ connected: true, puzzles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulmaca geçmişi alınamadı';
    res.status(502).json({ error: msg, connected: true, puzzles: [] });
  }
}
