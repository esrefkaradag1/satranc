import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  CheckCircle2,
  Send,
  Target,
  Eye,
  Heart,
  Mail,
  Phone,
  MapPin,
  LayoutDashboard,
  Video,
  Puzzle,
  BookOpen,
  Trophy,
  MessageCircle,
  Wallet,
  Shield,
  Users,
  Building2,
  ImageIcon,
  Menu,
  X,
} from 'lucide-react';
import {
  getMainSiteContent,
  parseMainSitePageFromHash,
  type MainSitePageId,
} from '../../lib/mainSiteContent';
import { publicLoginHref } from '../../lib/panelRouting';
import { useApp } from '../../AppContext';
import type { MainSiteContent } from '../../types';
import { useDashboard3DEnabled } from '../dashboard/useDashboard3D';
import './mainPublicSite.css';

const PublicHero3D = React.lazy(() => import('./PublicHero3D'));

type Props = {
  previewContent?: MainSiteContent | null;
  previewPage?: MainSitePageId;
  onClosePreview?: () => void;
};

const NAV: { id: MainSitePageId; label: string }[] = [
  { id: 'anasayfa', label: 'Ana Sayfa' },
  { id: 'kurumsal', label: 'Kurumsal' },
  { id: 'egitimler', label: 'Özellikler' },
  { id: 'antrenman', label: 'Nasıl çalışır' },
  { id: 'galeri', label: 'Galeri' },
  { id: 'deneme-dersi', label: 'Demo' },
  { id: 'iletisim', label: 'İletişim' },
];

function useFonts() {
  useEffect(() => {
    const id = 'ms-fonts-v8';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);
}

const MainPublicSite: React.FC<Props> = ({ previewContent, previewPage, onClosePreview }) => {
  useFonts();
  const webgl3d = useDashboard3DEnabled();
  const { gallery: appGallery } = useApp();
  const [site, setSite] = useState<MainSiteContent>(() => previewContent ?? getMainSiteContent());
  const [page, setPage] = useState<MainSitePageId>(() => previewPage ?? parseMainSitePageFromHash());
  const [showTop, setShowTop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);
  const [demoForm, setDemoForm] = useState({
    clubName: '',
    contactPerson: '',
    phone: '',
    submitted: false,
  });

  useEffect(() => {
    if (previewContent) {
      setSite(previewContent);
      return;
    }
    const refresh = () => setSite(getMainSiteContent());
    refresh();
    window.addEventListener('satrancedu-main-site-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('satrancedu-main-site-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [previewContent]);

  useEffect(() => {
    if (previewPage) setPage(previewPage);
  }, [previewPage]);

  useEffect(() => {
    const onHash = () => setPage(parseMainSitePageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const gallery = useMemo(() => {
    if (site.showGallery === false) return [];
    return appGallery.filter((g) => !g.studentId).slice(0, 8);
  }, [appGallery, site.showGallery]);

  const brand = site.brandTitle || 'SatrancEdu';
  const stats = site.stats ?? [];
  const pillars = (site.benefits?.length ? site.benefits : site.features) ?? [];
  const steps = site.steps ?? [];
  const modules = site.modules ?? [];
  const journey = site.journey ?? [];
  const modes = site.modes ?? [];
  const faqs = site.faqs ?? [];

  const go = (id: MainSitePageId) => {
    if (!previewContent) window.location.hash = id === 'anasayfa' ? '/' : `/${id}`;
    setPage(id);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoForm.phone.trim()) return;
    setDemoForm((prev) => ({ ...prev, submitted: true }));
  };

  return (
    <div className="ms">
      {previewContent ? (
        <div className="sticky top-0 z-[70] border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">
          Önizleme
          {onClosePreview ? (
            <button type="button" onClick={onClosePreview} className="ml-3 underline">
              Kapat
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="ms-header">
        <div className="ms-container ms-header-bar">
          <button type="button" onClick={() => go('anasayfa')} className="ms-logo">
            <img src="/satrancedu-emblem.png" alt={brand} />
            <span className="ms-logo-text">{brand}</span>
          </button>

          <nav className="ms-nav-desktop" aria-label="Sayfalar">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`ms-nav-link ${page === item.id ? 'is-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ms-header-actions">
            <a href={publicLoginHref()} className="ms-btn ms-btn-outline-white ms-btn-sm ms-header-login">
              Giriş
            </a>
            <button type="button" onClick={() => go('deneme-dersi')} className="ms-btn ms-btn-primary ms-btn-sm">
              Demo
            </button>
            <button
              type="button"
              className="ms-nav-toggle"
              aria-label={mobileNavOpen ? 'Menüyü kapat' : 'Menüyü aç'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileNavOpen ? (
          <div className="ms-mobile-drawer">
            <nav className="ms-container" aria-label="Mobil menü">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`ms-mobile-link ${page === item.id ? 'is-active' : ''}`}
                >
                  {item.label}
                </button>
              ))}
              <a href={publicLoginHref()} className="ms-btn ms-btn-primary w-full mt-3">
                Panele giriş
              </a>
            </nav>
          </div>
        ) : null}
      </header>

      <main>
        {page === 'anasayfa' ? (
          <>
            <section className="ms-hero-cinematic">
              {webgl3d ? (
                <Suspense fallback={null}>
                  <PublicHero3D />
                </Suspense>
              ) : null}
              <div className="ms-hero-overlay">
                <div className="ms-container">
                  <div className="ms-hero-text">
                    {site.heroEyebrow ? <span className="ms-eyebrow mb-3 block">{site.heroEyebrow}</span> : null}
                    <h1>{site.heroTitle || 'Eğitirken yönet. Yönetirken büyüt.'}</h1>
                    <p>{site.heroSubtitle}</p>
                    <div className="ms-hero-actions">
                      <a href={publicLoginHref()} className="ms-btn ms-btn-primary ms-btn-lg">
                        Panele giriş
                      </a>
                      <button type="button" onClick={() => scrollToId('nasil')} className="ms-btn ms-btn-secondary ms-btn-lg">
                        Nasıl çalışır? <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                    {site.trustLine ? <p className="ms-trust-line">{site.trustLine}</p> : null}
                  </div>
                </div>
              </div>
            </section>

            {stats.length > 0 ? (
              <div className="ms-stat-row">
                {stats.slice(0, 4).map((s) => (
                  <div key={s.label}>
                    <div className="n">{s.value}</div>
                    <div className="l">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="ms-section">
              <div className="ms-container">
                <div className="ms-section-head center">
                  <span className="ms-eyebrow">{site.benefitsTitle || 'Neler yapabilirsiniz?'}</span>
                  <h2 className="ms-h2 mt-3">Satranç eğitimini yönetmenin daha net yolu</h2>
                  <p className="ms-lead mt-3">{site.benefitsSubtitle}</p>
                </div>
                <div className="ms-pillar-grid">
                  {pillars.slice(0, 3).map((p) => (
                    <article key={p.title} className="ms-pillar">
                      {p.tag ? <span className="ms-tag-sm">{p.tag}</span> : null}
                      <h3 className="ms-h3">{p.title}</h3>
                      <p>{p.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="ms-section alt" id="nasil">
              <div className="ms-container">
                <div className="ms-section-head center">
                  <span className="ms-eyebrow">{site.stepsTitle || 'Nasıl başlanır?'}</span>
                  <h2 className="ms-h2 mt-3">Üç adımda düzen kurun</h2>
                  <p className="ms-lead mt-3">{site.stepsSubtitle}</p>
                </div>
                <div className="ms-steps-grid">
                  {steps.slice(0, 3).map((s) => (
                    <article key={s.title} className="ms-step-card">
                      <div className="ms-step-n">{s.tag || ''}</div>
                      <h3 className="ms-h3">{s.title}</h3>
                      <p>{s.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="ms-section">
              <div className="ms-container">
                <div className="ms-section-head center">
                  <span className="ms-eyebrow">{site.modulesTitle || 'Platformda neler var?'}</span>
                  <h2 className="ms-h2 mt-3">
                    {site.modulesSubtitle || 'Öğretirken düzenleyin, düzenlerken büyütün.'}
                  </h2>
                </div>
                <div className="ms-feature-grid ms-feature-grid-3">
                  {modules.slice(0, 6).map((m) => (
                    <article key={m.title} className="ms-feature-item">
                      {m.tag ? <span className="ms-tag-sm mb-2 inline-block">{m.tag}</span> : null}
                      <h3 className="ms-h3">{m.title}</h3>
                      <p>{m.body}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-8 text-center">
                  <button type="button" onClick={() => go('egitimler')} className="ms-text-link">
                    Tüm özellikleri gör <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </section>

            {journey.length > 0 ? (
              <section className="ms-section alt">
                <div className="ms-container">
                  <div className="ms-section-head center">
                    <span className="ms-eyebrow">{site.journeyTitle || 'Akademi yol haritası'}</span>
                    <h2 className="ms-h2 mt-3">Kurulumdan aile köprüsüne</h2>
                    <p className="ms-lead mt-3">{site.journeySubtitle}</p>
                  </div>
                  <div className="ms-journey">
                    {journey.map((j) => (
                      <article key={j.title} className="ms-journey-item">
                        <span className="ms-journey-n">{j.tag}</span>
                        <h3 className="ms-h3">{j.title}</h3>
                        <p>{j.body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {modes.length > 0 ? (
              <section className="ms-section">
                <div className="ms-container">
                  <div className="ms-section-head">
                    <span className="ms-eyebrow">{site.modesTitle || 'Nasıl kullanırsınız?'}</span>
                    <h2 className="ms-h2 mt-3">İhtiyacınıza göre seçin</h2>
                    <p className="ms-lead mt-3">{site.modesSubtitle}</p>
                  </div>
                  <div className="ms-mode-tabs">
                    {modes.map((m, i) => (
                      <button
                        key={m.title}
                        type="button"
                        onClick={() => setSelectedModeIndex(i)}
                        className={`ms-mode-tab ${selectedModeIndex === i ? 'is-active' : ''}`}
                      >
                        <span className="ms-tag-sm">{m.tag || `${i + 1}`}</span>
                        <span className="title">{m.title}</span>
                      </button>
                    ))}
                  </div>
                  {modes[selectedModeIndex] ? (
                    <div className="ms-mode-panel">
                      <h3 className="ms-h3" style={{ fontSize: '1.25rem' }}>
                        {modes[selectedModeIndex].title}
                      </h3>
                      <p className="ms-lead mt-2" style={{ maxWidth: '100%' }}>
                        {modes[selectedModeIndex].body}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        {selectedModeIndex === modes.length - 1 ? (
                          <button type="button" onClick={() => go('deneme-dersi')} className="ms-btn ms-btn-primary">
                            Demo talep et
                          </button>
                        ) : (
                          <a href={publicLoginHref()} className="ms-btn ms-btn-primary">
                            Panele git
                          </a>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {gallery.length > 0 ? (
              <section className="ms-section alt">
                <div className="ms-container">
                  <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                    <div>
                      <span className="ms-eyebrow">{site.galleryTitle || 'Galeri'}</span>
                      <h2 className="ms-h2 mt-2">{site.gallerySubtitle}</h2>
                    </div>
                    <button type="button" onClick={() => go('galeri')} className="ms-text-link">
                      Tümü <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="ms-gallery-row">
                    {gallery.slice(0, 4).map((g) => (
                      <figure key={g.id}>
                        <img src={g.url} alt={g.title || ''} loading="lazy" />
                      </figure>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="ms-section" id="demo">
              <div className="ms-container grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                <div className="ms-demo-card">
                  <span className="ms-eyebrow mb-2 block">Hemen başlayın</span>
                  <h3 className="ms-h2" style={{ fontSize: '1.45rem' }}>
                    Demo talep et
                  </h3>
                  <p className="ms-lead mt-1 mb-5" style={{ fontSize: '0.92rem' }}>
                    {site.ctaBody}
                  </p>
                  {demoForm.submitted ? (
                    <div className="ms-success">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-600" />
                      <h4>Talebiniz alındı</h4>
                      <p>Kısa süre içinde sizinle iletişime geçeceğiz.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleDemoSubmit}>
                      <div className="ms-input-group">
                        <label className="ms-input-label">Kulüp / Akademi</label>
                        <input
                          type="text"
                          required
                          placeholder="Örn: Satranç Akademisi"
                          value={demoForm.clubName}
                          onChange={(e) => setDemoForm({ ...demoForm, clubName: e.target.value })}
                          className="ms-input"
                        />
                      </div>
                      <div className="ms-input-group">
                        <label className="ms-input-label">Yetkili</label>
                        <input
                          type="text"
                          required
                          placeholder="Ad Soyad"
                          value={demoForm.contactPerson}
                          onChange={(e) => setDemoForm({ ...demoForm, contactPerson: e.target.value })}
                          className="ms-input"
                        />
                      </div>
                      <div className="ms-input-group">
                        <label className="ms-input-label">Telefon</label>
                        <input
                          type="tel"
                          required
                          placeholder="05XX XXX XX XX"
                          value={demoForm.phone}
                          onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                          className="ms-input"
                        />
                      </div>
                      <button type="submit" className="ms-btn ms-btn-primary w-full mt-2 py-3">
                        <Send className="w-4 h-4" /> Demo iste
                      </button>
                    </form>
                  )}
                </div>

                <div>
                  <span className="ms-eyebrow mb-2 block">{site.faqTitle || 'S.S.S.'}</span>
                  <h3 className="ms-h2 mb-3" style={{ fontSize: '1.45rem' }}>
                    {site.faqSubtitle || 'Merak ettikleriniz'}
                  </h3>
                  {faqs.map((item, i) => {
                    const isOpen = openFaqIndex === i;
                    return (
                      <div key={item.q} className="ms-faq-item">
                        <button
                          type="button"
                          className="ms-faq-question"
                          onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                        >
                          <span>{item.q}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-[var(--faint)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isOpen ? <div className="ms-faq-answer">{item.a}</div> : null}
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => go('iletisim')} className="ms-text-link mt-6">
                    Başka sorunuz mu var? İletişime geçin <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : page === 'kurumsal' ? (
          <KurumsalPage site={site} brand={brand} onDemo={() => go('deneme-dersi')} />
        ) : page === 'egitimler' ? (
          <FeaturesPage site={site} onDemo={() => go('deneme-dersi')} />
        ) : page === 'antrenman' ? (
          <HowItWorksPage site={site} onDemo={() => go('deneme-dersi')} />
        ) : page === 'galeri' ? (
          <GalleryPage site={site} gallery={gallery} />
        ) : page === 'deneme-dersi' ? (
          <DemoPage
            site={site}
            demoForm={demoForm}
            setDemoForm={setDemoForm}
            onSubmit={handleDemoSubmit}
          />
        ) : page === 'iletisim' ? (
          <ContactPage site={site} onDemo={() => go('deneme-dersi')} />
        ) : (
          <LegalPage page={page} brand={brand} onBack={() => go('anasayfa')} />
        )}
      </main>

      <footer className="ms-footer">
        <div className="ms-container">
          <div className="ms-footer-cta">
            <h2 className="ms-footer-cta-title">
              {site.ctaTitle || 'Kurumunuz için SatrancEdu’yu deneyin'}
            </h2>
            <div className="ms-footer-cta-actions">
              <button type="button" onClick={() => go('deneme-dersi')} className="ms-btn ms-btn-primary ms-btn-lg">
                Demo talep et
                <span className="ms-footer-cta-arrow" aria-hidden>
                  <ArrowRight className="w-4 h-4" />
                </span>
              </button>
              {site.contactEmail ? (
                <a className="ms-footer-email" href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>
              ) : (
                <a className="ms-footer-email" href="mailto:info@satrancedu.com">
                  info@satrancedu.com
                </a>
              )}
            </div>
          </div>

          <div className="ms-footer-grid">
            <div className="ms-footer-brand">
              <div className="ms-footer-brand-row">
                <img src="/satrancedu-emblem.png" alt="" className="ms-footer-logo" />
                <span className="brand">{brand}</span>
              </div>
              <p>
                Satranç akademileri için canlı ders, ödev, yoklama, turnuva ve veli iletişimini tek panelde toplayan eğitim platformu.
              </p>
              <div className="ms-footer-pill">
                <span className="dot" />
                Demo ve kurum kurulumu açık
              </div>
            </div>

            <div>
              <h3 className="ms-footer-col-title">Hızlı linkler</h3>
              <ul className="ms-footer-links">
                <li><button type="button" onClick={() => go('anasayfa')}>Ana Sayfa</button></li>
                <li><button type="button" onClick={() => go('egitimler')}>Özellikler</button></li>
                <li><button type="button" onClick={() => go('antrenman')}>Nasıl çalışır</button></li>
                <li><button type="button" onClick={() => go('galeri')}>Galeri</button></li>
                <li><button type="button" onClick={() => go('deneme-dersi')}>Demo</button></li>
              </ul>
            </div>

            <div>
              <h3 className="ms-footer-col-title">Hakkımızda</h3>
              <ul className="ms-footer-links">
                <li><button type="button" onClick={() => go('kurumsal')}>Kurumsal</button></li>
                <li><button type="button" onClick={() => go('iletisim')}>İletişim</button></li>
                <li><a href={publicLoginHref()}>Panele giriş</a></li>
                <li>
                  <a href={site.websiteUrl || 'https://satrancedu.com'} target="_blank" rel="noreferrer">
                    satrancedu.com
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="ms-footer-col-title">Sözleşmeler</h3>
              <ul className="ms-footer-links">
                <li><button type="button" onClick={() => go('kvkk')}>KVKK Aydınlatma</button></li>
                <li><button type="button" onClick={() => go('gizlilik')}>Gizlilik Politikası</button></li>
                <li><button type="button" onClick={() => go('kullanim')}>Kullanım Koşulları</button></li>
                <li><button type="button" onClick={() => go('cerez')}>Çerez Politikası</button></li>
              </ul>
            </div>
          </div>

          <div className="ms-footer-bottom">
            <div className="copy">© {new Date().getFullYear()} {brand}. Tüm hakları saklıdır.</div>
            <a href="https://lim10soft.com.tr/" target="_blank" rel="noreferrer" className="ms-credit">
              <span>tasarım ve yazılım</span>
              <img src="/lim10soft-footer-logo-white.png" alt="lim10soft" />
            </a>
          </div>
        </div>
      </footer>

      {showTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--line)] bg-white text-[var(--ink)] shadow-sm"
          aria-label="Yukarı"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );
};

export default MainPublicSite;

function PageHero({
  eyebrow,
  title,
  lead,
  action,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="ms-page-hero">
      <div className="ms-container ms-page-hero-grid">
        <div>
          {eyebrow ? <span className="ms-eyebrow">{eyebrow}</span> : null}
          <h1 className="ms-h2 mt-3" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)' }}>
            {title}
          </h1>
          {lead ? (
            <p className="ms-lead mt-4" style={{ maxWidth: '36rem' }}>
              {lead}
            </p>
          ) : null}
          {action ? <div className="mt-6">{action}</div> : null}
        </div>
        <div className="ms-page-hero-visual" aria-hidden>
          <img src="/satrancedu-emblem.png" alt="" />
          <div className="ms-page-hero-board" />
        </div>
      </div>
    </section>
  );
}

function valueIcon(title: string) {
  const t = title.toLocaleLowerCase('tr-TR');
  if (t.includes('misyon')) return Target;
  if (t.includes('vizyon')) return Eye;
  if (t.includes('değer')) return Heart;
  return Building2;
}

function moduleIcon(title: string) {
  const t = title.toLocaleLowerCase('tr-TR');
  if (t.includes('canlı') || t.includes('ders')) return Video;
  if (t.includes('ödev') || t.includes('bulmaca')) return Puzzle;
  if (t.includes('çalışma') || t.includes('study')) return BookOpen;
  if (t.includes('turnuva') || t.includes('lider')) return Trophy;
  if (t.includes('whatsapp')) return MessageCircle;
  if (t.includes('kasa') || t.includes('aidat') || t.includes('finans')) return Wallet;
  if (t.includes('kurum') || t.includes('rol')) return Shield;
  if (t.includes('veli') || t.includes('öğrenci') || t.includes('başvuru')) return Users;
  return LayoutDashboard;
}

function KurumsalPage({
  site,
  brand,
  onDemo,
}: {
  site: MainSiteContent;
  brand: string;
  onDemo: () => void;
}) {
  const items = site.pageKurumsal?.items ?? [];
  return (
    <>
      <PageHero
        eyebrow="Hakkımızda"
        title={site.pageKurumsal?.title || site.aboutTitle || 'Kurumsal'}
        lead={site.pageKurumsal?.body || site.aboutBody}
        action={
          <button type="button" onClick={onDemo} className="ms-btn ms-btn-primary">
            Demo talep et <ArrowRight className="w-4 h-4" />
          </button>
        }
      />
      <section className="ms-section">
        <div className="ms-container ms-about-split">
          <div className="ms-about-panel">
            <img src="/satrancedu-emblem.png" alt="" />
            <div>
              <div className="ms-about-panel-brand">{brand}</div>
              <p>Satranç eğitimi ve akademi yönetimi tek platformda.</p>
            </div>
          </div>
          <div>
            <span className="ms-eyebrow">Neden SatrancEdu?</span>
            <h2 className="ms-h2 mt-3">Eğitime alan açan düzen</h2>
            <ul className="ms-page-checklist">
              <li>Canlı ders ve ödev aynı panelde akar</li>
              <li>Veli ve öğrenci için şeffaf takip</li>
              <li>Turnuva, kasa ve WhatsApp bir arada</li>
              <li>Rol bazlı güvenli erişim</li>
            </ul>
          </div>
        </div>
      </section>
      {items.length > 0 ? (
        <section className="ms-section alt">
          <div className="ms-container">
            <div className="ms-section-head center">
              <span className="ms-eyebrow">Temellerimiz</span>
              <h2 className="ms-h2 mt-3">Misyon, vizyon ve değerler</h2>
            </div>
            <div className="ms-value-grid">
              {items.map((it) => {
                const Icon = valueIcon(it.title);
                return (
                  <article key={it.title} className="ms-value-card">
                    <div className="ms-value-icon">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="ms-h3">{it.title}</h3>
                    <p>{it.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function FeaturesPage({ site, onDemo }: { site: MainSiteContent; onDemo: () => void }) {
  const items = (site.modules?.length ? site.modules : site.pageEgitimler?.items) ?? [];
  return (
    <>
      <PageHero
        eyebrow="Platform"
        title={site.pageEgitimler?.title || site.modulesTitle || 'Özellikler'}
        lead={site.pageEgitimler?.body || site.modulesSubtitle}
        action={
          <button type="button" onClick={onDemo} className="ms-btn ms-btn-primary">
            Demo talep et <ArrowRight className="w-4 h-4" />
          </button>
        }
      />
      <section className="ms-section">
        <div className="ms-container">
          <div className="ms-module-visual-grid">
            {items.map((m) => {
              const Icon = moduleIcon(m.title);
              return (
                <article key={m.title} className="ms-module-visual">
                  <div className="ms-module-visual-cover">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div className="ms-module-visual-body">
                    {m.tag ? <span className="ms-tag-sm">{m.tag}</span> : null}
                    <h2 className="ms-h3">{m.title}</h2>
                    <p>{m.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function HowItWorksPage({ site, onDemo }: { site: MainSiteContent; onDemo: () => void }) {
  const items = (site.steps?.length ? site.steps : site.pageAntrenman?.items) ?? [];
  const journey = site.journey ?? [];
  return (
    <>
      <PageHero
        eyebrow="Süreç"
        title={site.pageAntrenman?.title || site.stepsTitle || 'Nasıl çalışır?'}
        lead={site.pageAntrenman?.body || site.stepsSubtitle}
        action={
          <button type="button" onClick={onDemo} className="ms-btn ms-btn-primary">
            Demo talep et <ArrowRight className="w-4 h-4" />
          </button>
        }
      />
      <section className="ms-section">
        <div className="ms-container">
          <div className="ms-steps-visual">
            {items.map((s, i) => (
              <article key={s.title} className="ms-step-visual">
                <div className="ms-step-visual-n">{s.tag || `0${i + 1}`}</div>
                <h2 className="ms-h3">{s.title}</h2>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      {journey.length > 0 ? (
        <section className="ms-section alt">
          <div className="ms-container">
            <div className="ms-section-head center">
              <span className="ms-eyebrow">{site.journeyTitle || 'Yol haritası'}</span>
              <h2 className="ms-h2 mt-3">Kurulumdan aile köprüsüne</h2>
              <p className="ms-lead mt-3">{site.journeySubtitle}</p>
            </div>
            <div className="ms-journey">
              {journey.map((j) => (
                <article key={j.title} className="ms-journey-item">
                  <span className="ms-journey-n">{j.tag}</span>
                  <h3 className="ms-h3">{j.title}</h3>
                  <p>{j.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function GalleryPage({
  site,
  gallery,
}: {
  site: MainSiteContent;
  gallery: { id: string; url: string; title?: string }[];
}) {
  return (
    <>
      <PageHero
        eyebrow="Medya"
        title={site.galleryTitle || 'Galeri'}
        lead={site.gallerySubtitle || 'Eğitim ve etkinliklerden kareler'}
      />
      <section className="ms-section">
        <div className="ms-container">
          {gallery.length === 0 ? (
            <div className="ms-empty-visual">
              <ImageIcon className="w-10 h-10" />
              <h3 className="ms-h3">Henüz görsel yok</h3>
              <p>Panelden fotoğraf eklendiğinde burada listelenir.</p>
            </div>
          ) : (
            <div className="ms-gallery-masonry">
              {gallery.map((g) => (
                <figure key={g.id}>
                  <img src={g.url} alt={g.title || ''} loading="lazy" />
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function DemoPage({
  site,
  demoForm,
  setDemoForm,
  onSubmit,
}: {
  site: MainSiteContent;
  demoForm: { clubName: string; contactPerson: string; phone: string; submitted: boolean };
  setDemoForm: React.Dispatch<
    React.SetStateAction<{ clubName: string; contactPerson: string; phone: string; submitted: boolean }>
  >;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <PageHero
        eyebrow="Başlayın"
        title={site.pageDenemeDersi?.title || 'Demo talep et'}
        lead={site.pageDenemeDersi?.body || site.ctaBody}
      />
      <section className="ms-section">
        <div className="ms-container ms-demo-split">
          <div className="ms-demo-side">
            <h2 className="ms-h3">Demo ile neler görürsünüz?</h2>
            <ul className="ms-page-checklist">
              <li>Canlı ders ve ödev panelleri</li>
              <li>Veli / öğrenci görünümü</li>
              <li>Turnuva ve yoklama akışı</li>
              <li>WhatsApp bildirim örnekleri</li>
            </ul>
            <div className="ms-demo-side-card">
              <img src="/satrancedu-emblem.png" alt="" />
              <div>
                <strong>15 dakikada kurulum</strong>
                <span>Formu doldurun, hesabınızı birlikte açalım.</span>
              </div>
            </div>
          </div>
          <div className="ms-demo-card">
            {demoForm.submitted ? (
              <div className="ms-success">
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-600" />
                <h4>Talebiniz alındı</h4>
                <p>Kısa süre içinde sizinle iletişime geçeceğiz.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <div className="ms-input-group">
                  <label className="ms-input-label">Kulüp / Akademi</label>
                  <input
                    className="ms-input"
                    required
                    value={demoForm.clubName}
                    onChange={(e) => setDemoForm({ ...demoForm, clubName: e.target.value })}
                  />
                </div>
                <div className="ms-input-group">
                  <label className="ms-input-label">Yetkili</label>
                  <input
                    className="ms-input"
                    required
                    value={demoForm.contactPerson}
                    onChange={(e) => setDemoForm({ ...demoForm, contactPerson: e.target.value })}
                  />
                </div>
                <div className="ms-input-group">
                  <label className="ms-input-label">Telefon</label>
                  <input
                    className="ms-input"
                    required
                    value={demoForm.phone}
                    onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                  />
                </div>
                <button type="submit" className="ms-btn ms-btn-primary w-full py-3">
                  <Send className="w-4 h-4" /> Demo iste
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ContactPage({ site, onDemo }: { site: MainSiteContent; onDemo: () => void }) {
  const email = site.contactEmail || 'info@satrancedu.com';
  return (
    <>
      <PageHero
        eyebrow="İletişim"
        title="Bize ulaşın"
        lead="Demo, kurum kurulumu veya destek için yazın; kısa sürede dönüş yapalım."
        action={
          <button type="button" onClick={onDemo} className="ms-btn ms-btn-primary">
            Demo talep et <ArrowRight className="w-4 h-4" />
          </button>
        }
      />
      <section className="ms-section">
        <div className="ms-container">
          <div className="ms-contact-grid">
            <a className="ms-contact-card" href={`mailto:${email}`}>
              <div className="ms-value-icon">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="ms-h3">E-posta</h3>
              <p>{email}</p>
            </a>
            {site.contactPhone ? (
              <a className="ms-contact-card" href={`tel:${site.contactPhone.replace(/\D/g, '')}`}>
                <div className="ms-value-icon">
                  <Phone className="w-5 h-5" />
                </div>
                <h3 className="ms-h3">Telefon</h3>
                <p>{site.contactPhone}</p>
              </a>
            ) : (
              <div className="ms-contact-card">
                <div className="ms-value-icon">
                  <Phone className="w-5 h-5" />
                </div>
                <h3 className="ms-h3">Telefon</h3>
                <p>Demo formundan numaranızı bırakın</p>
              </div>
            )}
            <div className="ms-contact-card">
              <div className="ms-value-icon">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="ms-h3">Adres</h3>
              <p>{site.contactAddress || 'Türkiye · Uzaktan destek'}</p>
            </div>
          </div>
          {site.mapEmbedUrl ? (
            <iframe
              title="Harita"
              src={site.mapEmbedUrl}
              className="ms-map mt-8"
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

const LEGAL_PAGES: Record<
  Extract<MainSitePageId, 'kvkk' | 'gizlilik' | 'kullanim' | 'cerez'>,
  { title: string; body: string }
> = {
  kvkk: {
    title: 'KVKK Aydınlatma Metni',
    body: 'SatrancEdu olarak kişisel verilerinizi 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında işleriz. Platform kullanımı sırasında kimlik, iletişim ve eğitim süreçlerine ilişkin veriler; hizmet sunumu, güvenlik ve yasal yükümlülükler amacıyla işlenebilir. Haklarınız ve talepleriniz için info@satrancedu.com adresine yazabilirsiniz.',
  },
  gizlilik: {
    title: 'Gizlilik Politikası',
    body: 'Gizliliğinize saygı duyarız. Hesap, öğrenci ve veli bilgileri yalnızca eğitim yönetimi amaçlarıyla kullanılır; yetkisiz üçüncü taraflarla paylaşılmaz. Veri güvenliği için rol bazlı erişim ve teknik önlemler uygulanır.',
  },
  kullanim: {
    title: 'Kullanım Koşulları',
    body: 'SatrancEdu paneli, yetkili kurum kullanıcıları (yönetici, kulüp, antrenör, öğrenci, veli) için sunulur. Hesap bilgilerinin gizliliği kullanıcıya aittir. Platformun kötüye kullanımı, yetkisiz erişim veya yasalara aykırı içerik yasaktır. Koşulları kabul ederek hizmeti kullanırsınız.',
  },
  cerez: {
    title: 'Çerez Politikası',
    body: 'SatrancEdu, oturum yönetimi ve temel site işlevleri için gerekli çerezleri kullanabilir. Tercih ve performans çerezleri kullanılabilir; tarayıcı ayarlarından çerezleri yönetebilirsiniz. Detaylı bilgi için bizimle iletişime geçin.',
  },
};

function LegalPage({
  page,
  brand,
  onBack,
}: {
  page: MainSitePageId;
  brand: string;
  onBack: () => void;
}) {
  const legal = LEGAL_PAGES[page as keyof typeof LEGAL_PAGES];
  if (!legal) {
    return (
      <section className="ms-section" style={{ paddingTop: '3rem' }}>
        <div className="ms-container">
          <h1 className="ms-h2">Sayfa bulunamadı</h1>
          <button type="button" onClick={onBack} className="ms-text-link mt-6">
            ← {brand}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHero eyebrow="Sözleşmeler" title={legal.title} />
      <section className="ms-section">
        <div className="ms-container" style={{ maxWidth: 720 }}>
          <button type="button" onClick={onBack} className="ms-text-link mb-6">
            ← {brand}
          </button>
          <div className="ms-legal-card">
            <p>{legal.body}</p>
          </div>
        </div>
      </section>
    </>
  );
}
