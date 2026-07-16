/**
 * Vercel Hobby: günde tek cron. 23:00 TR (20:00 UTC) —
 * 1) Platform gün sonu senkronu (Lichess/Chess.com → DB)
 * 2) Antrenman eksik WhatsApp bildirimi
 */

import { runPlatformDaySync } from '../lib/api-handlers/platform-day-sync';
import { trainingNotifyHandler } from '../lib/trainingWhatsAppNotify.mjs';

type Req = {
  method?: string;
  url?: string;
  body?: string | Record<string, unknown>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
};

type Res = {
  status(code: number): { json(body: unknown): void };
};

function headerValue(req: Req, name: string): string {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

function cronAuthorized(req: Req): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return true;
  return headerValue(req, 'authorization') === `Bearer ${secret}`;
}

export const config = { maxDuration: 300 };

export default async function handler(req: Req, res: Res) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.status(405).json({ error: 'Yalnızca GET veya POST' });
    return;
  }
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: 'Yetkisiz' });
    return;
  }

  try {
    const platform = await runPlatformDaySync(process.env);
    const training = await trainingNotifyHandler({ mode: 'evening' }, process.env);
    res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      platform,
      training: training.body,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası' });
  }
}
