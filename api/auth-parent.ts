import { parentStudentLoginViaEnv } from '../lib/studentParentAuth.mjs';

type Req = {
  method?: string;
  body?: { phoneOrStudentId?: string; pin?: string };
};
type Res = {
  status(code: number): { json(body: unknown): void; end(): void };
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const result = await parentStudentLoginViaEnv(req.body ?? {}, process.env as Record<string, string>);
  res.status(result.status).json(result.body);
}
