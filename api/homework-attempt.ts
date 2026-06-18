import { createClient } from '@supabase/supabase-js';
import { insertHomeworkAttemptSupabase, normalizeHomeworkAttemptBody } from '../lib/homeworkAttemptDb.mjs';

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

  const normalized = normalizeHomeworkAttemptBody(parseBody(req));
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await insertHomeworkAttemptSupabase(sb, normalized.record);
  if (!result.ok) {
    res.status(500).json({ error: result.error || 'Kayıt hatası' });
    return;
  }

  res.status(200).json({ ok: true, id: normalized.record.id });
}
