import {
  fetchLichessPuzzleNext,
  getStudentLichessToken,
} from '../lichessOAuthServer';

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
  const difficulty = queryParam(req.query, 'difficulty');
  const angle = queryParam(req.query, 'angle');
  const color = queryParam(req.query, 'color');

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
    const puzzle = await fetchLichessPuzzleNext({ token, difficulty, angle, color });
    if (!puzzle) {
      res.status(404).json({ connected: true, error: 'Bulmaca alınamadı' });
      return;
    }
    res.status(200).json({ connected: true, puzzle });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sıradaki bulmaca alınamadı';
    res.status(502).json({ error: msg, connected: true });
  }
}
