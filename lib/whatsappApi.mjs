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

/** Rapor eşleştirme anahtarı: son 10 hane */
function phoneKey(phone) {
  return String(phone ?? '').replace(/\D/g, '').slice(-10);
}

/** Rapor eşleştirmede satır sonu/boşluk farklarını yok say */
function normalizeMatchText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
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
  // Cihaz hakkı dolu: yeni cihaz bağlanamaz (QR/kod 400 döner). Tek çözüm eski
  // cihazı silip yeniden bağlamaktır; ham sağlayıcı metni panelde anlaşılmıyordu.
  if (/maksimum cihaz|cihaz hakk|maximum device|device limit/i.test(blob)) {
    return 'WaMessage cihaz hakkı dolu — yeni cihaz bağlanamıyor. "Cihazı sıfırla ve yeniden bağla" ile eski cihazı silip yeni kod/QR alın.';
  }
  if (status === 401 || status === 403 || /unauthorized|session not found|forbidden/i.test(blob)) {
    return 'Yetkisiz (401/403) — API Key geçersiz veya süresi dolmuş. WaMessage → Api Entegrasyonu → API Key Göster ile yenileyin.';
  }

  const msg =
    data?.message ||
    data?.description ||
    data?.error ||
    data?.msg ||
    // Sağlayıcı bazı uçlarda hatayı düz metin olarak `data` alanına koyar
    // (ör. /wp/login/code → {"data":"maksimum cihaz sayısına ulaşıldı…"}).
    (typeof data?.data === 'string' ? data.data : undefined) ||
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

  if (device.is_active === 0 || device.active === 0) return false;
  if (device.is_active === 1 || device.is_active === true || device.active === 1 || device.active === true) {
    return true;
  }

  const state = String(
    device.state
    ?? device.status
    ?? device.connection_state
    ?? device.ws_status
    ?? device.durum
    ?? device.device_status
    ?? '',
  ).toLowerCase().trim();

  if (
    ['pasif', 'passive', 'inactive', 'offline', 'disconnected', 'close', 'closed', 'logout', 'logged_out', '0', 'false']
      .includes(state)
    || /pasif|passive|offline|disconnect|logout|çıkış|kopuk/i.test(state)
  ) {
    return false;
  }

  if (device.connected === false || device.is_connected === false || device.online === false) return false;
  if (device.logged_in === false || device.is_login === false) return false;

  if (['open', 'connected', 'online', 'active', 'aktif', 'ready', '1', 'true'].includes(state)) {
    return true;
  }
  if (device.connected === true || device.is_connected === true || device.online === true) return true;
  if (device.logged_in === true || device.is_login === true) return true;

  return false;
}

/** Kayıtlı reg_id eski/pasifse listedeki aktif cihaza düş. */
function pickBestWaMessageDevice(devices, configRegId) {
  const regId = String(configRegId || '').trim();
  const summaries = devices.map((raw) => ({ raw, ...mapDeviceSummary(raw) }));
  const active = summaries.filter((d) => d.connected);

  if (regId) {
    const configured = summaries.find((d) => d.regId === regId);
    if (configured?.connected) {
      return { device: configured.raw, connected: true, regId: configured.regId, regIdMismatch: false };
    }
  }

  if (active.length === 1) {
    const pick = active[0];
    return {
      device: pick.raw,
      connected: true,
      regId: pick.regId,
      regIdMismatch: Boolean(regId && pick.regId !== regId),
    };
  }

  if (active.length > 1 && regId) {
    const byReg = active.find((d) => d.regId === regId);
    if (byReg) {
      return { device: byReg.raw, connected: true, regId: byReg.regId, regIdMismatch: false };
    }
    const pick = active[0];
    return {
      device: pick.raw,
      connected: true,
      regId: pick.regId,
      regIdMismatch: true,
    };
  }

  if (active.length > 0) {
    const pick = active[0];
    return {
      device: pick.raw,
      connected: true,
      regId: pick.regId,
      regIdMismatch: Boolean(regId && pick.regId !== regId),
    };
  }

  if (regId) {
    const configured = summaries.find((d) => d.regId === regId);
    if (configured) {
      return {
        device: configured.raw,
        connected: false,
        regId: configured.regId,
        regIdMismatch: false,
      };
    }
    return {
      device: null,
      connected: false,
      regId,
      regIdMismatch: true,
    };
  }

  const first = summaries[0];
  if (first) {
    return {
      device: first.raw,
      connected: first.connected,
      regId: first.regId,
      regIdMismatch: false,
    };
  }

  return { device: null, connected: false, regId: '', regIdMismatch: false };
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
    const configRegId = String(config.instanceName || '').trim();
    const pick = pickBestWaMessageDevice(devices, configRegId);

    if (!pick.device && devices.length === 0) {
      return {
        ok: true,
        connected: false,
        state: 'cihaz_yok',
        devices: [],
        authMode: config.authMode,
        error: 'API Key altında bağlı cihaz yok — panelde Aktif cihazın REG_ID’sini yapıştırın veya QR ile bağlayın.',
      };
    }

    if (!pick.device) {
      const activeIds = devices.map(mapDeviceSummary).filter((d) => d.connected).map((d) => d.regId).filter(Boolean);
      return {
        ok: true,
        connected: false,
        state: 'cihaz_secilmedi',
        regId: configRegId,
        regIdMismatch: true,
        devices: devices.map(mapDeviceSummary),
        authMode: config.authMode,
        error: activeIds.length > 0
          ? `Kayıtlı reg_id (${configRegId}) bulunamadı. WaMessage’te aktif cihaz: ${activeIds.join(', ')} — API Ayarlarından güncelleyin.`
          : `reg_id eşleşmedi (${configRegId || 'boş'}). WaMessage → WhatsApp Hesaplarım’daki REG_ID’yi yapıştırın.`,
      };
    }

    const matched = pick.device;
    const connected = pick.connected;
    const resolvedRegId = pick.regId || deviceRegId(matched) || configRegId;
    const rawState = String(matched.state ?? matched.status ?? matched.durum ?? '').trim();

    let error;
    if (connected && pick.regIdMismatch) {
      error = `Kayıtlı reg_id (${configRegId}) güncel değil. Aktif cihaz reg_id: ${resolvedRegId} — kaydedin.`;
    } else if (!connected) {
      error = `WaMessage'te cihaz Pasif (${rawState || 'bağlı değil'}). WaMessage → WhatsApp Hesaplarım'dan QR ile yeniden bağlayın.`;
    }

    return {
      ok: true,
      connected,
      state: connected ? 'connected' : (rawState || 'pasif'),
      regId: resolvedRegId,
      regIdMismatch: pick.regIdMismatch,
      phone: devicePhone(matched) || toPlusPhone(config.devicePhone) || '',
      devices: devices.map(mapDeviceSummary),
      authMode: config.authMode,
      error,
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

/**
 * Kayıtlı/bağlı cihazın telefonunu sağlayıcıdan öğren.
 * QR/kod bağlama uçları gönderici telefon ister; panel localStorage'ında
 * devicePhone boş olabiliyor (sunucudaki whatsapp_config'te bu kolon yok).
 */
async function knownDevicePhone(config, regId = '') {
  const wanted = normalizeRegIdString(regId ?? config.instanceName);
  try {
    const data = await waFetch(config, '/wp/device', { timeoutMs: 20000, retries: 0, allowSoftFail: true });
    const devices = extractDevices(data);
    const hit = wanted
      ? devices.find((d) => deviceRegId(d) === wanted)
      : devices[0];
    return devicePhone(hit) || devicePhone(devices[0]) || '';
  } catch {
    return '';
  }
}

/** POST /wp/login/qr → { qr, regId, base64, phone } — Postman: phone "+905…" */
async function wamessageFetchQr(config, phoneOverride) {
  const phone = toPlusPhone(phoneOverride || config.devicePhone || '')
    || toPlusPhone(await knownDevicePhone(config));
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
  const p = toPlusPhone(phone || config.devicePhone || '') || toPlusPhone(await knownDevicePhone(config));
  if (!p) throw new Error('Telefon numarası gerekli (+905…)');  const data = await waFetch(config, '/wp/login/code', {
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
 * DELETE /wp/delete/:reg_id — cihazı siler ve cihaz hakkını boşaltır (reg_id string).
 * "maksimum cihaz sayısına ulaşıldı" hatası bu çağrı olmadan aşılamaz.
 */
export async function wamessageDeleteDevice(config, regId) {
  const rid = normalizeRegIdString(regId ?? config.instanceName);
  if (!rid) throw new Error('reg_id gerekli');
  const data = await waFetch(config, `/wp/delete/${encodeURIComponent(rid)}`, {
    method: 'DELETE',
    timeoutMs: 45000,
    retries: 1,
    allowSoftFail: true,
  });
  const ack = waAckInfo(data);
  if (ack.explicitError || (ack.status && (ack.status < 200 || ack.status >= 300))) {
    throw new Error(pickErrorMessage(data, JSON.stringify(data).slice(0, 200), ''));
  }
  return { regId: rid, raw: data };
}

/**
 * Bağlı cihazı sıfırla ve yeniden bağlama oturumu aç.
 *
 * Neden gerekli: WaMessage tek cihaz hakkında takılı kalabiliyor — cihaz
 * API'de "bağlı" (state 1) görünür ama gelen mesajları hiç işlemez; gönderim
 * raporu sonsuza kadar state 4 ("Bekleniyor") kalır ve panel "Gönderildi"
 * yazar. Bu durumda ne QR ne telefon kodu alınabilir (400 · maksimum cihaz).
 * Çözüm: eski kaydı silmek, ardından yeni kod/QR üretmek.
 */
export async function wamessageResetDevice(config, { regId, phone, mode } = {}) {
  const rid = normalizeRegIdString(regId ?? config.instanceName);
  // Silmeden önce telefonu öğren (silinince /wp/device boşalır).
  const ph = toPlusPhone(phone || config.devicePhone || '') || toPlusPhone(await knownDevicePhone(config, rid));
  if (!ph) throw new Error('Yeniden bağlamak için gönderici telefon gerekli (+905xxxxxxxxx)');

  let deleted = false;
  let deleteError = '';
  if (rid) {
    try {
      await wamessageDeleteDevice(config, rid);
      deleted = true;
    } catch (e) {
      deleteError = e instanceof Error ? e.message : 'Cihaz silinemedi';
    }
  }

  if (mode === 'qr') {
    const qr = await wamessageFetchQr(config, ph);
    return {
      mode: 'qr', deleted, deletedRegId: rid, deleteError, phone: qr.phone, regId: qr.regId, qr: qr.qr, base64: qr.base64,
    };
  }
  const code = await wamessagePairCode(config, ph);
  if (!code.code) {
    throw new Error('Bağlama kodu alınamadı — birkaç saniye sonra tekrar deneyin.');
  }
  return {
    mode: 'code', deleted, deletedRegId: rid, deleteError, phone: code.phone, regId: code.regId, pairCode: code.code,
  };
}

/**
 * WaMessage gönderim yanıtını ayrıştır (onay + rapor id'leri).
 * Canlı API'de doğrulanan gövdeler:
 *  NtoN     → { code:200, status:'OK', description:'NtoN messages sent successfully', reports:[{reportId, phone}] }
 *  Preview  → { data:{ id, count_valid_numbers, total_success_members }, status:201 }
 *  Kampanya → { data:{ report_id, message:'gönderim işlemi başlatıldı.' }, status:200 }
 *  Hata     → { message:'…', status:400 } · { code:400, data:[] }
 * Eski `isWaMessageSuccess` kontrolü `Array.isArray(data?.data)` ve `id != null`
 * gibi gevşek koşullarla hatalı yanıtları başarı sayıyordu; panel bu yüzden
 * mesaj hiç gitmediği halde "Gönderildi" gösteriyordu.
 */
function waAckInfo(data) {
  const status = Number(data?.status ?? data?.code ?? data?.data?.status);
  const description = String(data?.description ?? data?.data?.description ?? '').trim();
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  const reportIds = [];
  for (const r of reports) {
    const id = String(r?.reportId ?? r?.report_id ?? r?.id ?? '').trim();
    if (id) reportIds.push(id);
  }
  const campaignReportId = String(data?.data?.report_id ?? data?.report_id ?? '').trim();
  if (campaignReportId) reportIds.push(campaignReportId);
  return {
    status: Number.isFinite(status) ? status : 0,
    description,
    reports,
    reportIds,
    explicitError: Boolean(data?.error)
      || data?.success === false
      || data?.ok === false
      || (Number.isFinite(status) && status >= 400),
  };
}

/** NtoN onayı: 2xx + en az bir reportId (yoksa sağlayıcı mesajı kuyruğa almamıştır) */
function isNtonAck(data) {
  const ack = waAckInfo(data);
  if (ack.explicitError) return false;
  if (ack.status && (ack.status < 200 || ack.status >= 300)) return false;
  return ack.reportIds.length > 0
    || /sent successfully|gönderildi|başarı/i.test(ack.description);
}

/** Kampanya onayı (POST /bulk/wp) */
function isCampaignSendAck(data) {
  const ack = waAckInfo(data);
  if (ack.explicitError) return false;
  if (ack.status && (ack.status < 200 || ack.status >= 300)) return false;
  const started = String(data?.data?.message ?? '').trim();
  return ack.reportIds.length > 0 || /başlat|started|success|ok/i.test(started);
}

/** NtoN yanıtındaki rapor id'sini alıcı numarasına göre eşle */
function reportIdForPhone(reports, phone) {
  const digits = toDigits(phone);
  if (!digits || !Array.isArray(reports)) return '';
  const hit = reports.find((r) => toDigits(r?.phone ?? r?.target ?? '') === digits);
  return String(hit?.reportId ?? hit?.report_id ?? '').trim();
}

/**
 * Sağlayıcı rapor satırını teslim durumuna çevir.
 * Canlı API'de doğrulandı: state 1 = işlendi (success/fail dolu, UpdatedAt ilerlemiş),
 * state 4 = kuyruğa alındı ama işlenmedi (success=0 fail=0, UpdatedAt = CreatedAt).
 */
function deliveryStateFromReport(row) {
  if (!row) {
    return { state: 'unknown', success: 0, fail: 0, note: 'Sağlayıcı raporunda bu mesaj bulunamadı.' };
  }
  const state = Number(row.state);
  const success = Number(row.success ?? 0) || 0;
  const fail = Number(row.fail ?? 0) || 0;
  // WaMessage /reports state sözlüğü (Postman koleksiyonu):
  //  1 = Başarılı · 2 = Başarısız · 3 = WhatsApp Kullanmıyor
  //  4 = Bekleniyor (kuyrukta) · 5 = Durdurulmuş
  if (state === 1) {
    return { state: 'delivered', success, fail, note: '' };
  }
  if (state === 3) {
    return {
      state: 'failed',
      success,
      fail,
      note: 'Numarada WhatsApp hesabı yok — mesaj iletilemez. Veli numarasını kontrol edin.',
    };
  }
  if (state === 2 || state === 5 || (fail > 0 && success === 0)) {
    return {
      state: 'failed',
      success,
      fail,
      note: state === 5
        ? 'Sağlayıcı gönderimi durdurdu (durum 5).'
        : 'Sağlayıcı gönderimi başarısız olarak kapattı.',
    };
  }
  if (state === 4) {
    return {
      state: 'queued',
      success,
      fail,
      note: 'Sağlayıcı mesajı kuyruğa aldı ama telefonlara iletmedi. WaMessage → WhatsApp Hesaplarım üzerinden cihazı yeniden bağlayın.',
    };
  }
  return { state: 'queued', success, fail, note: `Sağlayıcı raporu henüz işlenmedi (state ${Number.isFinite(state) ? state : '—'}).` };
}

/**
 * Gönderim raporlarını (mesaj başına satırlar) indeksle.
 * GET /reports?page=N&source=1&state=0|1 → { wp: [{ report_id, phone, content, state, is_read, CreatedAt }] }
 * Sayfa boyutu 10; hem bekleyen hem tamamlanan listelerinden çekip tekilleştirir.
 * Eşleşme: önce report_id, yoksa (telefon + içerik).
 */
async function fetchWaReportIndex(config, pages = 5) {
  const byReportId = new Map();
  const byPhoneContent = new Map();
  const byPhonePrefix = new Map();
  const seen = new Set();
  // state: 0 = tümü, 1 = başarılı, 2 = başarısız (numarada WhatsApp yok dahil)
  for (const state of [0, 1, 2]) {
    for (let page = 1; page <= pages; page += 1) {
      const res = await waFetch(config, `/reports?page=${page}&source=1&state=${state}`, {
        timeoutMs: 30000,
        retries: 1,
      });
      const rows = Array.isArray(res?.wp) ? res.wp : [];
      if (!rows.length) break;
      for (const row of rows) {
        const reportId = String(row?.report_id ?? '').trim();
        const key = reportId || `row-${row?.ID ?? seen.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (reportId && !byReportId.has(reportId)) byReportId.set(reportId, row);
        const text = normalizeMatchText(row?.content);
        const phone = phoneKey(row?.phone);
        const pcKey = `${phone}|${text}`;
        const prev = byPhoneContent.get(pcKey);
        if (!prev || String(row?.CreatedAt ?? '').localeCompare(String(prev?.CreatedAt ?? '')) > 0) {
          byPhoneContent.set(pcKey, row);
        }
        // İçerik sonunda küçük farklar olursa (kırpma/ek satır) ilk 60 karakterle eşleş
        const prefixKey = `${phone}|${text.slice(0, 60)}`;
        const prevPrefix = byPhonePrefix.get(prefixKey);
        if (!prevPrefix || String(row?.CreatedAt ?? '').localeCompare(String(prevPrefix?.CreatedAt ?? '')) > 0) {
          byPhonePrefix.set(prefixKey, row);
        }
      }
      if (rows.length < 10) break;
    }
  }
  return { byReportId, byPhoneContent, byPhonePrefix, size: seen.size };
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

function normalizeRegId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // DİKKAT: WaMessage NtoN ucu reg_id'yi STRING ister. Sayı gönderilirse
  // 400 "Field validation for 'reg_id' failed on the 'required' tag" döner ve
  // mesaj hiç gönderilmez (kod yedek kampanya akışına düşer, panel yine de
  // "Gönderildi" gösterirdi). Bu yüzden her zaman string gönderilir.
  return raw.replace(/^\+/, '');
}

function normalizeRegIdString(value) {
  return String(value ?? '').trim();
}

/**
 * Gönderim öncesi cihazı doğrula.
 * - Kayıtlı reg_id bağlıysa onu kullanır.
 * - Kayıtlı cihaz pasifse bağlı olan cihaza geçer (config güncellenir).
 * - Cihaz listesi alınabildiği halde HİÇ bağlı cihaz yoksa gönderim başlatılmaz:
 *   aksi halde sağlayıcı isteği kabul edip mesajı kuyrukta bırakır (panel
 *   "Gönderildi" der, telefon hiç mesaj almaz).
 * - Cihaz listesi alınamazsa (geçici ağ hatası) kayıtlı reg_id ile devam edilir.
 */
async function resolveWaMessageRegId(config) {
  const configured = normalizeRegIdString(config.instanceName);
  let summaries = [];
  let listed = false;
  try {
    const data = await waFetch(config, '/wp/device', { timeoutMs: 20000, retries: 0, allowSoftFail: true });
    summaries = extractDevices(data).map((raw) => ({ raw, ...mapDeviceSummary(raw) }));
    listed = true;
  } catch {
    /* geçici hata — kayıtlı reg_id ile devam */
  }

  if (listed) {
    const own = summaries.find((d) => d.regId === configured);
    if (own?.connected) {
      return { regId: own.regId, phone: own.phone, switched: false, connected: true, devices: summaries };
    }
    const active = summaries.filter((d) => d.connected && d.regId);
    if (active.length > 0) {
      const pick = active.find((d) => d.regId === configured) ?? active[0];
      config.instanceName = pick.regId;
      return {
        regId: pick.regId,
        phone: pick.phone,
        switched: pick.regId !== configured,
        connected: true,
        devices: summaries,
      };
    }
    const rawState = String(own?.raw?.state ?? own?.raw?.status ?? '').trim();
    const connectedIds = summaries.map((d) => d.regId).filter(Boolean).join(', ');
    throw new Error(
      `WhatsApp cihazı bağlı görünmüyor (reg_id ${configured || 'boş'}${rawState ? ` · durum ${rawState}` : ''}). `
      + `Mesaj kuyruğa girmez. WaMessage → WhatsApp Hesaplarım'dan cihazı QR ile yeniden bağlayın`
      + `${connectedIds ? ` (kayıtlı reg_id'ler: ${connectedIds})` : ''}.`,
    );
  }

  if (!configured) {
    throw new Error('reg_id tanımlı değil — WaMessage → WhatsApp Hesaplarım → REG_ID değerini API Ayarlarına kaydedin');
  }
  return { regId: configured, phone: '', switched: false, connected: false, devices: [] };
}

/**
 * Tercih edilen gönderim: POST /bulk/wp/nton
 * Postman SEND-NtoN — target: 905… (artısız), reg_id + message
 */
async function wamessageSendNton(config, messages) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      reg_id: normalizeRegId(m.reg_id ?? m.regId ?? config.instanceName),
      target: toDigits(m.target ?? m.phone ?? ''),
      message: String(m.message ?? '').trim(),
    }))
    .filter((m) => m.reg_id !== '' && m.reg_id != null && m.target && m.message);

  if (!list.length) throw new Error('Gönderilecek mesaj yok');

  const data = await waFetch(config, '/bulk/wp/nton', {
    method: 'POST',
    body: { messages: list },
    timeoutMs: 60000,
    allowSoftFail: true,
  });

  if (!isNtonAck(data)) {
    const detail = pickErrorMessage(data, JSON.stringify(data).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `NtoN gönderilemedi (yanıt: ${JSON.stringify(data).slice(0, 180)})`,
    );
  }
  const ack = waAckInfo(data);
  return { raw: data, reportIds: ack.reportIds, reports: ack.reports, description: ack.description };
}

/**
 * Alternatif: Postman WP-PREVIEW + SEND-WP
 * formdata → { id } onay
 */
async function wamessageSendViaPreview(config, phone, message) {
  const regId = normalizeRegIdString(config.instanceName);
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
  const validCount = Number(
    preview?.data?.count_valid_numbers
    ?? preview?.data?.total_success_members
    ?? preview?.count_valid_numbers
    ?? 1,
  );
  if (previewId == null || previewId === '' || validCount <= 0) {
    const detail = pickErrorMessage(preview, JSON.stringify(preview ?? {}).slice(0, 200), '');
    throw new Error(
      previewId != null && previewId !== '' && validCount <= 0
        ? `Numara geçersiz/blacklist'te (${to}) — gönderim yapılmadı.`
        : detail && detail !== 'WhatsApp API hatası'
          ? detail
          : `Önizleme oluşturulamadı (yanıt: ${JSON.stringify(preview).slice(0, 180)}). API Key, reg_id (${regId}) ve krediyi kontrol edin.`,
    );
  }

  const data = await waFetch(config, '/bulk/wp', {
    method: 'POST',
    body: { id: previewId },
    timeoutMs: 45000,
    allowSoftFail: true,
  });

  if (!isCampaignSendAck(data)) {
    const detail = pickErrorMessage(data, JSON.stringify(data).slice(0, 200), '');
    throw new Error(
      detail && detail !== 'WhatsApp API hatası'
        ? detail
        : `Mesaj gönderilemedi (yanıt: ${JSON.stringify(data).slice(0, 180)}). Cihaz aktif değilse QR yeniden okutun.`,
    );
  }
  const ack = waAckInfo(data);
  return { raw: data, reportIds: ack.reportIds, previewId: String(previewId) };
}

async function wamessageSendMessage(config, phone, message) {
  if (!config.apiKey) throw new Error('API anahtarı tanımlı değil');

  const device = await resolveWaMessageRegId(config);
  const resolvedRegId = normalizeRegIdString(device.regId);
  if (!resolvedRegId) {
    throw new Error('reg_id tanımlı değil — WaMessage → WhatsApp Hesaplarım → REG_ID (ör. 1277) değerini API Ayarlarına kaydedin');
  }
  config.instanceName = resolvedRegId;

  const text = String(message ?? '').trim();
  const digits = toDigits(phone);
  if (!digits || !text) throw new Error('Alıcı ve mesaj zorunlu');

  try {
    const ack = await wamessageSendNton(config, [{ reg_id: resolvedRegId, target: digits, message: text }]);
    return { ...ack, mode: 'api', regId: resolvedRegId, devicePhone: device.phone, path: 'nton' };
  } catch (ntonErr) {
    try {
      const ack = await wamessageSendViaPreview(config, phone, text);
      return { ...ack, mode: 'api', regId: resolvedRegId, devicePhone: device.phone, path: 'campaign' };
    } catch (previewErr) {
      const a = ntonErr instanceof Error ? ntonErr.message : 'NtoN hata';
      const b = previewErr instanceof Error ? previewErr.message : 'Preview hata';
      const hint =
        /veri|bad request|reg_id|cihaz/i.test(`${a} ${b}`)
          ? ` — WaMessage’te REG_ID=${resolvedRegId} Aktif mi ve API Key doğru mu kontrol edin.`
          : '';
      throw new Error(`${a} | yedek: ${b}${hint}`);
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
    await evolutionSendText(config, phone, message);
    return { ok: true, mode: 'api', reportIds: [], regId: config.instanceName || '' };
  }
  const ack = await wamessageSendMessage(config, phone, message);
  return {
    ok: true,
    mode: 'api',
    reportIds: ack.reportIds ?? [],
    reportId: (ack.reportIds ?? [])[0] ?? '',
    regId: ack.regId ?? '',
    path: ack.path ?? 'nton',
    description: ack.description ?? '',
  };
}

function hasUnresolvedTemplateVars(message) {
  return /\{\{\w+\}\}/.test(String(message ?? ''));
}

export async function whatsappSendBulk(config, recipients) {
  const list = (Array.isArray(recipients) ? recipients : [])
    .map((r) => ({
      phone: String(r?.phone ?? '').trim(),
      message: String(r?.message ?? '').trim(),
      logId: r?.logId ? String(r.logId) : '',
      studentId: r?.studentId ? String(r.studentId) : undefined,
      studentName: r?.studentName ? String(r.studentName) : undefined,
      recipientName: r?.recipientName ? String(r.recipientName) : undefined,
      branchOffice: r?.branchOffice ? String(r.branchOffice) : undefined,
      templateKey: r?.templateKey ? String(r.templateKey) : undefined,
    }))
    .filter((r) => r.phone && r.message);

  if (!list.length) return [];

  // Kişisel WP: tek NtoN isteğinde toplu kişiselleştirilmiş gönderim
  if (config.provider !== 'evolution') {
    try {
      const device = await resolveWaMessageRegId(config);
      config.instanceName = normalizeRegIdString(device.regId);
      const ack = await wamessageSendNton(
        config,
        list.map((r) => ({ reg_id: config.instanceName, target: r.phone, message: r.message })),
      );
      return list.map((r) => ({
        phone: r.phone,
        logId: r.logId,
        ok: true,
        mode: 'api',
        reportId: reportIdForPhone(ack.reports, r.phone) || ack.reportIds[0] || '',
      }));
    } catch {
      // tek tek yedek akış
    }
  }

  const results = [];
  for (const r of list) {
    try {
      const ack = await whatsappSendText(config, r.phone, r.message);
      results.push({ phone: r.phone, logId: r.logId, ok: true, mode: 'api', reportId: ack.reportId ?? '' });
    } catch (e) {
      results.push({
        phone: r.phone,
        logId: r.logId,
        ok: false,
        mode: 'failed',
        reportId: '',
        error: e instanceof Error ? e.message : 'Hata',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return results;
}

/**
 * Panel tarayıcısında (localStorage) kayıt yoksa / eksikse sunucudaki
 * whatsapp_config satırını kullan. Otomatik bildirimler zaten bu kaydı
 * kullanır; panel de aynı ayarla çalışsın diye eksik alanlar tamamlanır.
 */
async function withServerConfigFallback(config, env) {
  const missingKey = !String(config.apiKey ?? '').trim();
  const missingInstance = !String(config.instanceName ?? '').trim();
  if (!missingKey && !missingInstance) return config;
  try {
    const sb = await createWhatsAppSupabase(env);
    if (!sb) return config;
    const { data } = await sb.from('whatsapp_config').select('*').eq('id', 'default').maybeSingle();
    if (!data) return config;
    return {
      ...config,
      apiBaseUrl: trimSlash(config.apiBaseUrl) || String(data.api_base_url ?? '').trim() || WAMESSAGE_DEFAULT_BASE,
      apiKey: String(config.apiKey ?? '').trim() || String(data.api_key ?? '').trim(),
      instanceName: String(config.instanceName ?? '').trim() || String(data.instance_name ?? '').trim(),
      enabled: Boolean(config.enabled) || data.enabled === true,
    };
  } catch {
    return config;
  }
}

export async function whatsappApiHandler(method, url, body, env) {
  const parsed = new URL(url || 'http://local', 'http://local');
  const action = parsed.searchParams.get('action') || body?.action || 'status';
  const config = await withServerConfigFallback(resolveConfig(body, env), env);

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

  // Bağlı cihazı sil + yeniden bağlama oturumu aç (cihaz hakkı dolu/kuyruk tıkandı)
  if (action === 'device-reset') {
    if (!config.apiKey) return { status: 400, body: { error: 'API Key gerekli' } };
    try {
      const result = await wamessageResetDevice(config, {
        regId: body?.regId ?? config.instanceName,
        phone: body?.phone ?? config.devicePhone,
        mode: body?.mode === 'qr' ? 'qr' : 'code',
      });
      return { status: 200, body: { ok: true, ...result } };
    } catch (e) {
      return { status: 400, body: { error: e instanceof Error ? e.message : 'Cihaz sıfırlanamadı' } };
    }
  }

  // Hesap bilgisi: kalan WP kredisi (kredi biterse gönderim yapılamaz)
  if (action === 'account') {
    if (!config.apiKey) return { status: 200, body: { apiConfigured: false } };
    try {
      const data = await waFetch(config, '/user/detail', { timeoutMs: 30000, retries: 1, allowSoftFail: true });
      const u = data?.data ?? {};
      const user = u.user ?? {};
      return {
        status: 200,
        body: {
          apiConfigured: true,
          wpCredit: Number(u.wp_credit ?? 0),
          wpEnabled: u.wp_enabled === true,
          name: [user.name, user.surname].filter(Boolean).join(' ') || String(u.user_name ?? ''),
          phone: String(user.phone ?? ''),
        },
      };
    } catch (e) {
      return { status: 200, body: { apiConfigured: true, error: e instanceof Error ? e.message : 'Hesap bilgisi alınamadı' } };
    }
  }

  if (action === 'send') {
    const phone = String(body?.phone ?? '').trim();
    const message = String(body?.message ?? '').trim();
    if (!phone || !message) {
      return { status: 400, body: { error: 'Telefon ve mesaj zorunlu' } };
    }
    if (hasUnresolvedTemplateVars(message)) {
      return {
        status: 200,
        body: {
          ok: false,
          mode: 'failed',
          error: 'Mesajdaki şablon alanları doldurulmadı ({{...}})',
        },
      };
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
    const logBase = {
      id: String(body?.logId ?? '').trim() || genWaLogId(),
      phone,
      message,
      template_key: body?.templateKey ? String(body.templateKey) : null,
      student_id: body?.studentId ? String(body.studentId) : null,
      student_name: body?.studentName ? String(body.studentName) : null,
      recipient_name: body?.recipientName ? String(body.recipientName) : null,
      branch_office: body?.branchOffice ? String(body.branchOffice) : null,
      created_at: new Date().toISOString(),
    };
    try {
      const ack = await whatsappSendText(config, phone, message);
      const reportId = ack.reportId || (ack.reportIds ?? [])[0] || '';
      await logWhatsAppSends(env, [{
        ...logBase,
        status: 'sent',
        provider_report_id: reportId || null,
        delivery_state: reportId ? 'queued' : 'unknown',
        error: null,
      }]);
      return {
        status: 200,
        body: {
          ok: true,
          mode: 'api',
          provider: config.provider,
          logId: logBase.id,
          reportId,
          reportIds: ack.reportIds ?? [],
          path: ack.path ?? '',
          regId: ack.regId ?? '',
        },
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Gönderilemedi';
      await logWhatsAppSends(env, [{
        ...logBase,
        status: 'failed',
        provider_report_id: null,
        delivery_state: 'failed',
        error,
      }]);
      return { status: 200, body: { ok: false, mode: 'failed', logId: logBase.id, error } };
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
    const createdAt = new Date().toISOString();
    const logRows = [];
    for (const r of results) {
      const meta = recipients.find((x) => String(x?.logId ?? '') !== '' && String(x.logId) === String(r.logId ?? ''))
        ?? recipients.find((x) => String(x?.phone ?? '').trim() === r.phone)
        ?? {};
      logRows.push({
        id: String(r.logId ?? '').trim() || genWaLogId(),
        phone: r.phone,
        message: String(meta.message ?? ''),
        status: r.ok ? 'sent' : 'failed',
        template_key: meta.templateKey ? String(meta.templateKey) : null,
        student_id: meta.studentId ? String(meta.studentId) : null,
        student_name: meta.studentName ? String(meta.studentName) : null,
        recipient_name: meta.recipientName ? String(meta.recipientName) : null,
        branch_office: meta.branchOffice ? String(meta.branchOffice) : null,
        provider_report_id: r.reportId ? String(r.reportId) : null,
        delivery_state: r.ok ? (r.reportId ? 'queued' : 'unknown') : 'failed',
        error: r.error ? String(r.error) : null,
        created_at: createdAt,
      });
    }
    await logWhatsAppSends(env, logRows);
    return { status: 200, body: { results, provider: config.provider } };
  }

  if (action === 'delivery-check') {
    const ids = Array.isArray(body?.ids) ? body.ids.map((v) => String(v).trim()).filter(Boolean) : [];
    const limit = Math.min(120, Math.max(1, Number(body?.limit) || 60));
    // Panel kendi günlüklerini gönderir (entries) — veritabanı kolonu gerekmez.
    // Otomatik antrenman bildirimleri için kayıtlar sunucudan okunur.
    let targets = (Array.isArray(body?.entries) ? body.entries : [])
      .map((e) => ({
        id: String(e?.id ?? '').trim(),
        phone: String(e?.phone ?? '').trim(),
        message: String(e?.message ?? ''),
        reportId: String(e?.reportId ?? '').trim(),
      }))
      .filter((e) => e.id && e.phone)
      .slice(0, limit);

    let sb = null;
    if (!targets.length) {
      sb = await createWhatsAppSupabase(env);
      if (!sb) {
        return { status: 503, body: { error: 'Supabase service role yapılandırılmamış — teslim durumu okunamaz.' } };
      }
      const select = 'id, phone, message, status, created_at';
      const query = ids.length
        ? sb.from('whatsapp_message_logs').select(select).in('id', ids)
        : sb
          .from('whatsapp_message_logs')
          .select(select)
          .eq('status', 'sent')
          .order('created_at', { ascending: false })
          .limit(limit);
      const { data, error } = await query;
      if (error) return { status: 500, body: { error: error.message } };
      targets = (data ?? []).map((r) => ({ id: r.id, phone: r.phone, message: r.message, reportId: '' }));
    }

    if (!targets.length) return { status: 200, body: { checked: 0, updated: [], reportCount: 0 } };

    let index;
    try {
      index = await fetchWaReportIndex(config);
    } catch (e) {
      return {
        status: 502,
        body: { error: `Sağlayıcı raporu alınamadı: ${e instanceof Error ? e.message : 'hata'}` },
      };
    }

    const updated = [];
    for (const t of targets) {
      const phone = phoneKey(t.phone);
      const text = normalizeMatchText(t.message);
      const row =
        (t.reportId ? index.byReportId.get(t.reportId) : null)
        ?? index.byPhoneContent.get(`${phone}|${text}`)
        ?? index.byPhonePrefix.get(`${phone}|${text.slice(0, 60)}`)
        ?? null;
      const info = deliveryStateFromReport(row);
      updated.push({
        id: t.id,
        phone: t.phone,
        reportId: row ? String(row.report_id ?? '') : t.reportId,
        deliveryState: info.state,
        success: info.success,
        fail: info.fail,
        note: info.note,
      });
    }

    // provider_report_id/delivery_state kolonları varsa kaydı da güncelle (opsiyonel).
    if (waLogExtrasAvailable !== false) {
      const client = sb ?? (await createWhatsAppSupabase(env));
      if (client) {
        let allFailed = true;
        for (const u of updated) {
          const { error } = await client
            .from('whatsapp_message_logs')
            .update({
              delivery_state: u.deliveryState,
              delivery_checked_at: new Date().toISOString(),
              ...(u.reportId ? { provider_report_id: u.reportId } : {}),
            })
            .eq('id', u.id);
          if (!error) allFailed = false;
        }
        // Hiçbir kayıt güncellenemediyse kolonlar yok kabul et (tekrar denemeyi bırak)
        if (allFailed && waLogExtrasAvailable === null) waLogExtrasAvailable = false;
      }
    }

    return { status: 200, body: { checked: targets.length, updated, reportCount: index.size } };
  }

  if (action === 'settings-get' || action === 'logs' || action === 'settings-save') {
    return handleWhatsAppAdminActions(action, body, env, config);
  }

  return { status: 400, body: { error: 'Geçersiz action' } };
}

/**
 * Panelden gönderilen mesajları sunucu günlüğüne yaz.
 * Böylece "Giden mesajlar" listesi başka cihaz/tarayıcıdan da görünür ve teslim
 * durumu (delivery-check) sonradan güncellenebilir.
 * Yeni kolonlar yoksa yalnızca temel alanlarla yazmayı dener.
 */
/** provider_report_id/delivery_state kolonları var mı? (bir kez denetlenir) */
let waLogExtrasAvailable = null;

async function logWhatsAppSends(env, rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && r.phone);
  if (!list.length) return;
  try {
    const sb = await createWhatsAppSupabase(env);
    if (!sb) return;
    if (waLogExtrasAvailable !== false) {
      const { error } = await sb.from('whatsapp_message_logs').insert(list);
      if (!error) {
        waLogExtrasAvailable = true;
        return;
      }
      // Kolonlar yoksa (migrasyon öncesi) temel alanlarla devam et
      waLogExtrasAvailable = false;
    }
    const minimal = list.map((row) => {
      const { provider_report_id, delivery_state, delivery_checked_at, ...rest } = row;
      return rest;
    });
    await sb.from('whatsapp_message_logs').insert(minimal);
  } catch { /* günlük yazımı gönderimi bozmasın */ }
}

function genWaLogId() {
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

/**
 * Şablonları sunucuya yaz.
 * Kurulumlar arasında şema farkı var: repodaki SQL `key` PK + `updated_at`
 * tanımlar, canlı tabloda ise `id`/`name` zorunlu ve `updated_at` yok. Eski
 * kod tek bir `upsert` deniyor ve hatayı yutuyordu → panel "Şablonlar sunucuya
 * kaydedildi" diyordu ama tek satır yazılmıyordu.
 * Bu yardımcı: önce UPDATE, kayıt yoksa INSERT; iki şemayı da dener ve
 * gerçek hatayı döndürür.
 */
async function saveServerTemplates(sb, list) {
  const errors = [];
  let saved = 0;
  for (const row of list) {
    let { data, error } = await sb
      .from('whatsapp_templates')
      .update({ body: row.body, enabled: row.enabled, updated_at: new Date().toISOString() })
      .eq('key', row.key)
      .select('key');
    if (error) {
      ({ data, error } = await sb
        .from('whatsapp_templates')
        .update({ body: row.body, enabled: row.enabled })
        .eq('key', row.key)
        .select('key'));
    }
    if (error) {
      errors.push(`${row.key}: ${error.message}`);
      continue;
    }
    if (Array.isArray(data) && data.length > 0) {
      saved += 1;
      continue;
    }
    let ins = await sb
      .from('whatsapp_templates')
      .insert({ id: row.key, key: row.key, name: row.name, body: row.body, enabled: row.enabled })
      .select('key');
    if (ins.error) {
      ins = await sb
        .from('whatsapp_templates')
        .insert({ key: row.key, body: row.body, enabled: row.enabled })
        .select('key');
    }
    if (ins.error) {
      errors.push(`${row.key}: ${ins.error.message}`);
      continue;
    }
    saved += 1;
  }
  return { saved, error: errors[0] ?? '' };
}

/** Otomatik kuralları sunucuya yaz — saveServerTemplates ile aynı şema toleransı. */
async function saveServerAutoRules(sb, list) {
  const errors = [];
  let saved = 0;
  for (const row of list) {
    let { data, error } = await sb
      .from('whatsapp_auto_rules')
      .update({ enabled: row.enabled, template_key: row.templateKey ?? null, updated_at: new Date().toISOString() })
      .eq('event', row.event)
      .select('event');
    if (error) {
      ({ data, error } = await sb
        .from('whatsapp_auto_rules')
        .update({ enabled: row.enabled })
        .eq('event', row.event)
        .select('event'));
    }
    if (error) {
      errors.push(`${row.event}: ${error.message}`);
      continue;
    }
    if (Array.isArray(data) && data.length > 0) {
      saved += 1;
      continue;
    }
    let ins = await sb
      .from('whatsapp_auto_rules')
      .insert({ event: row.event, enabled: row.enabled, template_key: row.templateKey ?? null })
      .select('event');
    if (ins.error) {
      ins = await sb.from('whatsapp_auto_rules').insert({ event: row.event, enabled: row.enabled }).select('event');
    }
    if (ins.error) {
      errors.push(`${row.event}: ${ins.error.message}`);
      continue;
    }
    saved += 1;
  }
  return { saved, error: errors[0] ?? '' };
}

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
    const extendedSelect = `${baseSelect}, recipient_name, provider_report_id, delivery_state, delivery_checked_at`;
    let data;
    let error;
    ({ data, error } = await sb
      .from('whatsapp_message_logs')
      .select(extendedSelect)
      .order('created_at', { ascending: false })
      .limit(limit));
    if (error) {
      ({ data, error } = await sb
        .from('whatsapp_message_logs')
        .select(`${baseSelect}, recipient_name`)
        .order('created_at', { ascending: false })
        .limit(limit));
    }
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
      providerReportId: row.provider_report_id,
      deliveryState: row.delivery_state,
      deliveryCheckedAt: row.delivery_checked_at,
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
      // Canlı whatsapp_templates şemasında id/name zorunlu, updated_at yok →
      // tek bir upsert sessizce başarısız oluyordu, şablonlar hiç yazılmıyordu.
      await saveServerTemplates(
        sb,
        toSeed.map((t) => ({ key: t.key, name: t.key, body: t.body, enabled: t.enabled !== false })),
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
  }    if (action === 'settings-save') {
    const nextConfig = body?.config && typeof body.config === 'object' ? body.config : null;
    const templates = Array.isArray(body?.templates) ? body.templates : null;
    const rules = Array.isArray(body?.rules) ? body.rules : null;
    const deliveryRules = Array.isArray(body?.deliveryRules) ? body.deliveryRules : null;
    /** Yazılamayan alanlar — panel "kaydedildi" demesin diye istemciye döner */
    const warnings = [];

    if (nextConfig) {
      const { data: prevRow } = await sb
        .from('whatsapp_config')
        .select('api_key, enabled, api_base_url, instance_name')
        .eq('id', 'default')
        .maybeSingle();
      const prevKey = String(prevRow?.api_key ?? '').trim();
      const incomingKey = String(nextConfig.apiKey ?? '').trim();
      const keepMasked = incomingKey.includes('…') || incomingKey.includes('...');
      // SADECE istemcinin gerçekten gönderdiği alanlar yazılır.
      // Önceden `enabled: Boolean(nextConfig.enabled)` yazılıyordu; panel başka
      // bir alanı (ör. API adresi veya telefon) kaydettiğinde localStorage'daki
      // bayat `enabled:false` sunucuya yazılıyor ve otomatik gönderim sessizce
      // kapanıyordu.
      const patch = { id: 'default', updated_at: new Date().toISOString() };
      if ('apiBaseUrl' in nextConfig) {
        patch.api_base_url = String(nextConfig.apiBaseUrl ?? '').trim() || null;
      }
      if ('apiKey' in nextConfig) {
        patch.api_key = keepMasked ? (prevKey || null) : (incomingKey || prevKey || null);
      }
      if ('instanceName' in nextConfig) {
        patch.instance_name = String(nextConfig.instanceName ?? '').trim() || null;
      }
      if (typeof nextConfig.enabled === 'boolean') {
        patch.enabled = nextConfig.enabled;
      } else if (prevRow == null) {
        // Satır hiç yoksa API Key varsa açık kabul et
        patch.enabled = Boolean(incomingKey || prevKey);
      }
      const { error } = await sb.from('whatsapp_config').upsert(patch);
      if (error) warnings.push(`Ayarlar kaydedilemedi: ${error.message}`);
    }

    if (templates) {
      const rows = templates
        .filter((t) => t && t.key)
        .map((t) => ({
          key: String(t.key),
          name: String(t.name ?? t.key),
          body: String(t.body ?? ''),
          enabled: t.enabled !== false,
        }));
      if (rows.length > 0) {
        const res = await saveServerTemplates(sb, rows);
        if (res.error) warnings.push(`Şablonlar kaydedilemedi (${res.error})`);
      }
    }

    if (rules) {
      const rows = rules
        .filter((r) => r && r.event)
        .map((r) => ({
          event: String(r.event),
          enabled: Boolean(r.enabled),
          templateKey: r.templateKey ? String(r.templateKey) : null,
        }));
      if (rows.length > 0) {
        const res = await saveServerAutoRules(sb, rows);
        if (res.error) warnings.push(`Otomatik kurallar kaydedilemedi (${res.error})`);
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
        templateKey: null,
      }));
      if (waRows.length > 0) {
        const res = await saveServerAutoRules(sb, waRows);
        if (res.error) warnings.push(`Kanallar kaydedilemedi (${res.error})`);
      }
    }

    return { status: 200, body: { ok: warnings.length === 0, warnings } };
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
