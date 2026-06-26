import {
  clearStudentLichessOAuth,
  exchangeLichessOAuthCode,
  getLichessOAuthRedirectUriServer,
  saveStudentLichessOAuth,
} from '../lib/lichessOAuthServer';

type Req = {
  method?: string;
  body?: string | Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
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

function requestOrigin(req: Req): string | undefined {
  const raw = req.headers?.origin ?? req.headers?.referer;
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val) return undefined;
  try {
    return new URL(val).origin;
  } catch {
    return undefined;
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca POST desteklenir' });
    return;
  }

  const body = parseBody(req);
  const code = String(body.code ?? '').trim();
  const codeVerifier = String(body.codeVerifier ?? '').trim();
  const studentId = String(body.studentId ?? '').trim();
  const redirectUri = String(body.redirectUri ?? '').trim()
    || getLichessOAuthRedirectUriServer(requestOrigin(req));

  if (!code || !codeVerifier || !studentId) {
    res.status(400).json({ error: 'code, codeVerifier ve studentId gerekli' });
    return;
  }

  const exchanged = await exchangeLichessOAuthCode({ code, codeVerifier, redirectUri });
  if (!exchanged.ok) {
    res.status(400).json({ error: exchanged.error });
    return;
  }

  const saved = await saveStudentLichessOAuth({
    studentId,
    token: exchanged.token,
    lichessUsername: exchanged.username,
  });
  if (!saved.ok) {
    res.status(saved.missingColumn ? 503 : 500).json({
      error: saved.error || 'Token kaydedilemedi',
      missingColumn: !!saved.missingColumn,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    lichessUsername: exchanged.username ?? null,
  });
}
