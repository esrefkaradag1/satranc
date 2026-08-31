import type { Student } from '../types';
import { isStudentNotificationsEnabled } from '../lib/studentNotificationUtils';
import {
  buildPanelNotificationContent,
  channelUsesPanel,
  channelUsesWhatsApp,
  type NotificationDispatchContext,
  type NotificationEvent,
} from '../lib/notificationEvents';
import { getDeliveryChannel } from '../lib/notificationRouting';
import { createParentPanelNotification } from '../lib/parentPanelNotifications';
import {
  loadWhatsAppAutoRules,
  loadWhatsAppTemplates,
} from '../lib/whatsappStorage';
import {
  buildStudentTemplateVars,
  findTemplate,
  renderWhatsAppTemplate,
} from '../lib/whatsappTemplates';
import { parentPhonesForStudent } from '../lib/whatsappPhones';
import { sendWhatsAppMessage } from './whatsappClient';

export type DispatchResult = {
  whatsapp: number;
  panel: boolean;
  skipped: boolean;
};

async function sendWhatsAppForEvent(
  event: NotificationEvent,
  ctx: NotificationDispatchContext,
): Promise<number> {
  const autoRules = loadWhatsAppAutoRules();
  const rule = autoRules.find((r) => r.event === event);
  const templates = loadWhatsAppTemplates();
  const templateKey = (rule?.templateKey ?? event) as import('../types').WhatsAppTemplateKey;
  const tpl = findTemplate(templates, templateKey);
  if (!tpl || !ctx.student) return 0;

  const phones = parentPhonesForStudent(ctx.student);
  if (phones.length === 0) return 0;

  const vars = buildStudentTemplateVars(ctx.student, {
    form_linki: ctx.formUrl ?? '',
    ders_adi: ctx.lessonName ?? '',
    ders_linki: ctx.lessonUrl ?? '',
    tarih: ctx.dateLabel || new Date().toLocaleDateString('tr-TR'),
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
      recipientName: vars.veli_adi,
      branchOffice: ctx.branchOffice ?? ctx.student.branchOffice,
      templateKey: tpl.key,
      studentStatus: ctx.student.status,
      openManualFallback: false,
    });
    if (r.ok && r.mode === 'api') count += 1;
  }
  return count;
}

function sendPanelForEvent(event: NotificationEvent, ctx: NotificationDispatchContext): boolean {
  if (!ctx.student?.id) return false;
  const content = buildPanelNotificationContent(event, ctx);
  createParentPanelNotification({
    studentId: ctx.student.id,
    event,
    title: content.title,
    body: content.body,
    branchOffice: ctx.branchOffice ?? ctx.student.branchOffice,
  });
  return true;
}

/** Olay için yapılandırılmış kanala göre WhatsApp ve/veya veli paneli bildirimi gönderir. */
export async function dispatchNotification(
  event: NotificationEvent,
  ctx: NotificationDispatchContext,
): Promise<DispatchResult> {
  if (ctx.student && !isStudentNotificationsEnabled(ctx.student)) {
    return { whatsapp: 0, panel: false, skipped: true };
  }

  const channel = getDeliveryChannel(event);
  if (channel === 'off') {
    return { whatsapp: 0, panel: false, skipped: true };
  }

  let whatsapp = 0;
  let panel = false;

  if (channelUsesPanel(channel)) {
    panel = sendPanelForEvent(event, ctx);
  }
  if (channelUsesWhatsApp(channel)) {
    whatsapp = await sendWhatsAppForEvent(event, ctx);
  }

  return { whatsapp, panel, skipped: false };
}

/** Geriye dönük: eski triggerWhatsAppAuto çağrıları. */
export async function triggerWhatsAppAuto(
  event: NotificationEvent,
  ctx: {
    student?: Student;
    formUrl?: string;
    lessonName?: string;
    lessonUrl?: string;
    branchOffice?: string;
  },
): Promise<number> {
  if (!ctx.student) return 0;
  const result = await dispatchNotification(event, {
    student: ctx.student,
    formUrl: ctx.formUrl,
    lessonName: ctx.lessonName,
    lessonUrl: ctx.lessonUrl,
    branchOffice: ctx.branchOffice,
  });
  return result.whatsapp;
}
