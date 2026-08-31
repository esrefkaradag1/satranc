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
    id: 'tpl-lesson-present',
    key: 'lesson_present',
    name: 'Derse Katıldı',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} {{tarih}} tarihli derse katıldı: {{ders_adi}}

{{kulup_adi}}`,
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
  {
    id: 'tpl-training-done',
    key: 'training_completed',
    name: 'Antrenman Tamamlandı',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını tamamladı ({{tarih}} {{saat}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

{{kulup_adi}}`,
  },
  {
    id: 'tpl-training-partial',
    key: 'training_partial',
    name: 'Antrenman Kısmi (23:00)',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını kısmen yaptı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Eksik kalan kısmı tamamlamasını hatırlatabilirsiniz.

{{kulup_adi}}`,
  },
  {
    id: 'tpl-training-missed',
    key: 'training_incomplete',
    name: 'Antrenman Yapılmadı (23:00)',
    enabled: true,
    body: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını yapmadı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Lütfen platformda antrenmanını tamamlamasını hatırlatın.

{{kulup_adi}}`,
  },
];

export const DEFAULT_WHATSAPP_AUTO_RULES: WhatsAppAutoRule[] = [
  { event: 'parent_login', enabled: true, templateKey: 'parent_login' },
  { event: 'parent_consent', enabled: true, templateKey: 'parent_consent' },
  { event: 'lesson_start', enabled: true, templateKey: 'lesson_start' },
  { event: 'lesson_present', enabled: false, templateKey: 'lesson_present' },
  { event: 'training_completed', enabled: true, templateKey: 'training_completed' },
  { event: 'training_partial', enabled: true, templateKey: 'training_partial' },
  { event: 'training_incomplete', enabled: true, templateKey: 'training_incomplete' },
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

const SYSTEM_TEMPLATE_KEYS = new Set(
  DEFAULT_WHATSAPP_TEMPLATES.map((t) => t.key),
);

export function isSystemWhatsAppTemplate(key: WhatsAppTemplateKey): boolean {
  return SYSTEM_TEMPLATE_KEYS.has(key as (typeof DEFAULT_WHATSAPP_TEMPLATES)[number]['key']);
}

export function createCustomWhatsAppTemplate(input: {
  name: string;
  body: string;
}): WhatsAppTemplate {
  const slug = String(input.name || 'ozel')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşıöç]+/gi, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'ozel';
  const id = `tpl-custom-${Date.now().toString(36)}`;
  return {
    id,
    key: `custom_${slug}_${Date.now().toString(36)}`,
    name: String(input.name || 'Yeni şablon').trim() || 'Yeni şablon',
    body: String(input.body || '').trim() || 'Merhaba {{veli_adi}},\n\n{{ogrenci_adi}}\n\n{{kulup_adi}}',
    enabled: true,
  };
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
