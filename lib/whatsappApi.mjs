/**
 * WhatsApp API — WaMessage kişisel WP (X-Api-Key)
 * Base: https://api.toplusms.app
 * Auth: X-Api-Key: <API_KEY>  (panel → Api Entegrasyonu → API Key Göster)
 *
 * Akış:
 *  1) POST /wp/login/qr  { phone: "905…" } → qr + regId
 *  2) POST /wp/device/check { reg_id, phone }  (~30 sn bekleyebilir)
 *  3) GET  /wp/device
 *  4) POST /api/whatsapp/v1/messages/send  (form-urlencoded: reg_id, to, message, send_speed)
 *
 * Evolution API v2 hâlâ provider: 'evolution' ile desteklenir.
 */

function trimSlash(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

const WAMESSAGE_DEFAULT_BASE = 'https://api.toplusms.app';

function resolveConfig(body = {}, env = {}) {
  const fromEnv = {
    provider: String(env.WHATSAPP_PROVIDER || env.VITE_WHATSAPP_PROVIDER || 'wamessage').trim().toLowerCase(),
    apiBaseUrl: trimSlash(env.WHATSAPP_API_BASE_URL || env.VITE_WHATSAPP_API_BASE_URL),
    apiKey: String(env.WHATSAPP_API_KEY || env.VITE_WHATSAPP_API_KEY || '').trim(),
    instanceName: String(env.WHATSAPP_INSTANCE || env.VITE_WHATSAPP_INSTANCE || '').trim(),
    devicePhone: String(env.WHATSAPP_DEVICE_PHONE || env.VITE_WHATSAPP_DEVICE_PHONE || '').trim(),
    enabled: Boolean(
      env.WHATSAPP_API_KEY ||
      env.VITE_WHATSAPP_API_KEY ||
      env.WHATSAPP_API_BASE_URL ||
      env.VITE_WHATSAPP_API_BASE_URL,
    ),
  };
  const fromBody = body.config && typeof body.config === 'object' ? body.config : {};
  const provider = String(fromBody.provider ?? fromEnv.provider ?? 'wamessage').toLowerCase();
  const defaultBase = provider === 'wamessage' ? WAMESSAGE_DEFAULT_BASE : '';
  return {
    provider: provider === 'evolution' ? 'evolution' : 'wamessage',
    apiBaseUrl: trimSlash(fromBody.apiBaseUrl) || fromEnv.apiBaseUrl || defaultBase,
    apiKey: String(fromBody.apiKey ?? fromEnv.apiKey ?? '').trim(),
    instanceName: String(fromBody.instanceName ?? fromEnv.instanceName ?? '').trim(),
    devicePhone: String(fromBody.devicePhone ?? fromEnv.devicePhone ?? '').trim(),
    enabled: fromBody.enabled ?? fromEnv.enabled,
  };
}

/** Gönderici / QR: 905xxxxxxxxx (artı yok) */
function toSenderPhone(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  else if (!d.startsWith('90') && d.length >= 10) d = `90${d}`;
  return d;
}

/** Alıcı: +905xxxxxxxxx */
function toPlusPhone(phone) {
  const d = toSenderPhone(phone);
  return d ? `+${d}` : '';
}

function toDigits(phone) {
  return toSenderPhone(phone);
}

function pickErrorMessage(data, text, statusText) {
  const msg =
    data?.message ||
    data?.description ||
    data?.error ||
    data?.msg ||
    data?.data?.message ||
    data?.data?.description ||
    data?.data?.error ||
    text ||
    statusText;
  return typeof msg === 'string' ? msg : 'WhatsApp API hatası';
}

function extractDevices(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.devices)) return data.devices;
  if (Array.isArray(data?.response)) return data.response;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data?.devices)) return data.data.devices;
  return [];
}

function deviceRegId(device) {
  if (!device || typeof device !== 'object') return '';
  return String(
    device.registration_id
    ?? device.reg_id
    ?? device.regId
    ?? device.id
    ?? device.device_id
    ?? '',
  );
}

function devicePhone(device) {
  if (!device || typeof device !== 'object') return '';
  const raw = device.device_number ?? device.sender ?? device.phone ?? device.number ?? '';
  const s = String(raw).trim();
  if (!s) return '';
  return s.startsWith('+') ? s : toPlusPhone(s);
}

function deviceLooksConnected(device) {
  if (!device || typeof device !== 'object') return false;
  const state = String(
    device.state ?? device.status ?? device.connection_state ?? device.ws_status ?? '',
  ).toLowerCase();
  if (['open', 'connected', 'online', 'active', 'aktif', 'ready', '1', 'true'].includes(state)) {
    return true;
  }
  if (device.connected === true || device.is_connected === true || device.online === true) return true;
  if (device.logged_in === true || device.is_login === true) return true;
  // Liste dolu geldiyse genelde bağlı kabul et
  if (deviceRegId(device)) return true;
  return false;
}

function deviceMatchesRegId(device, regId) {
  if (!regId) return true;
  return deviceRegId(device) === String(regId).trim();
}

function mapDeviceSummary(d) {
  return {
    regId: deviceRegId(d),
    phone: devicePhone(d),
    connected: deviceLooksConnected(d),
    name: String(d.push_name ?? d.name ?? ''),
    platform: String(d.platform ?? ''),
  };
}

function qrImageFromPayload(qr) {
  const raw = String(qr ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image')) return raw;
  // wa.me / linked_devices URL → QR görseli
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(raw)}`;
}

/**
 * WaMessage kişisel WP: X-Api-Key (Bearer / SMS login yok)
 */
async function waFetch(config, path, options = {}) {
  const base = trimSlash(config.apiBaseUrl) || WAMESSAGE_DEFAULT_BASE;
  if (!base) throw new Error('WhatsApp API adresi tanımlı değil');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const apiKey = String(config.apiKey ?? '').trim();
  if (!apiKey && !options.skipAuth) {
    throw new Error('API anahtarı tanımlı değil (WaMessage → Api Entegrasyonu → API Key Göster)');
  }

  const isFormUrlEncoded = Boolean(options.formUrlEncoded);
  const isFormData = Boolean(options.formData);
  const headers = {
    Accept: 'application/json',
    ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    ...(!isFormData && !isFormUrlEncoded ? { 'Content-Type': 'application/json' } : {}),
    ...(isFormUrlEncoded ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 45000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
      body: isFormData
        ? options.formData
        : isFormUrlEncoded
          ? options.body
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`WaMessage zaman aşımı (${Math.round(timeoutMs / 1000)} sn)`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(pickErrorMessage(data, text, res.statusText));
  }
  if (
    data
    && typeof data === 'object'
    && !options.allowSoftFail
    && (data.success === false || data.ok === false)
  ) {
    throw new Error(pickErrorMessage(data, text, 'İşlem başarısız'));
  }
  return data;
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
    throw new Error(pickErrorMessage(data, text, res.statusText));
  }
  return data;
}

async function wamessageConnectionStatus(config) {
  try {
    if (!config.apiKey) {
      return {
        ok: false,
        connected: false,
        state: 'api_key_yok',
        error: 'API Key eksik — WaMessage → Api Entegrasyonu → API Key Göster',
      };
    }
    const data = await waFetch(config, '/wp/device');
    const devices = extractDevices(data);
    const regId = String(config.instanceName || '').trim();
    const matched = regId
      ? devices.find((d) => deviceMatchesRegId(d, regId))
      : devices.find((d) => deviceLooksConnected(d)) || devices[0];

    if (!matched) {
      return {
        ok: true,
        connected: false,
        state: devices.length ? 'cihaz_secilmedi' : 'cihaz_yok',
        devices: devices.map(mapDeviceSummary),
        error: devices.length
          ? `reg_id eşleşmedi (${regId || 'boş'}). Listeden seçin veya QR ile bağlayın.`
          : 'API Key altında bağlı cihaz yok — QR Okut ile bağlayın (paneldeki “bağlı” yetmez).',
      };
    }

    const connected = deviceLooksConnected(matched);
    return {
      ok: true,
      connected,
      state: connected ? 'connected' : String(matched.state ?? matched.status ?? 'disconnected'),
      regId: deviceRegId(matched) || regId,
      phone: devicePhone(matched) || toPlusPhone(config.devicePhone) || '',
      devices: devices.map(mapDeviceSummary),
    };
  } catch (e) {
    return {
      ok: false,
      connected: false,
      state: 'disconnected',
      error: e instanceof Error ? e.message : 'Bağlantı hatası',
    };
  }
}

async function evolutionConnectionStatus(config) {
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

export async function whatsappConnectionStatus(config) {
  if (config.provider === 'evolution') return evolutionConnectionStatus(config);
  return wamessageConnectionStatus(config);
}

/** POST /wp/login/qr → { qr, regId, base64, phone } */
async function wamessageFetchQr(config, phoneOverride) {
  const phone = toSenderPhone(phoneOverride || config.devicePhone || '');
  if (!phone) throw new Error('QR için gönderici telefon gerekli (905xxxxxxxxx)');
  const data = await waFetch(config, '/wp/login/qr', {
    method: 'POST',
    body: { phone },
    timeoutMs: 30000,
  });
  const payload = data?.data ?? data?.response ?? data;
  const qr =
    payload?.qr
    ?? payload?.qrcode
    ?? payload?.base64
    ?? data?.qr
    ?? '';
  const regId = String(
    payload?.regId
    ?? payload?.reg_id
    ?? data?.regId
    ?? data?.reg_id
    ?? '',
  );
  const base64 = qrImageFromPayload(qr);
  return {
    qr: typeof qr === 'string' ? qr : '',
    regId,
    phone,
    base64,
    pairCode: String(payload?.code ?? payload?.pairing_code ?? ''),
    raw: data,
  };
}

async function evolutionFetchQr(config) {
  const inst = config.instanceName || 'netchess';
  const data = await evolutionFetch(config, `/instance/connect/${encodeURIComponent(inst)}`);
  const base64 = data?.base64 || data?.qrcode?.base64 || data?.code || '';
  return { base64: typeof base64 === 'string' ? base64 : '', qr: '', regId: '', phone: '' };
}

export async function whatsappFetchQr(config, phoneOverride) {
  if (config.provider === 'evolution') return evolutionFetchQr(config);
  return wamessageFetchQr(config, phoneOverride);
}

/** POST /wp/device/check — QR okutulmasını bekler (~30 sn) */
export async function wamessageDeviceCheck(config, regId, phone) {
  const rid = String(regId || config.instanceName || '').trim();
  const ph = toSenderPhone(phone || config.devicePhone || '');
  if (!rid) throw new Error('reg_id gerekli');
  if (!ph) throw new Error('Telefon gerekli (905…)');
  const data = await waFetch(config, '/wp/device/check', {
    method: 'POST',
    body: { reg_id: rid, phone: ph },
    timeoutMs: 60000,
    allowSoftFail: true,
  });
  const ok =
    data?.status === 200
    || data?.status === '200'
    || data?.code === 200
    || data?.success === true
    || String(data?.status ?? '').toLowerCase() === 'success';
  return { ok, regId: rid, phone: ph, raw: data };
}

async function wamessagePairCode(config, phone) {
  const p = toSenderPhone(phone || config.devicePhone);
  if (!p) throw new Error('Telefon numarası gerekli');
  const data = await waFetch(config, '/wp/login/code', {
    method: 'POST',
    body: { phone: p },
  });
  const response = data?.data ?? data?.response ?? data;
  return {
    code: String(response?.code ?? response?.pairing_code ?? ''),
    regId: String(response?.reg_id ?? response?.regId ?? data?.reg_id ?? ''),
    phone: p,
    raw: data,
  };
}

/**
 * POST /api/whatsapp/v1/messages/send
 * Content-Type: application/x-www-form-urlencoded
 */
async function wamessageSendMessage(config, phone, message) {
  const regId = String(config.instanceName || '').trim();
  if (!regId) throw new Error('reg_id tanımlı değil — QR ile bağlayıp kaydedin');
  if (!config.apiKey) throw new Error('API anahtarı tanımlı değil');

  const to = toPlusPhone(phone);
  const text = String(message ?? '').trim();
  if (!to || !text) throw new Error('Alıcı ve mesaj zorunlu');

  const body = new URLSearchParams({
    reg_id: regId,
    to,
    message: text,
    send_speed: '1',
  });

  const data = await waFetch(config, '/api/whatsapp/v1/messages/send', {
    method: 'POST',
    formUrlEncoded: true,
    body,
    timeoutMs: 45000,
    allowSoftFail: true,
  });

  const code = data?.code ?? data?.status ?? data?.data?.code ?? data?.data?.status;
  const statusStr = String(
    data?.status ?? data?.data?.status ?? data?.message ?? data?.data?.message ?? '',
  ).toLowerCase();
  const ok =
    code === 200
    || code === '200'
    || statusStr === 'success'
    || statusStr === 'ok'
    || statusStr === '200'
    || data?.success === true
    || data?.ok === true
    || Number(data?.status) === 200;

  if (!ok) {
    const detail = pickErrorMessage(data, JSON.stringify(data).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `Mesaj gönderilemedi (yanıt: ${JSON.stringify(data).slice(0, 180)}). Cihaz aktif değilse QR yeniden okutun.`,
    );
  }
  return data;
}

async function evolutionSendText(config, phone, message) {
  const inst = config.instanceName || 'netchess';
  const number = toDigits(phone);
  await evolutionFetch(config, `/message/sendText/${encodeURIComponent(inst)}`, {
    method: 'POST',
    body: { number, text: message },
  });
  return { ok: true };
}

export async function whatsappSendText(config, phone, message) {
  if (config.provider === 'evolution') {
    return evolutionSendText(config, phone, message);
  }
  await wamessageSendMessage(config, phone, message);
  return { ok: true };
}

export async function whatsappSendBulk(config, recipients) {
  const results = [];
  for (const r of recipients) {
    const phone = String(r?.phone ?? '').trim();
    const message = String(r?.message ?? '').trim();
    if (!phone || !message) continue;
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
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return results;
}

export async function whatsappApiHandler(method, url, body, env) {
  const parsed = new URL(url || 'http://local', 'http://local');
  const action = parsed.searchParams.get('action') || body?.action || 'status';
  const config = resolveConfig(body, env);

  if (action === 'status') {
    if (!config.apiKey) {
      return {
        status: 200,
        body: {
          connected: false,
          state: 'api_key_yok',
          apiConfigured: false,
          provider: config.provider,
          error: 'API Key girin (WaMessage → Api Entegrasyonu → API Key Göster).',
        },
      };
    }
    const status = await whatsappConnectionStatus(config);
    return {
      status: 200,
      body: {
        ...status,
        apiConfigured: true,
        provider: config.provider,
      },
    };
  }

  if (action === 'devices') {
    try {
      if (config.provider === 'evolution') {
        return { status: 200, body: { devices: [], provider: 'evolution' } };
      }
      const data = await waFetch(config, '/wp/device');
      const devices = extractDevices(data).map(mapDeviceSummary);
      return { status: 200, body: { devices, provider: 'wamessage' } };
    } catch (e) {
      return {
        status: 200,
        body: { devices: [], error: e instanceof Error ? e.message : 'Cihaz listesi alınamadı' },
      };
    }
  }

  if (action === 'qr') {
    if (!config.apiKey) {
      return { status: 400, body: { error: 'API Key gerekli' } };
    }
    try {
      const qr = await whatsappFetchQr(config, body?.phone);
      return { status: 200, body: qr };
    } catch (e) {
      return { status: 400, body: { error: e instanceof Error ? e.message : 'QR alınamadı' } };
    }
  }

  if (action === 'device-check') {
    try {
      const result = await wamessageDeviceCheck(
        config,
        body?.regId ?? body?.reg_id ?? config.instanceName,
        body?.phone ?? config.devicePhone,
      );
      return { status: 200, body: result };
    } catch (e) {
      return { status: 400, body: { error: e instanceof Error ? e.message : 'Cihaz kontrolü başarısız' } };
    }
  }

  if (action === 'pair-code') {
    try {
      const result = await wamessagePairCode(config, body?.phone);
      return { status: 200, body: result };
    } catch (e) {
      return { status: 400, body: { error: e instanceof Error ? e.message : 'Kod alınamadı' } };
    }
  }

  if (action === 'send') {
    const phone = String(body?.phone ?? '').trim();
    const message = String(body?.message ?? '').trim();
    if (!phone || !message) {
      return { status: 400, body: { error: 'Telefon ve mesaj zorunlu' } };
    }
    if (!config.enabled) {
      return {
        status: 200,
        body: {
          ok: false,
          mode: 'manual',
          phone,
          message,
          error: 'API ile otomatik gönderim kapalı — API Ayarları\'ndan açın',
        },
      };
    }
    if (!config.apiKey) {
      return { status: 200, body: { ok: false, mode: 'failed', error: 'API anahtarı eksik' } };
    }
    if (!config.instanceName && config.provider !== 'evolution') {
      return { status: 200, body: { ok: false, mode: 'failed', error: 'reg_id eksik — önce QR ile cihaz bağlayın' } };
    }
    try {
      await whatsappSendText(config, phone, message);
      return { status: 200, body: { ok: true, mode: 'api', provider: config.provider } };
    } catch (e) {
      return {
        status: 200,
        body: { ok: false, mode: 'failed', error: e instanceof Error ? e.message : 'Gönderilemedi' },
      };
    }
  }

  if (action === 'send-bulk') {
    const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
    if (!config.enabled) {
      return {
        status: 200,
        body: {
          results: recipients.map((r) => ({
            phone: String(r?.phone ?? ''),
            ok: false,
            mode: 'manual',
            error: 'API ile otomatik gönderim kapalı',
          })),
        },
      };
    }
    if (!config.apiKey) {
      return {
        status: 200,
        body: {
          results: recipients.map((r) => ({
            phone: String(r?.phone ?? ''),
            ok: false,
            mode: 'failed',
            error: 'API anahtarı eksik',
          })),
        },
      };
    }
    if (!config.instanceName && config.provider !== 'evolution') {
      return {
        status: 200,
        body: {
          results: recipients.map((r) => ({
            phone: String(r?.phone ?? ''),
            ok: false,
            mode: 'failed',
            error: 'reg_id eksik',
          })),
        },
      };
    }
    const results = await whatsappSendBulk(config, recipients);
    return { status: 200, body: { results, provider: config.provider } };
  }

  return { status: 400, body: { error: 'Geçersiz action' } };
}

export async function whatsappApiGetHandler(url, env) {
  return whatsappApiHandler('GET', url, {}, env);
}

export async function whatsappApiPostHandler(body, env, url = 'http://local') {
  return whatsappApiHandler('POST', url || 'http://local', body, env);
}
