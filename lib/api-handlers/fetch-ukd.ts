import { fetchUkdFromTsfServer } from '../tsfUkdFetch';

type Req = {
  method?: string;
  body?: { tc?: string; soyad?: string };
};
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
  setHeader(name: string, value: string): void;
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body ?? {};
    const result = await fetchUkdFromTsfServer({
      tc: body.tc,
      soyad: body.soyad,
    });
    if ('error' in result && result.error === 'Kayıt bulunamadı') {
      res.status(200).json(result);
      return;
    }
    if ('error' in result) {
      res.status(result.error === 'tc veya soyad gerekli' || result.error.includes('11 haneli') ? 400 : 502).json(result);
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
