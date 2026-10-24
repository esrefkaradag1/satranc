import type { Student } from '../types';

export type NotificationChannel = 'off' | 'whatsapp' | 'panel' | 'both';

export type NotificationEvent =
  | 'parent_login'
  | 'parent_consent'
  | 'lesson_start'
  | 'lesson_present'
  | 'lesson_absent'
  | 'training_completed'
  | 'training_partial'
  | 'training_incomplete';

export type NotificationDeliveryRule = {
  event: NotificationEvent;
  channel: NotificationChannel;
};

export type ParentPanelNotification = {
  id: string;
  studentId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  read: boolean;
  branchOffice?: string;
  createdAt: string;
};

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  'parent_login',
  'parent_consent',
  'lesson_start',
  'lesson_present',
  'lesson_absent',
  'training_completed',
  'training_partial',
  'training_incomplete',
];

export const NOTIFICATION_EVENT_META: Record<
  NotificationEvent,
  { label: string; description: string; category: 'kayit' | 'ders' | 'antrenman' }
> = {
  parent_login: {
    label: 'Veli giriş bilgileri',
    description: 'Yeni kayıt sonrası panel kullanıcı adı ve şifre',
    category: 'kayit',
  },
  parent_consent: {
    label: 'Veli form daveti',
    description: 'Dijital onay formu linki',
    category: 'kayit',
  },
  lesson_start: {
    label: 'Canlı ders başladı',
    description: 'Ders odası açıldığında katılım linki',
    category: 'ders',
  },
  lesson_present: {
    label: 'Derse katıldı',
    description: 'Yoklama "var" veya "geç" işaretlendiğinde veli bilgilendirmesi',
    category: 'ders',
  },
  lesson_absent: {
    label: 'Derse katılmadı',
    description: 'Yoklama "yok" işaretlendiğinde veli bilgilendirmesi',
    category: 'ders',
  },
  training_completed: {
    label: 'Antrenman tamamlandı',
    description: 'Günlük platform hedefi tamamlanınca (anında)',
    category: 'antrenman',
  },
  training_partial: {
    label: 'Antrenman kısmi',
    description: 'Hedefin bir kısmı yapıldı (akşam 23:00)',
    category: 'antrenman',
  },
  training_incomplete: {
    label: 'Antrenman yapılmadı',
    description: 'Günlük hedef hiç yapılmadı (akşam 23:00)',
    category: 'antrenman',
  },
};

export const DEFAULT_NOTIFICATION_CHANNELS: Record<NotificationEvent, NotificationChannel> = {
  parent_login: 'whatsapp',
  parent_consent: 'whatsapp',
  lesson_start: 'both',
  lesson_present: 'panel',
  lesson_absent: 'panel',
  training_completed: 'whatsapp',
  training_partial: 'whatsapp',
  training_incomplete: 'whatsapp',
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  off: 'Kapalı',
  whatsapp: 'WhatsApp',
  panel: 'Veli paneli',
  both: 'WhatsApp + Panel',
};

export type NotificationDispatchContext = {
  student: Student;
  formUrl?: string;
  lessonName?: string;
  lessonUrl?: string;
  branchOffice?: string;
  dateLabel?: string;
  extraBody?: string;
};

export function buildPanelNotificationContent(
  event: NotificationEvent,
  ctx: NotificationDispatchContext,
): { title: string; body: string } {
  const studentName = ctx.student.name || 'Öğrenci';
  const club = ctx.student.branchOffice || ctx.student.branch || 'Kulüp';
  const date = ctx.dateLabel || new Date().toLocaleDateString('tr-TR');

  switch (event) {
    case 'parent_login':
      return {
        title: 'Panel giriş bilgileri',
        body: `${studentName} için öğrenci paneli hesabı oluşturuldu. Giriş bilgilerinizi kulüpten veya WhatsApp mesajından kontrol edebilirsiniz.`,
      };
    case 'parent_consent':
      return {
        title: 'Veli onay formu',
        body: `${studentName} için kulüp kayıt formunu onaylamanız gerekiyor.`,
      };
    case 'lesson_start':
      return {
        title: 'Canlı ders başladı',
        body: `${studentName} için canlı ders başladı${ctx.lessonName ? `: ${ctx.lessonName}` : ''}.${ctx.lessonUrl ? `\nKatılım: ${ctx.lessonUrl}` : ''}`,
      };
    case 'lesson_present':
      return {
        title: 'Derse katıldı',
        body: `${studentName} ${date} tarihli derse katıldı${ctx.lessonName ? ` (${ctx.lessonName})` : ''}.`,
      };
    case 'lesson_absent':
      return {
        title: 'Derse katılım yok',
        body: `${studentName} ${date} tarihli derse katılmadı${ctx.lessonName ? ` (${ctx.lessonName})` : ''}.`,
      };
    case 'training_completed':
      return {
        title: 'Antrenman tamamlandı',
        body: `${studentName} bugünkü antrenman hedefini tamamladı (${date}).`,
      };
    case 'training_partial':
      return {
        title: 'Antrenman kısmen yapıldı',
        body: `${studentName} bugünkü antrenmanını kısmen yaptı (${date}). Eksik kısmı tamamlamasını hatırlatabilirsiniz.`,
      };
    case 'training_incomplete':
      return {
        title: 'Antrenman yapılmadı',
        body: `${studentName} bugünkü antrenman hedefini yapmadı (${date}). Lütfen platformda antrenmanı tamamlamasını hatırlatın.`,
      };
    default:
      return {
        title: 'Bildirim',
        body: ctx.extraBody || `${studentName} — ${club}`,
      };
  }
}

export function channelUsesWhatsApp(channel: NotificationChannel): boolean {
  return channel === 'whatsapp' || channel === 'both';
}

export function channelUsesPanel(channel: NotificationChannel): boolean {
  return channel === 'panel' || channel === 'both';
}
