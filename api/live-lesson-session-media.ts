import { createClient } from '@supabase/supabase-js';
import {
  normalizeSessionMediaOpBody,
  replaceSessionMediaPreservingHands,
  runSessionMediaOp,
} from '../lib/liveLessonSessionMediaDb.mjs';

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

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({ error: 'Sunucu yapılandırması eksik' });
    return;
  }

  const body = parseBody(req);
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.replace === true) {
    const roomId = String(body.roomId ?? '').trim();
    const sessionMedia = body.sessionMedia;
    if (!roomId || !sessionMedia || typeof sessionMedia !== 'object') {
      res.status(400).json({ error: 'roomId ve sessionMedia gerekli' });
      return;
    }
    const result = await replaceSessionMediaPreservingHands(sb, roomId, sessionMedia);
    if (!result.ok) {
      res.status(result.status ?? 500).json({
        error: result.error || 'Güncellenemedi',
        missingColumn: !!result.missingColumn,
      });
      return;
    }
    res.status(200).json({ ok: true, sessionMedia: result.sessionMedia });
    return;
  }

  const normalized = normalizeSessionMediaOpBody(body);
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const result = await runSessionMediaOp(sb, normalized.record);
  if (!result.ok) {
    res.status(result.status ?? 500).json({
      error: result.error || 'İşlem başarısız',
      missingColumn: !!result.missingColumn,
    });
    return;
  }

  res.status(200).json({ ok: true, sessionMedia: result.sessionMedia });
}
