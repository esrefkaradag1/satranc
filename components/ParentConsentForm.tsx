import React, { useEffect, useState } from 'react';
import {
  User, Users, Phone, FileCheck, PenLine, Send, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { KVKK_TEXT } from '../lib/applicationTypes';
import {
  fetchClientIp,
  loadApplicationByInviteToken,
  submitParentSignatureAsync,
} from '../services/applicationStorage';
import SignaturePad from './SignaturePad';

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-sm';

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white">
      {icon}
      <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
    </div>
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </section>
);

const ReadField: React.FC<{ label: string; value: string; className?: string }> = ({
  label,
  value,
  className = '',
}) => (
  <div className={`space-y-1 ${className}`}>
    <div className="text-xs font-bold text-slate-500 uppercase">{label}</div>
    <div className={inputCls}>{value || '—'}</div>
  </div>
);

type Props = { token: string };

const ParentConsentForm: React.FC<Props> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [kvkkOpen, setKvkkOpen] = useState(false);
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [clientIp, setClientIp] = useState('');

  const [app, setApp] = useState<Awaited<ReturnType<typeof loadApplicationByInviteToken>>>(null);

  useEffect(() => {
    fetchClientIp().then(setClientIp);
    loadApplicationByInviteToken(token).then((found) => {
      if (!found) {
        setNotFound(true);
      } else if (found.signatureDataUrl?.trim()) {
        setApp(found);
        setAlreadySigned(true);
      } else {
        setApp(found);
        setSignatureName(found.fatherName || found.motherName || '');
      }
      setLoading(false);
    });
  }, [token]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!kvkkAccepted) e.kvkk = 'KVKK metnini onaylamanız gerekir';
    if (!signatureDataUrl) e.signature = 'Dijital imza zorunludur';
    if (!signatureName.trim()) e.signatureName = 'İmzalayan ad soyad zorunludur';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const updated = await submitParentSignatureAsync(token, {
        signatureDataUrl: signatureDataUrl!,
        signatureName: signatureName.trim(),
        kvkkAccepted: true,
        clientIp,
      });
      if (updated) {
        setApp(updated);
        setSuccess(true);
      } else {
        setErrors({ submit: 'Form gönderilemedi. Link geçersiz olabilir.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-indigo-50 to-slate-100">
        <div className="max-w-md w-full rounded-2xl bg-white border border-rose-200 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-900">Link geçersiz</h1>
          <p className="text-sm text-slate-600 mt-2">Veli onay formu bulunamadı veya süresi dolmuş olabilir.</p>
        </div>
      </div>
    );
  }

  if (!app) return null;

  if (success || alreadySigned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-indigo-50 to-slate-100">
        <div className="max-w-md w-full rounded-2xl bg-white border border-emerald-200 shadow-xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">Form İmzalandı</h1>
          <p className="text-slate-600 text-sm">
            <strong>{app.name}</strong> için veli onay formunuz kaydedildi.
          </p>
          <p className="text-xs text-slate-500 mt-3 font-mono">{app.applicationNo}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="text-center space-y-2 pb-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Veli Onay Formu</h1>
          <p className="text-slate-500 text-sm">
            {app.name} — Kulüp kayıt onayı ve dijital imza
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Öğrenci Bilgileri" icon={<User className="w-4 h-4" />}>
            <ReadField label="Ad Soyad" value={app.name} />
            <ReadField label="TC Kimlik No" value={app.tcNo} />
            <ReadField label="Doğum Tarihi" value={app.birthDate} />
            <ReadField label="Şube" value={app.branchOffice} />
            <ReadField label="Grup" value={app.group} className="md:col-span-2" />
          </Section>

          <Section title="Veli Bilgileri" icon={<Users className="w-4 h-4" />}>
            <ReadField label="Baba ad soyad" value={app.fatherName} />
            <ReadField label="Baba telefon" value={app.fatherPhone} />
            <ReadField label="Anne ad soyad" value={app.motherName} />
            <ReadField label="Anne telefon" value={app.motherPhone} />
          </Section>

          <Section title="İletişim" icon={<Phone className="w-4 h-4" />}>
            <ReadField label="Adres" value={app.address} className="md:col-span-2" />
          </Section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white">
              <FileCheck className="w-4 h-4" />
              <h2 className="text-sm font-black uppercase tracking-wide">KVKK Onayı</h2>
            </div>
            <div className="p-5 space-y-3">
              <button type="button" onClick={() => setKvkkOpen(true)} className="text-sm font-bold text-indigo-600 hover:underline">
                KVKK Aydınlatma Metni ve Sözleşmeleri oku
              </button>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kvkkAccepted}
                  onChange={(e) => setKvkkAccepted(e.target.checked)}
                  className="mt-1 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">
                  KVKK metnini okudum ve kabul ediyorum. <span className="text-rose-500">*</span>
                </span>
              </label>
              {errors.kvkk ? <p className="text-xs text-rose-600">{errors.kvkk}</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-violet-600 text-white">
              <PenLine className="w-4 h-4" />
              <h2 className="text-sm font-black uppercase tracking-wide">Veli İmzası</h2>
            </div>
            <div className="p-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-600 uppercase">İmzalayan ad soyad *</span>
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Veli veya yasal temsilci"
                />
                {errors.signatureName ? <p className="text-xs text-rose-600">{errors.signatureName}</p> : null}
              </label>
              <div>
                <span className="text-xs font-bold text-slate-600 uppercase block mb-1.5">Dijital imza *</span>
                <SignaturePad onChange={setSignatureDataUrl} height={140} />
                {errors.signature ? <p className="text-xs text-rose-600 mt-1">{errors.signature}</p> : null}
              </div>
            </div>
          </section>

          {errors.submit ? <p className="text-sm text-rose-600 text-center">{errors.submit}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-sm uppercase tracking-wide shadow-lg hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Formu İmzala ve Gönder
          </button>
        </form>
      </div>

      {kvkkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setKvkkOpen(false)}>
          <div className="max-w-lg w-full max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-4">KVKK Aydınlatma Metni</h3>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{KVKK_TEXT}</pre>
            <button
              type="button"
              onClick={() => { setKvkkAccepted(true); setKvkkOpen(false); }}
              className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm"
            >
              Okudum, Anladım
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ParentConsentForm;
