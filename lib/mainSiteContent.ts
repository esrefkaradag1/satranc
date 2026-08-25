import type { MainSiteAnnouncement, MainSiteContent, MainSiteFaq, MainSiteFeature } from '../types';

/**
 * v8: Rooki Chess anlatım ritminden türetilmiş SatrancEdu metinleri
 * (birebir kopya değil — akademi / kurum odaklı)
 */
const STORAGE_KEY = 'satrancedu_main_site_v8';

export const PLATFORM_ROLES: MainSiteFeature[] = [
  {
    tag: 'MERKEZ',
    title: 'Yönetici',
    body: 'Şubeler, roller, finans ve iletişim ayarlarını tek noktadan kontrol edin.',
  },
  {
    tag: 'ŞUBE',
    title: 'Kulüp',
    body: 'Antrenör kadrosu, öğrenciler ve şube özetini yerinden yönetin.',
  },
  {
    tag: 'SAHA',
    title: 'Antrenör',
    body: 'Dersi açın, ödev verin, yoklama alın — sınıf ritmi sizde.',
  },
  {
    tag: 'OYUNCU',
    title: 'Öğrenci',
    body: 'Derse girin, ödev çözün, turnuvada skorunuzu görün.',
  },
  {
    tag: 'AİLE',
    title: 'Veli',
    body: 'Devam, ödev ve ödemeleri net şekilde takip edin.',
  },
];

/** Rooki “neler yapabilirsin” ritmi → kurum faydası */
export const PLATFORM_PILLARS: MainSiteFeature[] = [
  {
    tag: 'DERS',
    title: 'Canlı tahta ile öğretin',
    body: 'İnteraktif tahta, müfredat ve sınıf programı aynı yerde. Ders bitince iz bırakan bir akış kalır.',
  },
  {
    tag: 'PRATİK',
    title: 'Evde de ilerlesin',
    body: 'Ödev, bulmaca ve çalışma içerikleriyle öğrenciler dersten sonra da gelişmeye devam eder.',
  },
  {
    tag: 'DÜZEN',
    title: 'Kurumu görünür kılın',
    body: 'Yoklama, turnuva, kasa ve veli bildirimleri dağınık sohbetlerden çıkıp panele toplanır.',
  },
];

/** Rooki “3 adımda şampiyon” ritmi → kurulum */
export const PLATFORM_STEPS: MainSiteFeature[] = [
  {
    tag: '01',
    title: 'Kurumu açın',
    body: 'Yönetici hesabıyla şube, antrenör ve öğrenci iskeletini kurun.',
  },
  {
    tag: '02',
    title: 'Eğitime başlayın',
    body: 'Antrenör canlı ders ve ödevleri yürütür; öğrenci panelden katılır.',
  },
  {
    tag: '03',
    title: 'Sonucu paylaşın',
    body: 'Veli devam ve gelişimi görür; kulüp turnuva ve kasayı izler.',
  },
];

/** Rooki özellik grid ritmi → SatrancEdu modülleri */
export const PLATFORM_MODULES: MainSiteFeature[] = [
  {
    tag: '01',
    title: 'Canlı sınıf',
    body: 'Antrenör tahtayı açar, öğrenci derse bağlanır; kesintisiz online sınıf deneyimi.',
  },
  {
    tag: '02',
    title: 'Ödev & bulmaca',
    body: 'Hedefli ödevler ve kurum bulmaca havuzuyla pratik ölçülür, teslim takip edilir.',
  },
  {
    tag: '03',
    title: 'Çalışma içerikleri',
    body: 'Hamle hamle study bölümleri atayın; ilerlemeyi panelden okuyun.',
  },
  {
    tag: '04',
    title: 'Turnuva & sıralama',
    body: 'Kurum içi turnuva, eşleşme ve lider tablosuyla motivasyonu canlı tutun.',
  },
  {
    tag: '05',
    title: 'Veliye anlık haber',
    body: 'WhatsApp şablonları ve otomatik bildirimlerle aileyi bilgilendirin.',
  },
  {
    tag: '06',
    title: 'Aidat & kasa',
    body: 'Ödemeler, paketler ve özel dersler tek finans görünümünde.',
  },
];

/** Rooki macera haritası ritmi → akademi yolculuğu */
export const PLATFORM_JOURNEY: MainSiteFeature[] = [
  {
    tag: '1',
    title: 'Temel kurulum',
    body: 'Kulüp yapısı, roller ve ilk öğrenci listesiyle sahneyi kurun.',
  },
  {
    tag: '2',
    title: 'Haftalık ritim',
    body: 'Müfredat, canlı ders, ödev ve yoklama ile düzenli eğitim döngüsü başlar.',
  },
  {
    tag: '3',
    title: 'Ölçüm & rekabet',
    body: 'Turnuva ve performans görünürlüğüyle gelişim somutlaşır.',
  },
  {
    tag: '4',
    title: 'Aile köprüsü',
    body: 'Veli paneli ve bildirimlerle güven ve şeffaflık pekişir.',
  },
];

/** Rooki “istediğin gibi oyna” ritmi → kullanım modları */
export const PLATFORM_MODES: MainSiteFeature[] = [
  {
    tag: 'CANLI',
    title: 'Canlı sınıf',
    body: 'Eş zamanlı ders; tahta ve sınıf aynı anda.',
  },
  {
    tag: 'EV',
    title: 'Ev pratiği',
    body: 'Ödev ve bulmaca ile dersten sonra tekrar.',
  },
  {
    tag: 'ARENA',
    title: 'Kurum turnuvası',
    body: 'İç rekabet, skor ve sıralama.',
  },
  {
    tag: 'AİLE',
    title: 'Veli görünümü',
    body: 'Devam, ödev ve aidat tek bakışta.',
  },
  {
    tag: 'DENE',
    title: 'Hepsini dene',
    body: 'Demo ile paneli kurumunuza özel açın.',
  },
];

export const PLATFORM_FAQS: MainSiteFaq[] = [
  {
    q: 'SatrancEdu ücretsiz denenebilir mi?',
    a: 'Evet. Demo talebiyle kurumunuza özel deneme hesabı açılır; kredi kartı gerekmez.',
  },
  {
    q: 'Öğrencinin önceden satranç bilmesi şart mı?',
    a: 'Hayır. Antrenör seviyesine göre grup ve müfredat oluşturur; başlangıçtan ileri seviyeye kadar yönetilebilir.',
  },
  {
    q: 'Veriler ve veli paneli güvenli mi?',
    a: 'Her rol kendi paneline ve izinlerine sahiptir. Veli yalnızca kendi öğrencisine ait bilgilere erişir.',
  },
  {
    q: 'Telefondan veya tablette çalışır mı?',
    a: 'Evet. Uygulama indirmeden tarayıcı üzerinden bilgisayar, tablet ve telefonda kullanılır.',
  },
  {
    q: 'WhatsApp bildirimleri nasıl çalışır?',
    a: 'Şablonlar ve otomatik akışlarla yoklama, ödev ve duyuru bildirimleri veliye iletilebilir.',
  },
];

export const MAIN_SITE_DEFAULTS: MainSiteContent = {
  enabled: true,
  brandTitle: 'SatrancEdu',
  heroEyebrow: 'Satranç akademileri için',
  heroTitle: 'Dersi yönetirken, akademiyi büyütün.',
  heroSubtitle:
    'Dağınık Excel ve sohbet gruplarını bırakın. Canlı ders, ödev, yoklama, turnuva ve veli iletişimini tek panelde toplayın — öğrenci, aile, antrenör ve kulüp aynı sistemde.',
  trustLine: 'KURUMSAL PANEL · CANLI DERS · VELİ TAKİBİ · WHATSAPP',
  heroSlides: [],
  aboutTitle: 'SatrancEdu nedir?',
  aboutBody:
    'SatrancEdu, satranç eğitimi veren kurumların günlük işini sadeleştirir. Canlı dersten aidata, turnuvadan veli bilgilendirmesine kadar tüm akışlar rol bazlı panellerde birleşir; her kurum kendi öğrencisini ve operasyonunu yönetir.',
  features: PLATFORM_PILLARS,
  stats: [
    { label: 'Rol paneli', value: '5' },
    { label: 'Modül', value: '12+' },
    { label: 'Canlı ders', value: 'Hazır' },
    { label: 'Veli hattı', value: 'Açık' },
  ],
  rolesTitle: 'Kimler kullanır?',
  rolesSubtitle: 'Her rol kendi paneline girer; yetkiler karışmaz.',
  roles: PLATFORM_ROLES,
  benefitsTitle: 'Neler yapabilirsiniz?',
  benefitsSubtitle: 'Satranç eğitimini yönetmenin daha net yolu.',
  benefits: PLATFORM_PILLARS,
  stepsTitle: 'Nasıl başlanır?',
  stepsSubtitle: 'Üç adımda kurumunuz dijital düzene oturur.',
  steps: PLATFORM_STEPS,
  modulesTitle: 'Platformda neler var?',
  modulesSubtitle: 'Öğretirken düzenleyin, düzenlerken büyütün.',
  modules: PLATFORM_MODULES,
  journeyTitle: 'Akademi yol haritası',
  journeySubtitle: 'Kurulumdan aile iletişimine kadar net bir rota.',
  journey: PLATFORM_JOURNEY,
  modesTitle: 'Nasıl kullanırsınız?',
  modesSubtitle: 'Canlı sınıf, ev pratiği, turnuva veya veli takibi — ihtiyacınıza göre.',
  modes: PLATFORM_MODES,
  faqTitle: 'Sık sorulanlar',
  faqSubtitle: 'Kurumlar ve aileler için kısa yanıtlar.',
  faqs: PLATFORM_FAQS,
  announcementsTitle: 'Duyurular',
  announcementsSubtitle: 'Platformdan notlar',
  announcements: [
    {
      id: 'ann-default-1',
      title: 'Panele hoş geldiniz',
      body: 'Veli, öğrenci, antrenör veya kulüp hesabınızla giriş yaparak eğitim ve operasyon süreçlerini takip edebilirsiniz.',
      date: '2026-03-01',
    },
    {
      id: 'ann-default-2',
      title: 'Canlı ders + ödev tek yerde',
      body: 'Antrenör dersi açar ve ödev atar; öğrenci katılır ve teslim eder. Veli devamı panelden görür.',
      date: '2026-02-20',
    },
  ],
  galleryTitle: 'Galeri',
  gallerySubtitle: 'Eğitim ve etkinliklerden seçilmiş kareler',
  showGallery: true,
  ctaTitle: 'Kurumunuz için paneli açalım',
  ctaBody: 'Demo isteyin veya mevcut hesabınızla giriş yapın. Kısa sürede birlikte kurulum yaparız.',
  ctaButtonLabel: 'Panele giriş',
  contactPhone: '',
  contactWhatsapp: '',
  contactEmail: 'info@satrancedu.com',
  contactAddress: '',
  mapEmbedUrl: '',
  openingHoursWeekday: '',
  openingHoursSaturday: '',
  openingHoursSunday: '',
  facebookUrl: '',
  instagramUrl: '',
  twitterUrl: '',
  youtubeUrl: '',
  linkedinUrl: '',
  websiteUrl: 'https://satrancedu.com',
  foundedYear: '',
  pageKurumsal: {
    title: 'Kurumsal',
    body:
      'SatrancEdu; satranç akademilerinin öğrenci, veli, antrenör ve operasyon süreçlerini tek çatı altında toplar. Amacımız karmaşık yönetimi sadeleştirmek — eğitimin kendisine alan açmak.',
    items: [
      {
        title: 'Misyonumuz',
        body: 'Satranç kurumlarına güvenilir, ölçeklenebilir ve anlaşılır bir yönetim altyapısı sunmak.',
      },
      {
        title: 'Vizyonumuz',
        body: 'Türkiye’de satranç eğitiminin standart dijital omurgası olmak.',
      },
      {
        title: 'Değerlerimiz',
        body: 'Şeffaflık, disiplin, sürekli öğrenme ve kuruma özel esneklik.',
      },
    ],
  },
  pageEgitimler: {
    title: 'Platform özellikleri',
    body: 'Canlı dersten kasaya kadar SatrancEdu’daki başlıca araçlar.',
    items: PLATFORM_MODULES,
  },
  pageAntrenman: {
    title: 'Nasıl başlanır?',
    body: 'Kurumunuzun SatrancEdu’daki tipik ilerleme yolu.',
    items: PLATFORM_STEPS,
  },
  pageDenemeDersi: {
    title: 'Demo talep et',
    body: 'Formu doldurun; kurumunuza özel deneme hesabını birlikte açalım. Kredi kartı gerekmez.',
  },
};

export function emptyMainSiteContent(): MainSiteContent {
  return {
    enabled: true,
    brandTitle: 'SatrancEdu',
    heroTitle: '',
    heroSubtitle: '',
    heroSlides: [],
    aboutTitle: '',
    aboutBody: '',
    features: [],
    stats: [
      { label: '', value: '' },
      { label: '', value: '' },
      { label: '', value: '' },
      { label: '', value: '' },
    ],
    modules: [],
    roles: [],
    steps: [],
    benefits: [],
    journey: [],
    modes: [],
    faqs: [],
    announcementsTitle: 'Duyurular',
    announcementsSubtitle: '',
    announcements: [],
    galleryTitle: 'Galeri',
    gallerySubtitle: '',
    showGallery: true,
    ctaTitle: '',
    ctaBody: '',
    ctaButtonLabel: 'Panele giriş',
    contactEmail: 'info@satrancedu.com',
    contactPhone: '',
    contactWhatsapp: '',
    contactAddress: '',
    mapEmbedUrl: '',
    websiteUrl: 'https://satrancedu.com',
  };
}

export function getMainSiteContent(): MainSiteContent {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(MAIN_SITE_DEFAULTS);
    const parsed = JSON.parse(raw) as MainSiteContent;
    if (!parsed || typeof parsed !== 'object') return structuredClone(MAIN_SITE_DEFAULTS);
    return {
      ...MAIN_SITE_DEFAULTS,
      ...parsed,
      heroSlides: Array.isArray(parsed.heroSlides) ? parsed.heroSlides : [],
      features: parsed.features?.length ? parsed.features : MAIN_SITE_DEFAULTS.features,
      stats: parsed.stats?.length ? parsed.stats : MAIN_SITE_DEFAULTS.stats,
      modules: parsed.modules?.length ? parsed.modules : MAIN_SITE_DEFAULTS.modules,
      roles: parsed.roles?.length ? parsed.roles : MAIN_SITE_DEFAULTS.roles,
      steps: parsed.steps?.length ? parsed.steps : MAIN_SITE_DEFAULTS.steps,
      benefits: parsed.benefits?.length ? parsed.benefits : MAIN_SITE_DEFAULTS.benefits,
      journey: parsed.journey?.length ? parsed.journey : MAIN_SITE_DEFAULTS.journey,
      modes: parsed.modes?.length ? parsed.modes : MAIN_SITE_DEFAULTS.modes,
      faqs: parsed.faqs?.length ? parsed.faqs : MAIN_SITE_DEFAULTS.faqs,
      announcements:
        Array.isArray(parsed.announcements) && parsed.announcements.length
          ? parsed.announcements
          : MAIN_SITE_DEFAULTS.announcements,
      pageKurumsal: parsed.pageKurumsal ?? MAIN_SITE_DEFAULTS.pageKurumsal,
      pageEgitimler: parsed.pageEgitimler ?? MAIN_SITE_DEFAULTS.pageEgitimler,
      pageAntrenman: parsed.pageAntrenman ?? MAIN_SITE_DEFAULTS.pageAntrenman,
      pageDenemeDersi: parsed.pageDenemeDersi ?? MAIN_SITE_DEFAULTS.pageDenemeDersi,
    };
  } catch {
    return structuredClone(MAIN_SITE_DEFAULTS);
  }
}

export function saveMainSiteContent(content: MainSiteContent): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  try {
    window.dispatchEvent(new CustomEvent('satrancedu-main-site-updated'));
  } catch {
    /* ignore */
  }
}

export function newMainAnnouncement(partial?: Partial<MainSiteAnnouncement>): MainSiteAnnouncement {
  return {
    id: `ann-${Date.now().toString(36)}`,
    title: partial?.title ?? 'Yeni duyuru',
    body: partial?.body ?? '',
    date: partial?.date ?? new Date().toISOString().slice(0, 10),
  };
}

export function resetMainSiteToDefaults(): MainSiteContent {
  const next = structuredClone(MAIN_SITE_DEFAULTS);
  saveMainSiteContent(next);
  return next;
}

export type MainSitePageId =
  | 'anasayfa'
  | 'kurumsal'
  | 'egitimler'
  | 'deneme-dersi'
  | 'antrenman'
  | 'galeri'
  | 'iletisim'
  | 'kvkk'
  | 'gizlilik'
  | 'kullanim'
  | 'cerez';

export const MAIN_SITE_PAGE_SLUGS: MainSitePageId[] = [
  'anasayfa',
  'kurumsal',
  'egitimler',
  'deneme-dersi',
  'antrenman',
  'galeri',
  'iletisim',
  'kvkk',
  'gizlilik',
  'kullanim',
  'cerez',
];

export function parseMainSitePageFromHash(): MainSitePageId {
  if (typeof window === 'undefined') return 'anasayfa';
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const head = (parts[0] || '').trim().toLowerCase();
  if (!head || head === 'anasayfa' || head === 'home') return 'anasayfa';
  if ((MAIN_SITE_PAGE_SLUGS as string[]).includes(head)) return head as MainSitePageId;
  return 'anasayfa';
}

export function mainSitePageHref(page: MainSitePageId): string {
  if (page === 'anasayfa') return '#/';
  return `#/${page}`;
}
