import { createClient } from '@supabase/supabase-js';
import {
  fetchSiteMessages,
  insertSiteMessageViaEnv,
  normalizeSiteMessageBody,
} from '../siteMessagesDb.mjs';

type Req = {
  method?: string;
  url?: string;
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

function conversationIdFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url, 'http://local');
    return String(parsed.searchParams.get('conversationId') ?? '').trim();
  } catch {
    return '';
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') {
    const conversationId = conversationIdFromUrl(req.url);
    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
    const serviceKey = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
    const key = serviceKey || anonKey;

    if (!supabaseUrl || !key) {
      res.status(503).json({ error: 'Sunucu yapılandırması eksik', messages: [] });
      return;
    }

    const sb = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await fetchSiteMessages(sb, conversationId || undefined);
    if (!result.ok) {
      res.status(result.missingTable ? 503 : 500).json({
        error: result.error,
        missingTable: !!result.missingTable,
        messages: [],
      });
      return;
    }
    res.status(200).json({ messages: result.messages });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca GET ve POST desteklenir' });
    return;
  }

  const normalized = normalizeSiteMessageBody(parseBody(req));
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const result = await insertSiteMessageViaEnv({ message: normalized.record }, process.env);
  res.status(result.status).json(result.body);
}
