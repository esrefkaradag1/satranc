import type { Student, WhatsAppMessageLog, WhatsAppMessageStatus } from '../types';
import { openWhatsAppSend } from '../lib/whatsappUtils';
import {
  appendWhatsAppLog,
  loadWhatsAppAutoRules,
  loadWhatsAppConfig,
  loadWhatsAppTemplates,
} from '../lib/whatsappStorage';
import {
  buildStudentTemplateVars,
  findTemplate,
  renderWhatsAppTemplate,
} from '../lib/whatsappTemplates';
import { parentPhonesForStudent } from '../lib/whatsappPhones';

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

type SendResult = { ok: boolean; mode: 'api' | 'manual' | 'failed'; error?: string };

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
    error?: string;
  };
  return {
    connected: Boolean(data.connected),
    state: data.state || 'pasif',
    apiConfigured: data.apiConfigured ?? Boolean(config.apiKey?.trim()),
    provider: data.provider || config.provider,
    regId: data.regId,
    phone: data.phone,
    devices: data.devices,
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
  branchOffice?: string;
  templateKey?: WhatsAppMessageLog['templateKey'];
  openManualFallback?: boolean;
}): Promise<SendResult> {
  const { phone, message, openManualFallback = true } = options;
  let result: SendResult = { ok: false, mode: 'failed' };
  const config = loadWhatsAppConfig();

  try {
    const data = await callWhatsAppApi('send', { phone, message });
    if (data.ok && data.mode === 'api') {
      result = { ok: true, mode: 'api' };
    } else if (data.mode === 'manual') {
      if (openManualFallback) {
        openWhatsAppSend(phone, message);
        result = { ok: true, mode: 'manual', error: String(data.error ?? '') };
      } else {
        result = { ok: false, mode: 'failed', error: String(data.error ?? 'API kapalı') };
      }
    } else {
      result = { ok: false, mode: 'failed', error: String(data.error ?? 'Gönderilemedi') };
    }
  } catch (e) {
    if (openManualFallback && !config.enabled) {
      openWhatsAppSend(phone, message);
      result = { ok: true, mode: 'manual' };
    } else {
      result = { ok: false, mode: 'failed', error: e instanceof Error ? e.message : 'Hata' };
    }
  }

  const status: WhatsAppMessageStatus = result.ok
    ? result.mode === 'api'
      ? 'sent'
      : 'manual'
    : 'failed';

  appendWhatsAppLog({
    id: genId(),
    phone,
    message,
    status,
    templateKey: options.templateKey,
    studentId: options.studentId,
    studentName: options.studentName,
    branchOffice: options.branchOffice,
    error: result.error,
    createdAt: new Date().toISOString(),
  });

  return result;
}

export async function sendWhatsAppBulk(
  recipients: { phone: string; message: string; studentId?: string; studentName?: string }[],
  options?: { delayMs?: number; branchOffice?: string },
): Promise<{ sent: number; failed: number; manual: number; error?: string }> {
  const config = loadWhatsAppConfig();
  let sent = 0;
  let failed = 0;
  let manual = 0;
  let firstError = '';

  if (config.enabled && (config.apiKey || config.apiBaseUrl)) {
    const data = await callWhatsAppApi('send-bulk', {
      recipients,
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
        appendWhatsAppLog({
          id: genId(),
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'sent',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          branchOffice: options?.branchOffice,
          createdAt: new Date().toISOString(),
        });
      } else if (r.mode === 'manual' && rec) {
        openWhatsAppSend(rec.phone, rec.message);
        manual += 1;
        appendWhatsAppLog({
          id: genId(),
          phone: rec.phone,
          message: rec.message,
          status: 'manual',
          studentId: rec.studentId,
          studentName: rec.studentName,
          branchOffice: options?.branchOffice,
          createdAt: new Date().toISOString(),
        });
      } else {
        failed += 1;
        if (!firstError && r.error) firstError = r.error;
        appendWhatsAppLog({
          id: genId(),
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'failed',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          branchOffice: options?.branchOffice,
          error: r.error || 'Toplu gönderim hatası',
          createdAt: new Date().toISOString(),
        });
      }
    }
    return { sent, failed, manual, error: firstError || undefined };
  }

  for (const rec of recipients) {
    const r = await sendWhatsAppMessage({
      phone: rec.phone,
      message: rec.message,
      studentId: rec.studentId,
      studentName: rec.studentName,
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

export async function triggerWhatsAppAuto(
  event: 'parent_login' | 'parent_consent' | 'lesson_start' | 'training_completed' | 'training_incomplete',
  ctx: WhatsAppAutoContext,
): Promise<number> {
  const rules = loadWhatsAppAutoRules();
  const rule = rules.find((r) => r.event === event);
  if (!rule?.enabled) return 0;

  const templates = loadWhatsAppTemplates();
  const tpl = findTemplate(templates, rule.templateKey);
  if (!tpl || !ctx.student) return 0;

  const phones = parentPhonesForStudent(ctx.student);
  if (phones.length === 0) return 0;

  const vars = buildStudentTemplateVars(ctx.student, {
    form_linki: ctx.formUrl ?? '',
    ders_adi: ctx.lessonName ?? '',
    ders_linki: ctx.lessonUrl ?? '',
    tarih: new Date().toLocaleDateString('tr-TR'),
    saat: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  });
  const message = renderWhatsAppTemplate(tpl.body, vars);

  let count = 0;
  for (const phone of phones) {
    const r = await sendWhatsAppMessage({
      phone,
      message,
      studentId: ctx.student.id,
      studentName: ctx.student.name,
      branchOffice: ctx.branchOffice ?? ctx.student.branchOffice,
      templateKey: tpl.key,
    });
    if (r.ok) count += 1;
  }
  return count;
}

/** Veli giriş bilgileri toplu gönder */
export async function sendParentLoginBulk(
  students: Student[],
  branchOffice?: string,
): Promise<{ sent: number; failed: number; manual: number }> {
  const templates = loadWhatsAppTemplates();
  const tpl = findTemplate(templates, 'parent_login');
  if (!tpl) return { sent: 0, failed: 0, manual: 0 };

  const recipients: { phone: string; message: string; studentId: string; studentName: string }[] = [];
  for (const student of students) {
    if (branchOffice && student.branchOffice !== branchOffice) continue;
    const phones = parentPhonesForStudent(student);
    if (!phones.length) continue;
    const vars = buildStudentTemplateVars(student, {
      giris_linki: `${window.location.origin}${window.location.pathname}#/`,
    });
    const message = renderWhatsAppTemplate(tpl.body, vars);
    for (const phone of phones) {
      recipients.push({ phone, message, studentId: student.id, studentName: student.name });
    }
  }
  return sendWhatsAppBulk(recipients, { branchOffice, delayMs: 1500 });
}
