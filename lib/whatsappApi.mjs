/**
 * WhatsApp API — WaMessage kişisel WP
 * Base: https://api.toplusms.app
 * Dokümantasyon: https://app.wamessage.app/apiIntegration
 * Postman: https://app.wamessage.app/postman_collection_whatsapp.json
 *
 * Auth (kişisel WP koleksiyonu): Authorization: Bearer <API_KEY>
 *  (Api Entegrasyonu → API Key Göster). X-Api-Key de gönderilir (uyumluluk).
 * WaBusiness (Meta) ayrı: X-Api-Key + /api/v1/wabusiness/...
 *
 * Kişisel WP akış:
 *  1) POST /wp/login/qr  { phone: "+905…" } → qr + regId
 *  2) POST /wp/device/check { reg_id, phone: "+905…" }
 *  3) GET  /wp/device
 *  4) Gönderim (tercih): POST /bulk/wp/nton  { messages: [{ reg_id, target, message }] }
 *  5) Alternatif: POST /bulk/preview/wp (formdata) → POST /bulk/wp { id }
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
    authMode: String(fromBody.authMode ?? '').trim() || undefined,
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

function truncateErrorText(s, max = 180) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function pickErrorMessage(data, text, statusText, httpStatus) {
  const status = Number(httpStatus) || 0;
  const blob = `${typeof text === 'string' ? text : ''} ${JSON.stringify(data ?? {})}`.toLowerCase();

  // Cloudflare / origin gateway — ham JSON toast'a düşmesin
  if (
    status === 504
    || status === 502
    || status === 503
    || blob.includes('origin_gateway_timeout')
    || blob.includes('gateway time-out')
    || blob.includes('gateway timeout')
  ) {
    const retry = Number(data?.retry_after) || 120;
    return `WaMessage sunucusu yanıt vermiyor (HTTP ${status || 504}). ${retry} sn bekleyip tekrar deneyin — bu sizin ayar hatası değil, api.toplusms.app yoğun/kapalı.`;
  }
  if (status === 401 || status === 403 || /unauthorized|session not found|forbidden/i.test(blob)) {
    return 'Yetkisiz (401/403) — API Key geçersiz veya süresi dolmuş. WaMessage → Api Entegrasyonu → API Key Göster ile yenileyin.';
  }

  const msg =
    data?.message ||
    data?.description ||
    data?.error ||
    data?.msg ||
    data?.data?.message ||
    data?.data?.description ||
    data?.data?.error ||
    statusText;

  if (typeof msg === 'string' && msg.trim()) {
    // Cloudflare JSON gövdesi message alanında değilse text'te olabilir
    if (msg.trim().startsWith('{') && /origin_gateway|gateway/i.test(msg)) {
      return `WaMessage sunucusu yanıt vermiyor (504). Birkaç dakika sonra tekrar deneyin.`;
    }
    return truncateErrorText(msg);
  }

  if (typeof text === 'string' && text.trim()) {
    if (text.trim().startsWith('{') || text.includes('<!DOCTYPE') || text.includes('<html')) {
      return `WaMessage HTTP ${status || 'hata'} — sunucu geçici olarak yanıt vermiyor.`;
    }
    return truncateErrorText(text);
  }
  return statusText ? truncateErrorText(statusText) : 'WhatsApp API hatası';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWaError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase();
  return (
    m.includes('504')
    || m.includes('502')
    || m.includes('503')
    || m.includes('yanıt vermiyor')
    || m.includes('gateway')
    || m.includes('zaman aşımı')
    || m.includes('timeout')
  );
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
 * WaMessage kişisel WP auth.
 * Geçersiz Bearer + X-Api-Key birlikte 401 üretebiliyor; önce yalnız X-Api-Key dene.
 */
const WA_AUTH_MODES = ['x-api-key', 'authorization-raw', 'bearer'];

function buildWaAuthHeaders(apiKey, mode) {
  const key = String(apiKey || '').trim();
  if (!key) return {};
  if (mode === 'authorization-raw') return { Authorization: key, 'X-Api-Key': key };
  if (mode === 'bearer') return { Authorization: `Bearer ${key}`, 'X-Api-Key': key };
  return { 'X-Api-Key': key };
}

function isAuthFailureMessage(msg, status) {
  const s = Number(status) || 0;
  if (s === 401 || s === 403) return true;
  return /yetkisiz|unauthorized|session not found|forbidden|401|403/i.test(String(msg || ''));
}

/**
 * WaMessage kişisel WP: API Key (Api Entegrasyonu → API Key Göster)
 */
async function waFetchOnce(config, path, options = {}) {
  const base = trimSlash(config.apiBaseUrl) || WAMESSAGE_DEFAULT_BASE;
  if (!base) throw new Error('WhatsApp API adresi tanımlı değil');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const apiKeyRaw = String(config.apiKey ?? '').trim();
  const apiKey = apiKeyRaw.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey && !options.skipAuth) {
    throw new Error('API anahtarı tanımlı değil (WaMessage → Api Entegrasyonu → API Key Göster)');
  }

  const authMode = options.authMode || config.authMode || 'x-api-key';
  const isFormUrlEncoded = Boolean(options.formUrlEncoded);
  const isFormData = Boolean(options.formData);
  const headers = {
    Accept: 'application/json',
    ...(!options.skipAuth ? buildWaAuthHeaders(apiKey, authMode) : {}),
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
      throw new Error(`WaMessage zaman aşımı (${Math.round(timeoutMs / 1000)} sn) — api.toplusms.app yanıt vermedi.`);
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
    const err = new Error(pickErrorMessage(data, text, res.statusText, res.status));
    err.status = res.status;
    err.authMode = authMode;
    throw err;
  }
  if (
    data
    && typeof data === 'object'
    && !options.allowSoftFail
    && (data.success === false || data.ok === false)
  ) {
    const err = new Error(pickErrorMessage(data, text, 'İşlem başarısız', res.status));
    err.status = res.status;
    err.authMode = authMode;
    throw err;
  }
  return data;
}

async function waFetch(config, path, options = {}) {
  const retries = Number(options.retries ?? 0);
  const preferMode = options.authMode || config.authMode || 'x-api-key';
  const modes = [preferMode, ...WA_AUTH_MODES.filter((m) => m !== preferMode)];

  let lastErr;
  for (const mode of modes) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const data = await waFetchOnce(config, path, { ...options, authMode: mode });
        if (config && typeof config === 'object') config.authMode = mode;
        return data;
      } catch (e) {
        lastErr = e;
        const authFail = isAuthFailureMessage(e?.message, e?.status);
        if (authFail) break;
        if (attempt >= retries || !isRetryableWaError(e)) throw e;
        await sleep(2500 * (attempt + 1));
      }
    }
  }
  throw lastErr;
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
        error: 'API Key eksik — WaMessage → Api Entegrasyonu → API Key Göster (SMS ile gelir)',
      };
    }
    const data = await waFetch(config, '/wp/device', { timeoutMs: 60000, retries: 1 });
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
        authMode: config.authMode,
        error: devices.length
          ? `reg_id eşleşmedi (${regId || 'boş'}). WaMessage → WhatsApp Hesaplarım’daki REG_ID’yi buraya yapıştırın.`
          : 'API Key altında bağlı cihaz yok — panelde Aktif cihazın REG_ID’sini yapıştırın veya QR ile bağlayın.',
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
      authMode: config.authMode,
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

/** POST /wp/login/qr → { qr, regId, base64, phone } — Postman: phone "+905…" */
async function wamessageFetchQr(config, phoneOverride) {
  const phone = toPlusPhone(phoneOverride || config.devicePhone || '');
  if (!phone) throw new Error('QR için gönderici telefon gerekli (+905xxxxxxxxx)');
  const data = await waFetch(config, '/wp/login/qr', {
    method: 'POST',
    body: { phone },
    timeoutMs: 60000,
    retries: 1,
  });
  const payload = data?.data ?? data?.response ?? data?.data?.response ?? data;
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

/** POST /wp/device/check — Postman: phone "+905…" */
export async function wamessageDeviceCheck(config, regId, phone) {
  const rid = String(regId || config.instanceName || '').trim();
  const ph = toPlusPhone(phone || config.devicePhone || '');
  if (!rid) throw new Error('reg_id gerekli');
  if (!ph) throw new Error('Telefon gerekli (+905…)');
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
  const p = toPlusPhone(phone || config.devicePhone);
  if (!p) throw new Error('Telefon numarası gerekli (+905…)');
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

function isWaMessageSuccess(data) {
  if (data == null) return false;
  const code = data?.code ?? data?.status ?? data?.data?.code ?? data?.data?.status;
  const statusStr = String(
    data?.status ?? data?.data?.status ?? data?.message ?? data?.data?.message ?? '',
  ).toLowerCase();
  return (
    code === 200
    || code === '200'
    || statusStr === 'success'
    || statusStr === 'ok'
    || statusStr === '200'
    || data?.success === true
    || data?.ok === true
    || Number(data?.status) === 200
    || data?.data?.id != null
    || data?.id != null
    || Array.isArray(data?.data)
    || (typeof data?.description === 'string' && /başar|success|ok|gönder/i.test(data.description))
  );
}

function extractPreviewId(preview) {
  return (
    preview?.data?.id
    ?? preview?.data?.data?.id
    ?? preview?.id
    ?? preview?.preview_id
    ?? preview?.data?.preview_id
    ?? preview?.data?.uuid
    ?? preview?.uuid
    ?? null
  );
}

/**
 * Tercih edilen gönderim: POST /bulk/wp/nton
 * Postman SEND-NtoN — target: 905… (artısız), reg_id + message
 */
async function wamessageSendNton(config, messages) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      reg_id: String(m.reg_id ?? m.regId ?? config.instanceName ?? '').trim(),
      target: toDigits(m.target ?? m.phone ?? ''),
      message: String(m.message ?? '').trim(),
    }))
    .filter((m) => m.reg_id && m.target && m.message);

  if (!list.length) throw new Error('Gönderilecek mesaj yok');

  const data = await waFetch(config, '/bulk/wp/nton', {
    method: 'POST',
    body: { messages: list },
    timeoutMs: 60000,
    allowSoftFail: true,
  });

  if (!isWaMessageSuccess(data)) {
    const detail = pickErrorMessage(data, JSON.stringify(data).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `NtoN gönderilemedi (yanıt: ${JSON.stringify(data).slice(0, 180)})`,
    );
  }
  return data;
}

/**
 * Alternatif: Postman WP-PREVIEW + SEND-WP
 * formdata → { id } onay
 */
async function wamessageSendViaPreview(config, phone, message) {
  const regId = String(config.instanceName || '').trim();
  const to = toPlusPhone(phone);
  const text = String(message ?? '').trim();
  if (!regId) throw new Error('reg_id tanımlı değil — QR ile bağlayıp kaydedin');
  if (!to || !text) throw new Error('Alıcı ve mesaj zorunlu');

  const form = new FormData();
  form.append('numbers', to);
  form.append('message', text);
  form.append('campaign_name', `netchess-${Date.now()}`);
  form.append('reg_id', regId);
  form.append('now', 'true');
  form.append('send_speed', '4');
  form.append('send_date', '');
  form.append('add_cancel_link', 'false');

  const preview = await waFetch(config, '/bulk/preview/wp', {
    method: 'POST',
    formData: form,
    timeoutMs: 45000,
    allowSoftFail: true,
  });

  const previewId = extractPreviewId(preview);
  if (previewId == null || previewId === '') {
    const detail = pickErrorMessage(preview, JSON.stringify(preview ?? {}).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `Önizleme oluşturulamadı (yanıt: ${JSON.stringify(preview).slice(0, 180)}). API Key, reg_id ve krediyi kontrol edin.`,
    );
  }

  const data = await waFetch(config, '/bulk/wp', {
    method: 'POST',
    body: { id: previewId },
    timeoutMs: 45000,
    allowSoftFail: true,
  });

  if (!isWaMessageSuccess(data)) {
    const detail = pickErrorMessage(data, JSON.stringify(data).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `Mesaj gönderilemedi (yanıt: ${JSON.stringify(data).slice(0, 180)}). Cihaz aktif değilse QR yeniden okutun.`,
    );
  }
  return data;
}

async function wamessageSendMessage(config, phone, message) {
  const regId = String(config.instanceName || '').trim();
  if (!regId) throw new Error('reg_id tanımlı değil — QR ile bağlayıp kaydedin');
  if (!config.apiKey) throw new Error('API anahtarı tanımlı değil');

  const text = String(message ?? '').trim();
  const digits = toDigits(phone);
  if (!digits || !text) throw new Error('Alıcı ve mesaj zorunlu');

  try {
    return await wamessageSendNton(config, [{ reg_id: regId, target: digits, message: text }]);
  } catch (ntonErr) {
    try {
      return await wamessageSendViaPreview(config, phone, text);
    } catch (previewErr) {
      const a = ntonErr instanceof Error ? ntonErr.message : 'NtoN hata';
      const b = previewErr instanceof Error ? previewErr.message : 'Preview hata';
      throw new Error(`${a} | yedek: ${b}`);
    }
  }
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
  const list = (Array.isArray(recipients) ? recipients : [])
    .map((r) => ({
      phone: String(r?.phone ?? '').trim(),
      message: String(r?.message ?? '').trim(),
    }))
    .filter((r) => r.phone && r.message);

  if (!list.length) return [];

  // Kişisel WP: tek NtoN isteğinde toplu kişiselleştirilmiş gönderim
  if (config.provider !== 'evolution') {
    try {
      const regId = String(config.instanceName || '').trim();
      await wamessageSendNton(
        config,
        list.map((r) => ({ reg_id: regId, target: r.phone, message: r.message })),
      );
      return list.map((r) => ({ phone: r.phone, ok: true, mode: 'api' }));
    } catch {
      // tek tek yedek akış
    }
  }

  const results = [];
  for (const r of list) {
    try {
      await whatsappSendText(config, r.phone, r.message);
      results.push({ phone: r.phone, ok: true, mode: 'api' });
    } catch (e) {
      results.push({
        phone: r.phone,
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
          error: 'API Key girin (WaMessage → Api Entegrasyonu → API Key Göster; Bearer olarak kullanılır).',
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
      const data = await waFetch(config, '/wp/device', { timeoutMs: 60000, retries: 2 });
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

  if (action === 'settings-get' || action === 'logs' || action === 'settings-save') {
    return handleWhatsAppAdminActions(action, body, env, config);
  }

  return { status: 400, body: { error: 'Geçersiz action' } };
}

async function createWhatsAppSupabase(env) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const DEFAULT_TEMPLATE_SEED = [
  {
    key: 'training_completed',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını tamamladı ({{tarih}} {{saat}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

{{kulup_adi}}`,
  },
  {
    key: 'training_partial',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını kısmen yaptı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Eksik kalan kısmı tamamlamasını hatırlatabilirsiniz.

{{kulup_adi}}`,
  },
  {
    key: 'training_incomplete',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını yapmadı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Lütfen platformda antrenmanını tamamlamasını hatırlatın.

{{kulup_adi}}`,
  },
];

async function handleWhatsAppAdminActions(action, body, env, config) {
  const sb = await createWhatsAppSupabase(env);
  if (!sb) {
    return {
      status: 503,
      body: { error: 'Supabase service role yapılandırılmamış — sunucu ayarları/loglar kullanılamaz.' },
    };
  }

  if (action === 'logs') {
    const limit = Math.min(500, Math.max(1, Number(body?.limit) || 200));
    const baseSelect =
      'id, phone, message, status, template_key, student_id, student_name, branch_office, error, created_at';
    let data;
    let error;
    ({ data, error } = await sb
      .from('whatsapp_message_logs')
      .select(`${baseSelect}, recipient_name`)
      .order('created_at', { ascending: false })
      .limit(limit));
    if (error && /recipient_name/i.test(String(error.message ?? ''))) {
      ({ data, error } = await sb
        .from('whatsapp_message_logs')
        .select(baseSelect)
        .order('created_at', { ascending: false })
        .limit(limit));
    }
    if (error) return { status: 500, body: { error: error.message } };
    const logs = (data ?? []).map((row) => ({
      id: row.id,
      phone: row.phone,
      message: row.message,
      status: row.status,
      templateKey: row.template_key,
      studentId: row.student_id,
      studentName: row.student_name,
      recipientName: row.recipient_name,
      branchOffice: row.branch_office,
      error: row.error,
      createdAt: row.created_at,
    }));
    return { status: 200, body: { logs } };
  }

  if (action === 'settings-get') {
    const [{ data: cfg }, { data: tplRows }, { data: ruleRows }] = await Promise.all([
      sb.from('whatsapp_config').select('*').eq('id', 'default').maybeSingle(),
      sb.from('whatsapp_templates').select('key, body, enabled'),
      sb.from('whatsapp_auto_rules').select('event, enabled'),
    ]);

    // Eksik antrenman şablonlarını seed et (görünsün / düzenlenebilsin)
    const existingKeys = new Set((tplRows ?? []).map((t) => t.key));
    const toSeed = DEFAULT_TEMPLATE_SEED.filter((t) => !existingKeys.has(t.key));
    if (toSeed.length > 0) {
      await sb.from('whatsapp_templates').upsert(
        toSeed.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
      );
    }
    const { data: tplFresh } = toSeed.length > 0
      ? await sb.from('whatsapp_templates').select('key, body, enabled')
      : { data: tplRows };

    const templates = (tplFresh ?? []).map((t) => ({
      key: t.key,
      body: t.body,
      enabled: t.enabled !== false,
    }));
    const rules = (ruleRows ?? []).map((r) => ({
      event: r.event,
      enabled: Boolean(r.enabled),
    }));

    let deliveryRules = [];
    try {
      const { data: dr } = await sb.from('notification_delivery_rules').select('event, channel');
      deliveryRules = (dr ?? []).map((r) => ({ event: r.event, channel: r.channel }));
    } catch { /* ignore */ }

    const apiKey = String(cfg?.api_key ?? config.apiKey ?? '').trim();
    return {
      status: 200,
      body: {
        config: {
          provider: config.provider,
          apiBaseUrl: String(cfg?.api_base_url ?? config.apiBaseUrl ?? '').trim(),
          apiKey: apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : '',
          apiKeySet: Boolean(apiKey),
          instanceName: String(cfg?.instance_name ?? config.instanceName ?? '').trim(),
          enabled: cfg?.enabled ?? Boolean(config.enabled),
        },
        templates,
        rules,
        deliveryRules,
        scheduler: {
          eveningHourTr: 23,
          pollIntervalMin: 10,
          kinds: ['training_completed', 'training_partial', 'training_incomplete'],
        },
      },
    };
  }

  if (action === 'settings-save') {
    const nextConfig = body?.config && typeof body.config === 'object' ? body.config : null;
    const templates = Array.isArray(body?.templates) ? body.templates : null;
    const rules = Array.isArray(body?.rules) ? body.rules : null;
    const deliveryRules = Array.isArray(body?.deliveryRules) ? body.deliveryRules : null;

    if (nextConfig) {
      const { data: prevRow } = await sb.from('whatsapp_config').select('api_key').eq('id', 'default').maybeSingle();
      const prevKey = String(prevRow?.api_key ?? '').trim();
      const incomingKey = String(nextConfig.apiKey ?? '').trim();
      const keepMasked = incomingKey.includes('…') || incomingKey.includes('...');
      await sb.from('whatsapp_config').upsert({
        id: 'default',
        api_base_url: String(nextConfig.apiBaseUrl ?? config.apiBaseUrl ?? '').trim() || null,
        api_key: keepMasked ? (prevKey || null) : (incomingKey || prevKey || null),
        instance_name: String(nextConfig.instanceName ?? config.instanceName ?? '').trim() || null,
        enabled: Boolean(nextConfig.enabled),
        updated_at: new Date().toISOString(),
      });
    }

    if (templates) {
      const rows = templates
        .filter((t) => t && t.key)
        .map((t) => ({
          key: String(t.key),
          body: String(t.body ?? ''),
          enabled: t.enabled !== false,
          updated_at: new Date().toISOString(),
        }));
      if (rows.length > 0) {
        await sb.from('whatsapp_templates').upsert(rows);
      }
    }

    if (rules) {
      const rows = rules
        .filter((r) => r && r.event)
        .map((r) => ({
          event: String(r.event),
          enabled: Boolean(r.enabled),
          updated_at: new Date().toISOString(),
        }));
      if (rows.length > 0) {
        await sb.from('whatsapp_auto_rules').upsert(rows);
      }
    }

    if (deliveryRules) {
      const rows = deliveryRules
        .filter((r) => r && r.event && r.channel)
        .map((r) => ({
          event: String(r.event),
          channel: String(r.channel),
          updated_at: new Date().toISOString(),
        }));
      if (rows.length > 0) {
        try {
          await sb.from('notification_delivery_rules').upsert(rows);
        } catch { /* tablo yoksa yalnızca whatsapp_auto_rules */ }
      }
      const waRows = rows.map((r) => ({
        event: r.event,
        enabled: r.channel === 'whatsapp' || r.channel === 'both',
        updated_at: r.updated_at,
      }));
      if (waRows.length > 0) {
        await sb.from('whatsapp_auto_rules').upsert(waRows);
      }
    }

    return { status: 200, body: { ok: true } };
  }

  if (action === 'parent-notifications') {
    const studentId = String(body?.studentId ?? '').trim();
    const limit = Math.min(200, Math.max(1, Number(body?.limit) || 80));
    if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };
    const { data, error } = await sb
      .from('parent_panel_notifications')
      .select('id, student_id, event, title, body, branch_office, read_at, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { status: 500, body: { error: error.message } };
    const notifications = (data ?? []).map((row) => ({
      id: row.id,
      studentId: row.student_id,
      event: row.event,
      title: row.title,
      body: row.body,
      branchOffice: row.branch_office,
      read: Boolean(row.read_at),
      createdAt: row.created_at,
    }));
    return { status: 200, body: { notifications } };
  }

  if (action === 'parent-notifications-create') {
    const n = body?.notification;
    if (!n || !n.id || !n.studentId) return { status: 400, body: { error: 'notification gerekli' } };
    const { error } = await sb.from('parent_panel_notifications').upsert({
      id: String(n.id),
      student_id: String(n.studentId),
      event: String(n.event ?? 'lesson_absent'),
      title: String(n.title ?? 'Bildirim'),
      body: String(n.body ?? ''),
      branch_office: n.branchOffice ? String(n.branchOffice) : null,
      read_at: n.read ? new Date().toISOString() : null,
      created_at: n.createdAt ? String(n.createdAt) : new Date().toISOString(),
    });
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true } };
  }

  return { status: 400, body: { error: 'Geçersiz action' } };
}

export async function whatsappApiGetHandler(url, env) {
  return whatsappApiHandler('GET', url, {}, env);
}

export async function whatsappApiPostHandler(body, env, url = 'http://local') {
  return whatsappApiHandler('POST', url || 'http://local', body, env);
}
