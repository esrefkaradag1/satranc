import type { Student, WhatsAppMessageLog, WhatsAppMessageStatus, WhatsAppConfig, WhatsAppTemplate } from '../types';
import { openWhatsAppSend, parseWhatsAppGreetingName } from '../lib/whatsappUtils';
import {
  appendWhatsAppLog,
  loadWhatsAppAutoRules,
  loadWhatsAppConfig,
  loadWhatsAppTemplates,
  saveWhatsAppConfig,
} from '../lib/whatsappStorage';
import {
  buildStudentTemplateVars,
  findTemplate,
  renderWhatsAppTemplate,
} from '../lib/whatsappTemplates';
import { parentPhonesForStudent } from '../lib/whatsappPhones';
import { isStudentNotificationsEnabled } from '../lib/studentNotificationUtils';

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function writeWhatsAppLog(entry: Omit<WhatsAppMessageLog, 'id' | 'createdAt'> & { message: string }) {
  appendWhatsAppLog({
    id: genId(),
    createdAt: new Date().toISOString(),
    ...entry,
    recipientName: entry.recipientName ?? parseWhatsAppGreetingName(entry.message),
  });
}

type SendResult = { ok: boolean; mode: 'api' | 'manual' | 'failed'; error?: string };

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
  if (data.error && action !== 'status' && action !== 'devices' && action !== 'send-bulk' && action !== 'send') {
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

  try {
    const data = await callWhatsAppApi('send', { phone, message });
    if (data.ok && data.mode === 'api') {
      result = { ok: true, mode: 'api' };
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
    phone,
    message,
    status,
    templateKey: options.templateKey,
    studentId: options.studentId,
    studentName: options.studentName,
    recipientName: options.recipientName,
    branchOffice: options.branchOffice,
    error: result.error,
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
    const data = await callWhatsAppApi('send-bulk', {
      recipients: activeRecipients,
      delayMs: options?.delayMs ?? 1500,
    });
    const results = (data.results as { phone: string; ok: boolean; mode: string; error?: string }[]) ?? [];
    if (!Array.isArray(data.results)) {
      return {
        sent: 0,
        failed: recipients.length,
        manual: 0,
        error: String(data.error || 'Gönderim yanıtı geçersiz — sunucuyu yenileyip tekrar deneyin'),
      };
    }
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rec = recipients.find((x) => x.phone === r.phone) ?? recipients[i];
      if (r.ok && r.mode === 'api') {
        sent += 1;
        writeWhatsAppLog({
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'sent',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          recipientName: rec?.recipientName,
          branchOffice: options?.branchOffice,
        });
      } else if (r.mode === 'manual' && rec) {
        if (allowWeb) {
          openWhatsAppSend(rec.phone, rec.message);
          manual += 1;
          writeWhatsAppLog({
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

export async function saveWhatsAppServerSettings(payload: {
  config?: Partial<WhatsAppConfig>;
  templates?: WhatsAppTemplate[];
  rules?: { event: string; enabled: boolean; templateKey?: string }[];
  deliveryRules?: { event: string; channel: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await callWhatsAppApi('settings-save', payload as Record<string, unknown>);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Kayıt başarısız' };
  }
}

/** Sunucu gönderim günlüğü (otomatik antrenman dahil) */
export async function fetchWhatsAppServerLogs(limit = 80): Promise<WhatsAppMessageLog[]> {
  try {
    const data = await callWhatsAppApi('logs', { limit });
    const rows = (data.logs as WhatsAppMessageLog[]) ?? [];
    return rows;
  } catch {
    return [];
  }
}

