/** Evolution API v2 uyumlu WhatsApp sunucu işlemleri */

function trimSlash(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

function resolveConfig(body = {}, env = {}) {
  const fromEnv = {
    apiBaseUrl: trimSlash(env.WHATSAPP_API_BASE_URL || env.VITE_WHATSAPP_API_BASE_URL),
    apiKey: String(env.WHATSAPP_API_KEY || env.VITE_WHATSAPP_API_KEY || '').trim(),
    instanceName: String(env.WHATSAPP_INSTANCE || env.VITE_WHATSAPP_INSTANCE || 'netchess').trim(),
    enabled: Boolean(env.WHATSAPP_API_BASE_URL || env.VITE_WHATSAPP_API_BASE_URL),
  };
  const fromBody = body.config && typeof body.config === 'object' ? body.config : {};
  return {
    apiBaseUrl: trimSlash(fromBody.apiBaseUrl) || fromEnv.apiBaseUrl,
    apiKey: String(fromBody.apiKey ?? fromEnv.apiKey).trim(),
    instanceName: String(fromBody.instanceName ?? (fromEnv.instanceName || 'netchess')).trim(),
    enabled: fromBody.enabled ?? fromEnv.enabled,
  };
}

function toDigits(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  else if (!d.startsWith('90') && d.length >= 10) d = `90${d}`;
  return d;
}

async function evolutionFetch(config, path, options = {}) {
  const base = trimSlash(config.apiBaseUrl);
  if (!base) throw new Error('WhatsApp API adresi tanımlı değil');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { apikey: config.apiKey } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText;
    throw new Error(typeof msg === 'string' ? msg : 'WhatsApp API hatası');
  }
  return data;
}

export async function whatsappConnectionStatus(config) {
  const inst = config.instanceName || 'netchess';
  try {
    const data = await evolutionFetch(config, `/instance/connectionState/${encodeURIComponent(inst)}`);
    const state = data?.instance?.state || data?.state || data?.status || '';
    const connected = ['open', 'connected'].includes(String(state).toLowerCase());
    return { ok: true, connected, state: String(state) };
  } catch (e) {
    return { ok: false, connected: false, state: 'disconnected', error: e instanceof Error ? e.message : 'Bağlantı hatası' };
  }
}

export async function whatsappFetchQr(config) {
  const inst = config.instanceName || 'netchess';
  const data = await evolutionFetch(config, `/instance/connect/${encodeURIComponent(inst)}`);
  const base64 = data?.base64 || data?.qrcode?.base64 || data?.code || '';
  return { base64: typeof base64 === 'string' ? base64 : '' };
}

export async function whatsappSendText(config, phone, message) {
  const inst = config.instanceName || 'netchess';
  const number = toDigits(phone);
  await evolutionFetch(config, `/message/sendText/${encodeURIComponent(inst)}`, {
    method: 'POST',
    body: { number, text: message },
  });
  return { ok: true };
}

export async function whatsappApiHandler(method, url, body, env) {
  const parsed = new URL(url || 'http://local', 'http://local');
  const action = parsed.searchParams.get('action') || body?.action || 'status';
  const config = resolveConfig(body, env);

  if (action === 'status') {
    if (!config.apiBaseUrl) {
      return { status: 200, body: { connected: false, state: 'pasif', apiConfigured: false } };
    }
    const status = await whatsappConnectionStatus(config);
    return { status: 200, body: { ...status, apiConfigured: true } };
  }

  if (action === 'qr') {
    if (!config.apiBaseUrl) {
      return { status: 400, body: { error: 'API adresi tanımlı değil' } };
    }
    const qr = await whatsappFetchQr(config);
    return { status: 200, body: qr };
  }

  if (action === 'send') {
    const phone = String(body?.phone ?? '').trim();
    const message = String(body?.message ?? '').trim();
    if (!phone || !message) {
      return { status: 400, body: { error: 'Telefon ve mesaj zorunlu' } };
    }
    if (!config.apiBaseUrl || !config.enabled) {
      return { status: 200, body: { ok: false, mode: 'manual', phone, message } };
    }
    try {
      await whatsappSendText(config, phone, message);
      return { status: 200, body: { ok: true, mode: 'api' } };
    } catch (e) {
      return {
        status: 200,
        body: { ok: false, mode: 'failed', error: e instanceof Error ? e.message : 'Gönderilemedi' },
      };
    }
  }

  if (action === 'send-bulk') {
    const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
    const delayMs = Number(body?.delayMs) || 1500;
    const results = [];
    for (const r of recipients) {
      const phone = String(r?.phone ?? '').trim();
      const message = String(r?.message ?? '').trim();
      if (!phone || !message) continue;
      if (!config.apiBaseUrl || !config.enabled) {
        results.push({ phone, ok: false, mode: 'manual' });
        continue;
      }
      try {
        await whatsappSendText(config, phone, message);
        results.push({ phone, ok: true, mode: 'api' });
      } catch (e) {
        results.push({
          phone,
          ok: false,
          mode: 'failed',
          error: e instanceof Error ? e.message : 'Hata',
        });
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    return { status: 200, body: { results } };
  }

  return { status: 400, body: { error: 'Geçersiz action' } };
}

export async function whatsappApiGetHandler(url, env) {
  return whatsappApiHandler('GET', url, {}, env);
}

export async function whatsappApiPostHandler(body, env) {
  return whatsappApiHandler('POST', 'http://local', body, env);
}
