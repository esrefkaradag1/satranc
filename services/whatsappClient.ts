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
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = loadWhatsAppConfig();
  const res = await fetch(`/api/whatsapp?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, config }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'API hatası');
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchWhatsAppStatus(): Promise<{
  connected: boolean;
  state: string;
  apiConfigured: boolean;
  error?: string;
}> {
  const config = loadWhatsAppConfig();
  const res = await fetch('/api/whatsapp?action=status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  const data = (await res.json()) as {
    connected?: boolean;
    state?: string;
    apiConfigured?: boolean;
    error?: string;
  };
  return {
    connected: Boolean(data.connected),
    state: data.state || 'pasif',
    apiConfigured: Boolean(config.apiBaseUrl?.trim()),
    error: data.error,
  };
}

export async function fetchWhatsAppQr(): Promise<string> {
  const data = await callWhatsAppApi('qr', {});
  const b64 = String(data.base64 ?? '');
  if (!b64) throw new Error('QR kodu alınamadı');
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
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

  try {
    const data = await callWhatsAppApi('send', { phone, message });
    if (data.ok && data.mode === 'api') {
      result = { ok: true, mode: 'api' };
    } else if (data.mode === 'manual' && openManualFallback) {
      openWhatsAppSend(phone, message);
      result = { ok: true, mode: 'manual' };
    } else {
      result = { ok: false, mode: 'failed', error: String(data.error ?? 'Gönderilemedi') };
    }
  } catch (e) {
    if (openManualFallback) {
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
): Promise<{ sent: number; failed: number; manual: number }> {
  const config = loadWhatsAppConfig();
  let sent = 0;
  let failed = 0;
  let manual = 0;

  if (config.enabled && config.apiBaseUrl) {
    const data = await callWhatsAppApi('send-bulk', {
      recipients,
      delayMs: options?.delayMs ?? 1500,
    });
    const results = (data.results as { phone: string; ok: boolean; mode: string }[]) ?? [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rec = recipients[i];
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
        appendWhatsAppLog({
          id: genId(),
          phone: r.phone,
          message: rec?.message ?? '',
          status: 'failed',
          studentId: rec?.studentId,
          studentName: rec?.studentName,
          branchOffice: options?.branchOffice,
          error: 'Toplu gönderim hatası',
          createdAt: new Date().toISOString(),
        });
      }
    }
    return { sent, failed, manual };
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
    else failed += 1;
    await new Promise((resolve) => setTimeout(resolve, options?.delayMs ?? 800));
  }
  return { sent, failed, manual };
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
