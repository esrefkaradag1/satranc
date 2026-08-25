import React, { useEffect, useState } from 'react';
import { Eye, Plus, Save, Trash2, RotateCcw, ExternalLink } from 'lucide-react';
import type { MainSiteContent, MainSiteFeature, MainSiteStat } from '../../types';
import {
  getMainSiteContent,
  saveMainSiteContent,
  newMainAnnouncement,
  resetMainSiteToDefaults,
  emptyMainSiteContent,
} from '../../lib/mainSiteContent';
import { useApp } from '../../AppContext';
import MainPublicSite from '../public/MainPublicSite';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl text-sm font-medium outline-none bg-slate-950/50 border border-slate-700/60 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/40';

const MainSiteEditor: React.FC = () => {
  const { showToast } = useApp();
  const [site, setSite] = useState<MainSiteContent>(emptyMainSiteContent());
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSite(getMainSiteContent());
    setDirty(false);
  }, []);

  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}#/`;

  const patchSite = (partial: Partial<MainSiteContent>) => {
    setSite((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const patchFeature = (index: number, partial: Partial<MainSiteFeature>) => {
    setSite((prev) => {
      const features = [...(prev.features ?? [])];
      while (features.length <= index) features.push({ title: '', body: '' });
      features[index] = { ...features[index], ...partial };
      return { ...prev, features };
    });
    setDirty(true);
  };

  const patchStat = (index: number, partial: Partial<MainSiteStat>) => {
    setSite((prev) => {
      const stats = [...(prev.stats ?? [])];
      while (stats.length < 4) stats.push({ label: '', value: '' });
      stats[index] = { ...stats[index], ...partial };
      return { ...prev, stats };
    });
    setDirty(true);
  };

  const handleSave = () => {
    saveMainSiteContent({ ...site, enabled: true });
    setDirty(false);
    showToast('Ana site kaydedildi.', 'success');
  };

  const handleReset = () => {
    const next = resetMainSiteToDefaults();
    setSite(next);
    setDirty(false);
    showToast('SatrancEdu varsayılan içeriği yüklendi.', 'success');
  };

  if (preview) {
    return <MainPublicSite previewContent={site} onClosePreview={() => setPreview(false)} />;
  }

  return (
    <div className="space-y-5 max-w-4xl pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Ana Site</h1>
          <p className="text-sm text-slate-400 mt-1">
            satrancedu.com ana sayfa içeriği. Giriş, panel login sayfalarına gider.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            SatrancEdu varsayılanı
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"
          >
            <Eye className="w-3.5 h-3.5" />
            Önizle
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            Kaydet
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-slate-900/50 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-mono text-emerald-300/90 break-all">{publicUrl || '#/'}</span>
          <a href="#/" className="inline-flex items-center gap-1 text-emerald-400 font-bold hover:underline">
            Aç <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <Section title="Marka">
        <Field label="Üst marka adı" value={site.brandTitle ?? ''} onChange={(v) => patchSite({ brandTitle: v })} />
        <Field label="Kuruluş yılı" value={site.foundedYear ?? ''} onChange={(v) => patchSite({ foundedYear: v })} />
      </Section>

      <Section title="Hero">
        <Field label="Üst etiket" value={site.heroEyebrow ?? ''} onChange={(v) => patchSite({ heroEyebrow: v })} />
        <Field label="Başlık" value={site.heroTitle ?? ''} onChange={(v) => patchSite({ heroTitle: v })} />
        <Area label="Alt metin" value={site.heroSubtitle ?? ''} onChange={(v) => patchSite({ heroSubtitle: v })} rows={3} />
      </Section>

      <Section title="Öne çıkanlar">
        {(site.features ?? [{ title: '', body: '' }, { title: '', body: '' }]).slice(0, 2).map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2 rounded-xl border border-white/5 p-3">
            <Field label={`Başlık ${i + 1}`} value={f.title} onChange={(v) => patchFeature(i, { title: v })} />
            <Area label="Metin" value={f.body} onChange={(v) => patchFeature(i, { body: v })} rows={4} />
          </div>
        ))}
      </Section>

      <Section title="Hakkında">
        <Field label="Başlık" value={site.aboutTitle ?? ''} onChange={(v) => patchSite({ aboutTitle: v })} />
        <Area label="Metin" value={site.aboutBody ?? ''} onChange={(v) => patchSite({ aboutBody: v })} rows={5} />
      </Section>

      <Section title="İstatistikler">
        <div className="grid gap-3 sm:grid-cols-2">
          {(site.stats ?? []).concat(Array(4).fill({ label: '', value: '' })).slice(0, 4).map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Field label="Etiket" value={s.label} onChange={(v) => patchStat(i, { label: v })} />
              <Field label="Değer" value={s.value} onChange={(v) => patchStat(i, { value: v })} />
            </div>
          ))}
        </div>
      </Section>

      <FeatureListSection
        title="Roller"
        titleValue={site.rolesTitle ?? ''}
        subtitleValue={site.rolesSubtitle ?? ''}
        onTitle={(v) => patchSite({ rolesTitle: v })}
        onSubtitle={(v) => patchSite({ rolesSubtitle: v })}
        items={site.roles ?? []}
        onChange={(roles) => patchSite({ roles })}
      />

      <FeatureListSection
        title="Modüller"
        titleValue={site.modulesTitle ?? ''}
        subtitleValue={site.modulesSubtitle ?? ''}
        onTitle={(v) => patchSite({ modulesTitle: v })}
        onSubtitle={(v) => patchSite({ modulesSubtitle: v })}
        items={site.modules ?? []}
        onChange={(modules) => patchSite({ modules })}
      />

      <FeatureListSection
        title="Nasıl çalışır (adımlar)"
        titleValue={site.stepsTitle ?? ''}
        subtitleValue={site.stepsSubtitle ?? ''}
        onTitle={(v) => patchSite({ stepsTitle: v })}
        onSubtitle={(v) => patchSite({ stepsSubtitle: v })}
        items={site.steps ?? []}
        onChange={(steps) => patchSite({ steps })}
      />

      <FeatureListSection
        title="Neden SatrancEdu"
        titleValue={site.benefitsTitle ?? ''}
        subtitleValue={site.benefitsSubtitle ?? ''}
        onTitle={(v) => patchSite({ benefitsTitle: v })}
        onSubtitle={(v) => patchSite({ benefitsSubtitle: v })}
        items={site.benefits ?? []}
        onChange={(benefits) => patchSite({ benefits })}
      />

      <Section title="Duyurular">
        <Field label="Başlık" value={site.announcementsTitle ?? ''} onChange={(v) => patchSite({ announcementsTitle: v })} />
        <Field label="Alt metin" value={site.announcementsSubtitle ?? ''} onChange={(v) => patchSite({ announcementsSubtitle: v })} />
        <div className="space-y-3">
          {(site.announcements ?? []).map((a, idx) => (
            <div key={a.id} className="rounded-xl border border-white/5 p-3 space-y-2">
              <div className="flex justify-between gap-2">
                <Field
                  label="Başlık"
                  value={a.title}
                  onChange={(v) => {
                    const announcements = [...(site.announcements ?? [])];
                    announcements[idx] = { ...a, title: v };
                    patchSite({ announcements });
                  }}
                />
                <button
                  type="button"
                  onClick={() => patchSite({ announcements: (site.announcements ?? []).filter((x) => x.id !== a.id) })}
                  className="mt-6 p-2 rounded-lg text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Area
                label="Metin"
                value={a.body}
                onChange={(v) => {
                  const announcements = [...(site.announcements ?? [])];
                  announcements[idx] = { ...a, body: v };
                  patchSite({ announcements });
                }}
                rows={3}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => patchSite({ announcements: [...(site.announcements ?? []), newMainAnnouncement()] })}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400"
        >
          <Plus className="w-3.5 h-3.5" /> Duyuru ekle
        </button>
      </Section>

      <Section title="Galeri & CTA">
        <Field label="Galeri başlığı" value={site.galleryTitle ?? ''} onChange={(v) => patchSite({ galleryTitle: v })} />
        <Field label="Galeri alt metin" value={site.gallerySubtitle ?? ''} onChange={(v) => patchSite({ gallerySubtitle: v })} />
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={site.showGallery !== false}
            onChange={(e) => patchSite({ showGallery: e.target.checked })}
          />
          Galeriyi göster
        </label>
        <Field label="CTA başlık" value={site.ctaTitle ?? ''} onChange={(v) => patchSite({ ctaTitle: v })} />
        <Area label="CTA metin" value={site.ctaBody ?? ''} onChange={(v) => patchSite({ ctaBody: v })} rows={2} />
        <Field label="CTA buton" value={site.ctaButtonLabel ?? ''} onChange={(v) => patchSite({ ctaButtonLabel: v })} />
      </Section>

      <Section title="İletişim & saatler">
        <Field label="Telefon" value={site.contactPhone ?? ''} onChange={(v) => patchSite({ contactPhone: v })} />
        <Field label="WhatsApp" value={site.contactWhatsapp ?? ''} onChange={(v) => patchSite({ contactWhatsapp: v })} />
        <Field label="E-posta" value={site.contactEmail ?? ''} onChange={(v) => patchSite({ contactEmail: v })} />
        <Area label="Adres" value={site.contactAddress ?? ''} onChange={(v) => patchSite({ contactAddress: v })} rows={2} />
        <Field label="Hafta içi saat" value={site.openingHoursWeekday ?? ''} onChange={(v) => patchSite({ openingHoursWeekday: v })} />
        <Field label="Cumartesi" value={site.openingHoursSaturday ?? ''} onChange={(v) => patchSite({ openingHoursSaturday: v })} />
        <Field label="Pazar" value={site.openingHoursSunday ?? ''} onChange={(v) => patchSite({ openingHoursSunday: v })} />
        <Area label="Harita embed URL" value={site.mapEmbedUrl ?? ''} onChange={(v) => patchSite({ mapEmbedUrl: v })} rows={2} />
        <Field label="Facebook" value={site.facebookUrl ?? ''} onChange={(v) => patchSite({ facebookUrl: v })} />
        <Field label="Instagram" value={site.instagramUrl ?? ''} onChange={(v) => patchSite({ instagramUrl: v })} />
        <Field label="YouTube" value={site.youtubeUrl ?? ''} onChange={(v) => patchSite({ youtubeUrl: v })} />
        <Field label="Web sitesi" value={site.websiteUrl ?? ''} onChange={(v) => patchSite({ websiteUrl: v })} />
      </Section>

      <Section title="Alt sayfalar">
        <Field
          label="Kurumsal başlık"
          value={site.pageKurumsal?.title ?? ''}
          onChange={(v) => patchSite({ pageKurumsal: { title: v, body: site.pageKurumsal?.body ?? '', items: site.pageKurumsal?.items } })}
        />
        <Area
          label="Kurumsal metin"
          value={site.pageKurumsal?.body ?? ''}
          onChange={(v) => patchSite({ pageKurumsal: { title: site.pageKurumsal?.title ?? 'Kurumsal', body: v, items: site.pageKurumsal?.items } })}
          rows={3}
        />
        <Field
          label="Özellikler sayfa başlığı"
          value={site.pageEgitimler?.title ?? ''}
          onChange={(v) => patchSite({ pageEgitimler: { title: v, body: site.pageEgitimler?.body ?? '', items: site.pageEgitimler?.items } })}
        />
        <Area
          label="Özellikler sayfa metni"
          value={site.pageEgitimler?.body ?? ''}
          onChange={(v) => patchSite({ pageEgitimler: { title: site.pageEgitimler?.title ?? 'Platform özellikleri', body: v, items: site.pageEgitimler?.items } })}
          rows={2}
        />
        <Field
          label="Nasıl çalışır sayfa başlığı"
          value={site.pageAntrenman?.title ?? ''}
          onChange={(v) => patchSite({ pageAntrenman: { title: v, body: site.pageAntrenman?.body ?? '', items: site.pageAntrenman?.items } })}
        />
        <Area
          label="Nasıl çalışır sayfa metni"
          value={site.pageAntrenman?.body ?? ''}
          onChange={(v) => patchSite({ pageAntrenman: { title: site.pageAntrenman?.title ?? 'Nasıl çalışır?', body: v, items: site.pageAntrenman?.items } })}
          rows={2}
        />
        <Field
          label="Demo sayfa başlığı"
          value={site.pageDenemeDersi?.title ?? ''}
          onChange={(v) => patchSite({ pageDenemeDersi: { title: v, body: site.pageDenemeDersi?.body ?? '' } })}
        />
        <Area
          label="Demo sayfa metni"
          value={site.pageDenemeDersi?.body ?? ''}
          onChange={(v) => patchSite({ pageDenemeDersi: { title: site.pageDenemeDersi?.title ?? 'Demo / İletişim', body: v } })}
          rows={2}
        />
      </Section>
    </div>
  );
};

function FeatureListSection({
  title,
  titleValue,
  subtitleValue,
  onTitle,
  onSubtitle,
  items,
  onChange,
}: {
  title: string;
  titleValue: string;
  subtitleValue: string;
  onTitle: (v: string) => void;
  onSubtitle: (v: string) => void;
  items: MainSiteFeature[];
  onChange: (items: MainSiteFeature[]) => void;
}) {
  return (
    <Section title={title}>
      <Field label="Bölüm başlığı" value={titleValue} onChange={onTitle} />
      <Area label="Alt metin" value={subtitleValue} onChange={onSubtitle} rows={2} />
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={`${title}-${idx}`} className="rounded-xl border border-white/5 p-3 space-y-2">
            <div className="flex justify-between gap-2">
              <Field
                label="Başlık"
                value={item.title}
                onChange={(v) => {
                  const next = [...items];
                  next[idx] = { ...item, title: v };
                  onChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="mt-6 p-2 rounded-lg text-rose-400 hover:bg-rose-500/10"
                aria-label="Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Area
              label="Metin"
              value={item.body}
              onChange={(v) => {
                const next = [...items];
                next[idx] = { ...item, body: v };
                onChange(next);
              }}
              rows={3}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { title: 'Yeni madde', body: '' }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400"
      >
        <Plus className="w-3.5 h-3.5" /> Madde ekle
      </button>
    </Section>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-slate-900/40 p-4 sm:p-5 space-y-3">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1.5 w-full">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5 w-full">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <textarea className={inputCls} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default MainSiteEditor;
