import type {
  Student,
  WhatsAppDeliveryState,
  WhatsAppMessageLog,
  WhatsAppMessageStatus,
  WhatsAppConfig,
  WhatsAppTemplate,
} from '../types';
import { openWhatsAppSend, parseWhatsAppGreetingName } from '../lib/whatsappUtils';
import {
  appendWhatsAppLog,
  loadWhatsAppAutoRules,
  loadWhatsAppConfig,
  loadWhatsAppTemplates,
  patchWhatsAppLogs,
  saveWhatsAppConfig,
  saveWhatsAppDeliveryEntries,
} from '../lib/whatsappStorage';
import {
  buildStudentTemplateVars,
  findTemplate,
  renderWhatsAppTemplate,
  hasUnresolvedWhatsAppTemplateVars,
} from '../lib/whatsappTemplates';
import { parentPhonesForStudent } from '../lib/whatsappPhones';
import { isStudentNotificationsEnabled } from '../lib/studentNotificationUtils';

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function writeWhatsAppLog(
  entry: Omit<WhatsAppMessageLog, 'id' | 'createdAt'> & { message: string; id?: string },
) {
  appendWhatsAppLog({
    id: entry.id ?? genId(),
    createdAt: new Date().toISOString(),
    ...entry,
    recipientName: entry.recipientName ?? parseWhatsAppGreetingName(entry.message),
  });
}

type SendResult = {
  ok: boolean;
  mode: 'api' | 'manual' | 'failed';
  error?: string;
  /** Sunucuya yazılan günlük kaydının id'si (yerel kayıtla aynı id → tekrar görünmez) */
  logId?: string;
  /** Sağlayıcı rapor kimliği — teslim durumu bu id ile sorgulanır */
  reportId?: string;
  deliveryState?: WhatsAppDeliveryState;
};

/** API Key + reg_id tanımlı mı (WaMessage otomatik gönderim için) */
export function isWhatsAppApiConfigured(config?: WhatsAppConfig): boolean {
  const c = config ?? loadWhatsAppConfig();
  return Boolean(String(c.apiKey ?? '').trim() && String(c.instanceName ?? '').trim());
}

/** Tarayıcıda wa.me / WhatsApp Web açılsın mı? Yapılandırılmış API varken asla açma. */
function shouldOpenWhatsAppWeb(config: WhatsAppConfig, explicit?: boolean): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  if (isWhatsAppApiConfigured(config)) return false;
  return !config.enabled;
}

async function callWhatsAppApi(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const config = loadWhatsAppConfig();
  const res = await fetch(`/api/whatsapp?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action, config }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || 'API hatası'));
  }
  if (
    data.error
    && action !== 'status'
    && action !== 'devices'
    && action !== 'send-bulk'
    && action !== 'send'
    && action !== 'delivery-check'
  ) {
    throw new Error(String(data.error));
  }
  return data;
}

export async function fetchWhatsAppStatus(): Promise<{
  connected: boolean;
  state: string;
  apiConfigured: boolean;
  provider?: string;
  regId?: string;
  phone?: string;
  devices?: { regId: string; phone: string; connected: boolean }[];
  authMode?: string;
  error?: string;
  regIdMismatch?: boolean;
}> {
  const config = loadWhatsAppConfig();
  const res = await fetch('/api/whatsapp?action=status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', config }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    connected?: boolean;
    state?: string;
    apiConfigured?: boolean;
    provider?: string;
    regId?: string;
    phone?: string;
    devices?: { regId: string; phone: string; connected: boolean }[];
    authMode?: string;
    error?: string;
    regIdMismatch?: boolean;
  };
  // Çalışan auth modunu kalıcı kaydet
  if (data.authMode && data.authMode !== config.authMode) {
    saveWhatsAppConfig({ ...config, authMode: data.authMode as WhatsAppConfig['authMode'] });
  }
  // Paneldeki aktif cihaz tekse ve reg_id boş/yanlışsa öneriyi yazma — UI'da seçilir
  return {
    connected: Boolean(data.connected),
    state: data.state || 'pasif',
    apiConfigured: data.apiConfigured ?? Boolean(config.apiKey?.trim()),
    provider: data.provider || config.provider,
    regId: data.regId,
    phone: data.phone,
    devices: data.devices,
    authMode: data.authMode,
    error: data.error,
    regIdMismatch: data.regIdMismatch,
  };
}

export async function fetchWhatsAppDevices(): Promise<
  { regId: string; phone: string; connected: boolean }[]
> {
  const data = await callWhatsAppApi('devices');
  return (data.devices as { regId: string; phone: string; connected: boolean }[]) ?? [];
}

/** QR üret + regId döndür (panel “bağlı” yetmez; kendi API Key oturumunda QR okutulmalı) */
export async function fetchWhatsAppQr(phone?: string): Promise<{
  base64: string;
  qr: string;
  regId: string;
  phone: string;
  pairCode?: string;
}> {
  const data = await callWhatsAppApi('qr', phone ? { phone } : {});
  const base64 = String(data.base64 ?? '');
  const qr = String(data.qr ?? '');
  const regId = String(data.regId ?? '');
  if (!base64 && !qr) {
    const pair = String(data.pairCode ?? '');
    if (pair) throw new Error(`QR görseli yok; eşleştirme kodu: ${pair}`);
    throw new Error('QR alınamadı — gönderici telefonu (905…) API ayarlarına girin');
  }
  return {
    base64: base64.startsWith('data:') || base64.startsWith('http')
      ? base64
      : base64
        ? `data:image/png;base64,${base64}`
        : '',
    qr,
    regId,
    phone: String(data.phone ?? ''),
    pairCode: data.pairCode ? String(data.pairCode) : undefined,
  };
}

/** QR sonrası cihaz kontrolü (~30 sn sürebilir) */
export async function waitWhatsAppDeviceLogin(
  regId: string,
  phone: string,
): Promise<{ ok: boolean; regId: string }> {
  const data = await callWhatsAppApi('device-check', { regId, phone });
  return { ok: Boolean(data.ok), regId: String(data.regId ?? regId) };
}

export async function fetchWhatsAppPairCode(phone?: string): Promise<{ code: string; regId?: string }> {
  const data = await callWhatsAppApi('pair-code', phone ? { phone } : {});
  return {
    code: String(data.code ?? ''),
    regId: data.regId ? String(data.regId) : undefined,
  };
}

export async function sendWhatsAppMessage(options: {
  phone: string;
  message: string;
  studentId?: string;
  studentName?: string;
  recipientName?: string;
  branchOffice?: string;
  templateKey?: WhatsAppMessageLog['templateKey'];
  openManualFallback?: boolean;
  /** Pasif öğrenciye gönderimi engellemek için (varsayılan: engelle). */
  studentStatus?: Student['status'];
  allowInactiveStudent?: boolean;
}): Promise<SendResult> {
  const { phone, message, openManualFallback } = options;
  if (hasUnresolvedWhatsAppTemplateVars(message)) {
    const err = 'Mesajdaki şablon alanları doldurulmadı ({{...}}). Gönderim iptal edildi.';
    writeWhatsAppLog({
      phone,
      message,
      status: 'failed',
      templateKey: options.templateKey,
      studentId: options.studentId,
      studentName: options.studentName,
      recipientName: options.recipientName,
      branchOffice: options.branchOffice,
      error: err,
    });
    return { ok: false, mode: 'failed', error: err };
  }
  if (
    options.studentStatus === 'inactive'
    && options.allowInactiveStudent !== true
  ) {
    writeWhatsAppLog({
      phone,
      message,
      status: 'failed',
      templateKey: options.templateKey,
      studentId: options.studentId,
      studentName: options.studentName,
      recipientName: options.recipientName,
      branchOffice: options.branchOffice,
      error: 'Pasif öğrenci — mesaj gönderilmedi',
    });
    return { ok: false, mode: 'failed', error: 'Pasif öğrenci — mesaj gönderilmedi' };
  }

  let result: SendResult = { ok: false, mode: 'failed' };
  const config = loadWhatsAppConfig();
  const allowWeb = shouldOpenWhatsAppWeb(config, openManualFallback);
  // Sunucu günlüğüyle aynı kaydı paylaşmak için id burada üretilir
  const logId = genId();

  try {
    const data = await callWhatsAppApi('send', {
      phone,
      message,
      logId,
      studentId: options.studentId,
      studentName: options.studentName,
      recipientName: options.recipientName,
      branchOffice: options.branchOffice,
      templateKey: options.templateKey,
    });
    if (data.ok && data.mode === 'api') {
      const reportId = String(data.reportId ?? '');
      result = {
        ok: true,
        mode: 'api',
        logId: String(data.logId ?? logId),
        reportId,
        deliveryState: reportId ? 'queued' : 'unknown',
      };
    } else if (data.mode === 'manual') {
      const err = String(
        data.error ?? 'API ile otomatik gönderim kapalı — WhatsApp Yönetimi → API Ayarlarından açın.',
      );
      if (allowWeb) {
        openWhatsAppSend(phone, message);
        result = { ok: true, mode: 'manual', error: err };
      } else {
        result = { ok: false, mode: 'failed', error: err };
      }
    } else {
      result = { ok: false, mode: 'failed', error: String(data.error ?? 'Gönderilemedi') };
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Hata';
    if (allowWeb) {
      openWhatsAppSend(phone, message);
      result = { ok: true, mode: 'manual' };
    } else {
      result = { ok: false, mode: 'failed', error: err };
    }
  }

  const status: WhatsAppMessageStatus = result.ok
    ? result.mode === 'api'
      ? 'sent'
      : 'manual'
    : 'failed';

  writeWhatsAppLog({
    id: result.logId ?? logId,
    phone,
    message,
    status,
    templateKey: options.templateKey,
    studentId: options.studentId,
    studentName: options.studentName,
    recipientName: options.recipientName,
    branchOffice: options.branchOffice,
    error: result.error,
    providerReportId: result.reportId,
    deliveryState: result.deliveryState,
  });

  return result;
}

export async function sendWhatsAppBulk(
  recipients: {
    phone: string;
    message: string;
    studentId?: string;
    studentName?: string;
    recipientName?: string;
    studentStatus?: Student['status'];
  }[],
  options?: { delayMs?: number; branchOffice?: string },
): Promise<{ sent: number; failed: number; manual: number; error?: string }> {
  const config = loadWhatsAppConfig();
  const allowWeb = shouldOpenWhatsAppWeb(config);
  const activeRecipients = recipients.filter(
    (rec) => rec.studentStatus !== 'inactive' || !rec.studentId,
  );
  let sent = 0;
  let failed = 0;
  let manual = 0;
  let firstError = '';
  const skippedInactive = recipients.length - activeRecipients.length;
  if (skippedInactive > 0 && !firstError) {
    firstError = `${skippedInactive} pasif öğrenci atlandı`;
  }

  if (config.enabled && (config.apiKey || config.apiBaseUrl)) {
    // Her alıcıya bir günlük id'si verilir: sunucu aynı id ile kaydeder, panelde tek satır görünür.
    const withIds = activeRecipients.map((rec) => ({ ...rec, logId: genId() }));
    const data = await callWhatsAppApi('send-bulk', {
      recipients: withIds,
      delayMs: options?.delayMs ?? 1500,
    });
    const results = (data.results as {
      phone: string;
      logId?: string;
      ok: boolean;
      mode: string;
      error?: string;
      reportId?: string;
    }[]) ?? [];
    if (!Array.isArray(data.results)) {
      return {
        sent: 0,
        failed: recipients.length,
        manual: 0,
        error: String(data.error || 'Gönderim yanıtı geçersiz — sunucuyu yenileyip tekrar deneyin'),
      };
    }
    for (const r of results) {
      const rec = withIds.find((x) => r.logId && x.logId === r.logId)
        ?? withIds.find((x) => x.phone === r.phone);
      const logId = r.logId ?? rec?.logId ?? genId();
      if (r.ok && r.mode === 'api') {
        sent += 1;
        const reportId = String(r.reportId ?? '');
        writeWhatsAppLog({
          id: logId,
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'sent',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          recipientName: rec?.recipientName,
          branchOffice: options?.branchOffice,
          providerReportId: reportId || undefined,
          deliveryState: reportId ? 'queued' : 'unknown',
        });
      } else if (r.mode === 'manual' && rec) {
        if (allowWeb) {
          openWhatsAppSend(rec.phone, rec.message);
          manual += 1;
          writeWhatsAppLog({
            id: logId,
            phone: rec.phone,
            message: rec.message,
            status: 'manual',
            studentId: rec.studentId,
            studentName: rec.studentName,
            recipientName: rec.recipientName,
            branchOffice: options?.branchOffice,
          });
        } else {
          failed += 1;
          if (!firstError) firstError = r.error || 'Otomatik gönderim kapalı';
          writeWhatsAppLog({
            id: logId,
            phone: r.phone,
            message: rec?.message ?? '',
            status: 'failed',
            studentId: rec?.studentId,
            studentName: rec?.studentName,
            recipientName: rec?.recipientName,
            branchOffice: options?.branchOffice,
            error: r.error || 'Otomatik gönderim kapalı',
          });
        }
      } else {
        failed += 1;
        if (!firstError && r.error) firstError = r.error;
        writeWhatsAppLog({
          id: logId,
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'failed',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          recipientName: rec?.recipientName,
          branchOffice: options?.branchOffice,
          error: r.error || 'Toplu gönderim hatası',
        });
      }
    }
    return { sent, failed, manual, error: firstError || undefined };
  }

  for (const rec of activeRecipients) {
    const r = await sendWhatsAppMessage({
      phone: rec.phone,
      message: rec.message,
      studentId: rec.studentId,
      studentName: rec.studentName,
      studentStatus: rec.studentStatus,
      branchOffice: options?.branchOffice,
    });
    if (r.ok && r.mode === 'api') sent += 1;
    else if (r.ok && r.mode === 'manual') manual += 1;
    else {
      failed += 1;
      if (!firstError && r.error) firstError = r.error;
    }
    await new Promise((resolve) => setTimeout(resolve, options?.delayMs ?? 800));
  }
  return { sent, failed, manual, error: firstError || undefined };
}

export type WhatsAppAutoContext = {
  student?: Student;
  formUrl?: string;
  lessonName?: string;
  lessonUrl?: string;
  branchOffice?: string;
};

/** Veli giriş bilgileri toplu gönder */
export async function sendParentLoginBulk(
  students: Student[],
  branchOffice?: string,
): Promise<{ sent: number; failed: number; manual: number }> {
  const templates = loadWhatsAppTemplates();
  const tpl = findTemplate(templates, 'parent_login');
  if (!tpl) return { sent: 0, failed: 0, manual: 0 };

  const recipients: {
    phone: string;
    message: string;
    studentId: string;
    studentName: string;
    studentStatus?: Student['status'];
  }[] = [];
  for (const student of students) {
    if (!isStudentNotificationsEnabled(student)) continue;
    if (branchOffice && student.branchOffice !== branchOffice) continue;
    const phones = parentPhonesForStudent(student);
    if (!phones.length) continue;
    const vars = buildStudentTemplateVars(student, {
      giris_linki: `${window.location.origin}${window.location.pathname}#/`,
    });
    const message = renderWhatsAppTemplate(tpl.body, vars);
    for (const phone of phones) {
      recipients.push({
        phone,
        message,
        studentId: student.id,
        studentName: student.name,
        studentStatus: student.status,
      });
    }
  }
  return sendWhatsAppBulk(recipients, { branchOffice, delayMs: 1500 });
}

/** Sunucu (Supabase) şablon / kural / config — otomatik antrenman bildirimleri bunu kullanır */
export async function fetchWhatsAppServerSettings(): Promise<{
  config: {
    provider?: string;
    apiBaseUrl: string;
    apiKey: string;
    apiKeySet: boolean;
    instanceName: string;
    enabled: boolean;
  };
  templates: { key: string; body: string; enabled: boolean }[];
  rules: { event: string; enabled: boolean }[];
  deliveryRules?: { event: string; channel: string }[];
  scheduler?: { eveningHourTr: number; pollIntervalMin: number; kinds: string[] };
} | null> {
  try {
    const data = await callWhatsAppApi('settings-get');
    return {
      config: data.config as {
        provider?: string;
        apiBaseUrl: string;
        apiKey: string;
        apiKeySet: boolean;
        instanceName: string;
        enabled: boolean;
      },
      templates: (data.templates as { key: string; body: string; enabled: boolean }[]) ?? [],
      rules: (data.rules as { event: string; enabled: boolean }[]) ?? [],
      deliveryRules: (data.deliveryRules as { event: string; channel: string }[]) ?? [],
      scheduler: data.scheduler as { eveningHourTr: number; pollIntervalMin: number; kinds: string[] } | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Sunucu ayarlarını kaydet.
 * `config` içinde YALNIZCA gönderilen alanlar yazılır: `enabled` gönderilmezse
 * sunucudaki değer korunur (panel başka bir alanı kaydederken otomatik gönderimi
 * yanlışlıkla kapatmasın).
 * Sunucu şablon/kural yazamadığında `warnings` döner → `ok:false`.
 */
export async function saveWhatsAppServerSettings(payload: {
  config?: Partial<WhatsAppConfig>;
  templates?: WhatsAppTemplate[];
  rules?: { event: string; enabled: boolean; templateKey?: string }[];
  deliveryRules?: { event: string; channel: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await callWhatsAppApi('settings-save', payload as Record<string, unknown>);
    const warnings = Array.isArray(data.warnings) ? (data.warnings as string[]) : [];
    return warnings.length ? { ok: false, error: warnings.join(' · ') } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Kayıt başarısız' };
  }
}

/**
 * Kalan WP kredisi / hesap durumu.
 * Kredi 0 ise sağlayıcı gönderimleri kabul etmez — panelde gösterilir.
 */
export async function fetchWhatsAppAccount(): Promise<{
  wpCredit?: number;
  wpEnabled?: boolean;
  name?: string;
  phone?: string;
  error?: string;
}> {
  try {
    const data = await callWhatsAppApi('account');
    return {
      wpCredit: typeof data.wpCredit === 'number' ? data.wpCredit : undefined,
      wpEnabled: data.wpEnabled === true,
      name: data.name ? String(data.name) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      error: data.error ? String(data.error) : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Hesap bilgisi alınamadı' };
  }
}

/**
 * Bağlı cihazı sil + yeniden bağlama (kod veya QR) oturumu aç.
 *
 * "maksimum cihaz sayısına ulaşıldı" hatasında ve cihaz API'de bağlı görünüp
 * mesajları kuyrukta bıraktığında tek çözüm budur: eski kayıt silinir, cihaz
 * hakkı boşalır ve WhatsApp'a yeni bir kod/QR ile bağlanılır.
 */
export async function resetWhatsAppDevice(options?: {
  regId?: string;
  phone?: string;
  mode?: 'code' | 'qr';
}): Promise<{
  ok: boolean;
  mode: 'code' | 'qr';
  deleted: boolean;
  deleteError?: string;
  deletedRegId?: string;
  regId?: string;
  phone?: string;
  pairCode?: string;
  qr?: string;
  base64?: string;
  error?: string;
}> {
  const data = await callWhatsAppApi('device-reset', {
    regId: options?.regId,
    phone: options?.phone,
    mode: options?.mode ?? 'code',
  });
  return {
    ok: Boolean(data.ok),
    mode: data.mode === 'qr' ? 'qr' : 'code',
    deleted: Boolean(data.deleted),
    deleteError: data.deleteError ? String(data.deleteError) : undefined,
    deletedRegId: data.deletedRegId ? String(data.deletedRegId) : undefined,
    regId: data.regId ? String(data.regId) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    pairCode: data.pairCode ? String(data.pairCode) : undefined,
    qr: data.qr ? String(data.qr) : undefined,
    base64: data.base64 ? String(data.base64) : undefined,
  };
}

/** Sunucu gönderim günlüğü (otomatik antrenman dahil) */
/**
 * Sağlayıcıya sorup mesajların gerçek teslim durumunu döndürür.
 * `sent` yalnızca "sağlayıcı isteği kabul etti" demektir; bu kontrol
 * "kuyrukta kaldı / iletildi / başarısız" ayrımını verir.
 */
export async function checkWhatsAppDelivery(
  entries: { id: string; phone: string; message: string; reportId?: string }[],
): Promise<{ updated: WhatsAppDeliveryCheckRow[]; error?: string }> {
  const payload = entries
    .filter((e) => e?.id && e?.phone)
    .slice(0, 60)
    .map((e) => ({
      id: e.id,
      phone: e.phone,
      message: e.message,
      reportId: e.reportId ?? '',
    }));
  if (!payload.length) return { updated: [] };
  try {
    const data = await callWhatsAppApi('delivery-check', { entries: payload });
    if (data.error) return { updated: [], error: String(data.error) };
    const updated = (data.updated as WhatsAppDeliveryCheckRow[]) ?? [];
    // Yerel günlük kayıtlarını güncelle
    patchWhatsAppLogs(
      updated.map((u) => ({
        id: u.id,
        deliveryState: u.deliveryState,
        providerReportId: u.reportId,
        note: u.note,
        status: u.deliveryState === 'failed' ? ('failed' as WhatsAppMessageStatus) : undefined,
      })),
    );
    // Sunucudan gelen kayıtlar için de durumu sakla (başka tarayıcıda da görünür)
    saveWhatsAppDeliveryEntries(
      updated.map((u) => ({
        id: u.id,
        deliveryState: u.deliveryState,
        note: u.note,
        reportId: u.reportId,
      })),
    );
    return { updated };
  } catch (e) {
    return { updated: [], error: e instanceof Error ? e.message : 'Teslim durumu alınamadı' };
  }
}

export type WhatsAppDeliveryCheckRow = {
  id: string;
  phone: string;
  reportId?: string;
  deliveryState: WhatsAppDeliveryState;
  success?: number;
  fail?: number;
  note?: string;
};

export async function fetchWhatsAppServerLogs(limit = 80): Promise<WhatsAppMessageLog[]> {
  try {
    const data = await callWhatsAppApi('logs', { limit });
    const rows = (data.logs as WhatsAppMessageLog[]) ?? [];
    return rows;
  } catch {
    return [];
  }
}

