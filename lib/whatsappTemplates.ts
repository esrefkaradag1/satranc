import type { Student, WhatsAppAutoRule, WhatsAppTemplate, WhatsAppTemplateKey } from '../types';

export type TemplateVars = Record<string, string>;

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl-parent-login',
    key: 'parent_login',
    name: 'Veli Giriş Bilgileri',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} için {{kulup_adi}} öğrenci paneli giriş bilgileri:

Kullanıcı adı: {{kullanici_adi}}
Şifre: {{sifre}}
Veli PIN: {{veli_pin}}

Giriş: {{giris_linki}}

İyi dersler.`,
  },
  {
    id: 'tpl-parent-consent',
    key: 'parent_consent',
    name: 'Veli Form Daveti',
    enabled: true,
    body: `Merhaba,

{{ogrenci_adi}} için kulüp kayıt formunu onaylamanız ve dijital imzanızı eklemeniz gerekmektedir.

Form linki:
{{form_linki}}

Teşekkürler.`,
  },
  {
    id: 'tpl-lesson-start',
    key: 'lesson_start',
    name: 'Ders Başlangıcı',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} için canlı ders başladı: {{ders_adi}}

Katılım linki:
{{ders_linki}}

{{kulup_adi}}`,
  },
  {
    id: 'tpl-attendance',
    key: 'attendance_reminder',
    name: 'Yoklama Hatırlatma',
    enabled: false,
    body: `Merhaba {{veli_adi}},

{{tarih}} tarihli {{grup}} dersi için yoklama alınmıştır.

{{kulup_adi}}`,
  },
];

export const DEFAULT_WHATSAPP_AUTO_RULES: WhatsAppAutoRule[] = [
  { event: 'parent_login', enabled: true, templateKey: 'parent_login' },
  { event: 'parent_consent', enabled: true, templateKey: 'parent_consent' },
  { event: 'lesson_start', enabled: true, templateKey: 'lesson_start' },
];

export function renderWhatsAppTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function findTemplate(
  templates: WhatsAppTemplate[],
  key: WhatsAppTemplateKey,
): WhatsAppTemplate | undefined {
  return templates.find((t) => t.key === key && t.enabled);
}

export function buildStudentTemplateVars(
  student: Student,
  extra: TemplateVars = {},
): TemplateVars {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  return {
    ogrenci_adi: student.name,
    veli_adi: student.parentName || student.fatherName || student.motherName || 'Veli',
    kulup_adi: student.branchOffice || student.branch || 'Kulüp',
    sube: student.branchOffice || '',
    grup: student.group || '',
    kullanici_adi: student.username || '',
    sifre: student.password || '',
    veli_pin: student.parentPin || '',
    giris_linki: `${origin}${path}#/`,
    ...extra,
  };
}
