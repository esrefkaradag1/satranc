import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, User, Heart, Users, Phone, FileCheck, PenLine, Send, CheckCircle2,
  Upload, X, AlertCircle, Loader2,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { KVKK_TEXT } from '../lib/applicationTypes';
import { validateTcNo, validateTrPhone, ageFromBirthDate } from '../lib/applicationValidation';
import { createApplicationAsync, fetchClientIp } from '../services/applicationStorage';
import SignaturePad from './SignaturePad';

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400';

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

const Field: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, error, hint, className = '', children }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
      {label}
      {required ? <span className="text-rose-500 ml-0.5">*</span> : null}
    </label>
    {children}
    {error ? <p className="text-xs text-rose-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p> : null}
    {hint && !error ? <p className="text-xs text-slate-400">{hint}</p> : null}
  </div>
);

const ApplicationForm: React.FC = () => {
  const { branchOffices, groups } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ no: string } | null>(null);
  const [clientIp, setClientIp] = useState('');
  const [kvkkOpen, setKvkkOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [branchOffice, setBranchOffice] = useState('');
  const [group, setGroup] = useState('');
  const [tcNo, setTcNo] = useState('');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [lichessUsername, setLichessUsername] = useState('');
  const [chessComUsername, setChessComUsername] = useState('');
  const [school, setSchool] = useState('');
  const [teacher, setTeacher] = useState('');
  const [notes, setNotes] = useState('');
  const [healthInfo, setHealthInfo] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [fatherJob, setFatherJob] = useState('');
  const [motherName, setMotherName] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [motherJob, setMotherJob] = useState('');
  const [address, setAddress] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [phone3, setPhone3] = useState('');
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');

  useEffect(() => {
    fetchClientIp().then(setClientIp);
  }, []);

  const maxBirthDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 4);
    return d.toISOString().slice(0, 10);
  }, []);

  const onPhoto = (file: File | null) => {
    if (!file) {
      setPhotoDataUrl(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((e) => ({ ...e, photo: 'Dosya boyutu 5MB\'dan büyük olamaz' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!branchOffice.trim()) e.branchOffice = 'Şube seçiniz';
    if (!tcNo.trim() || !validateTcNo(tcNo)) e.tcNo = 'Geçerli 11 haneli TC Kimlik No giriniz';
    if (!name.trim()) e.name = 'Ad soyad zorunludur';
    if (!birthDate) e.birthDate = 'Doğum tarihi zorunludur';
    else {
      const age = ageFromBirthDate(birthDate);
      if (age != null && age < 4) e.birthDate = 'Öğrenci en az 4 yaşında olmalıdır';
    }
    if (!phone1.trim() || !validateTrPhone(phone1)) e.phone1 = 'Geçerli cep telefonu girin (05XX veya 5XX)';
    if (!kvkkAccepted) e.kvkk = 'KVKK metnini onaylamanız gerekir';
    if (!signatureDataUrl) e.signature = 'Dijital imza zorunludur';
    if (!signatureName.trim()) e.signatureName = 'İmzalayan ad soyad zorunludur';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const phones = [phone1, phone2, phone3].map((p) => p.replace(/\D/g, '')).filter(Boolean);
      const now = new Date().toISOString();
      const app = await createApplicationAsync({
        branchOffice: branchOffice.trim(),
        group: group.trim(),
        tcNo: tcNo.replace(/\D/g, ''),
        name: name.trim(),
        birthDate,
        photoDataUrl,
        lichessUsername: lichessUsername.trim().toLowerCase(),
        chessComUsername: chessComUsername.trim().toLowerCase(),
        school: school.trim(),
        teacher: teacher.trim(),
        notes: notes.trim(),
        healthInfo: healthInfo.trim(),
        fatherName: fatherName.trim(),
        fatherPhone: fatherPhone.trim(),
        fatherJob: fatherJob.trim(),
        motherName: motherName.trim(),
        motherPhone: motherPhone.trim(),
        motherJob: motherJob.trim(),
        address: address.trim(),
        phones,
        kvkkAccepted: true,
        kvkkAcceptedAt: now,
        clientIp,
        signatureDataUrl: signatureDataUrl!,
        signatureName: signatureName.trim(),
        signedAt: now,
      });
      setSuccess({ no: app.applicationNo });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErrors({ submit: 'Başvuru gönderilemedi. Lütfen tekrar deneyin.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-emerald-200 shadow-xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">Başvurunuz Alındı</h1>
          <p className="text-slate-600 text-sm mb-4">
            Başvuru numaranız: <strong className="text-indigo-600">{success.no}</strong>
          </p>
          <p className="text-xs text-slate-500">En kısa sürede sizinle iletişime geçilecektir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="text-center space-y-2 pb-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Başvuru Formu</h1>
          <p className="text-slate-500 text-sm">Geleceğin sporcuları için ilk adım</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Şube Bilgileri" icon={<Building2 className="w-4 h-4" />}>
            <Field label="Şube" required error={errors.branchOffice}>
              <select value={branchOffice} onChange={(e) => setBranchOffice(e.target.value)} className={inputCls}>
                <option value="">Şube Seçiniz</option>
                {branchOffices.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Grup (opsiyonel)" hint="İsterseniz grup seçebilirsiniz">
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={inputCls}>
                <option value="">Grup Seçiniz (Opsiyonel)</option>
                {groups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Öğrenci Bilgileri" icon={<User className="w-4 h-4" />}>
            <Field label="Fotoğraf" error={errors.photo} className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-4">
                {photoDataUrl ? (
                  <div className="relative">
                    <img src={photoDataUrl} alt="" className="w-24 h-24 rounded-xl object-cover border" />
                    <button type="button" onClick={() => setPhotoDataUrl(null)} className="absolute -top-2 -right-2 p-1 rounded-full bg-rose-500 text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer hover:border-indigo-400 bg-slate-50">
                    <Upload className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-500 text-center px-2">JPG/PNG max 5MB</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>
            </Field>
            <Field label="TC Kimlik No" required error={errors.tcNo} hint="UKD ve FIDE işlemleri için zorunludur">
              <input value={tcNo} onChange={(e) => setTcNo(e.target.value.replace(/\D/g, '').slice(0, 11))} className={inputCls} inputMode="numeric" />
            </Field>
            <Field label="Ad Soyad" required error={errors.name}>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Doğum Tarihi" required error={errors.birthDate} hint="En az 4 yaş">
              <input type="date" max={maxBirthDate} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Lichess kullanıcı adı" hint="Opsiyonel, küçük harf">
              <input value={lichessUsername} onChange={(e) => setLichessUsername(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Chess.com kullanıcı adı" hint="Opsiyonel, küçük harf">
              <input value={chessComUsername} onChange={(e) => setChessComUsername(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Devam ettiği okul">
              <input value={school} onChange={(e) => setSchool(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Öğretmeni">
              <input value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Açıklama" className="md:col-span-2">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
            </Field>
          </Section>

          <Section title="Sağlık Bilgileri" icon={<Heart className="w-4 h-4" />}>
            <Field label="Sağlık durumu" className="md:col-span-2">
              <textarea value={healthInfo} onChange={(e) => setHealthInfo(e.target.value)} rows={3} className={inputCls} placeholder="Alerji, kronik hastalık vb." />
            </Field>
          </Section>

          <Section title="Veli Bilgileri" icon={<Users className="w-4 h-4" />}>
            <Field label="Baba ad soyad"><input value={fatherName} onChange={(e) => setFatherName(e.target.value)} className={inputCls} /></Field>
            <Field label="Baba telefon" hint="0 ile başlamalı"><input value={fatherPhone} onChange={(e) => setFatherPhone(e.target.value)} className={inputCls} /></Field>
            <Field label="Baba meslek"><input value={fatherJob} onChange={(e) => setFatherJob(e.target.value)} className={inputCls} /></Field>
            <Field label="Anne ad soyad"><input value={motherName} onChange={(e) => setMotherName(e.target.value)} className={inputCls} /></Field>
            <Field label="Anne telefon" hint="0 ile başlamalı"><input value={motherPhone} onChange={(e) => setMotherPhone(e.target.value)} className={inputCls} /></Field>
            <Field label="Anne meslek"><input value={motherJob} onChange={(e) => setMotherJob(e.target.value)} className={inputCls} /></Field>
          </Section>

          <Section title="İletişim" icon={<Phone className="w-4 h-4" />}>
            <Field label="Adres" className="md:col-span-2">
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputCls} />
            </Field>
            <Field label="Telefon 1 (WhatsApp)" required error={errors.phone1}>
              <input value={phone1} onChange={(e) => setPhone1(e.target.value)} className={inputCls} placeholder="05XX XXX XX XX veya 5XX XXX XX XX" />
            </Field>
            <Field label="Telefon 2"><input value={phone2} onChange={(e) => setPhone2(e.target.value)} className={inputCls} /></Field>
            <Field label="Telefon 3"><input value={phone3} onChange={(e) => setPhone3(e.target.value)} className={inputCls} /></Field>
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
                <input type="checkbox" checked={kvkkAccepted} onChange={(e) => setKvkkAccepted(e.target.checked)} className="mt-1 rounded border-slate-300" />
                <span className="text-sm text-slate-700">
                  KVKK metnini okudum ve kabul ediyorum. <span className="text-rose-500">*</span>
                </span>
              </label>
              {errors.kvkk ? <p className="text-xs text-rose-600">{errors.kvkk}</p> : null}
              {clientIp ? (
                <p className="text-xs text-slate-400">IP adresiniz güvenlik amacıyla kaydedilecektir: {clientIp}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-violet-600 text-white">
              <PenLine className="w-4 h-4" />
              <h2 className="text-sm font-black uppercase tracking-wide">Veli / Başvurucu İmzası</h2>
            </div>
            <div className="p-5 space-y-4">
              <Field label="İmzalayan ad soyad" required error={errors.signatureName}>
                <input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} className={inputCls} placeholder="Veli veya yasal temsilci" />
              </Field>
              <Field label="Dijital imza" required error={errors.signature}>
                <SignaturePad onChange={setSignatureDataUrl} height={140} />
              </Field>
              <p className="text-xs text-slate-500">
                İmzanız dijital ortamda kayıt altına alınır ve başvuru belgesinin ayrılmaz parçasıdır.
              </p>
            </div>
          </section>

          {errors.submit ? <p className="text-sm text-rose-600 text-center">{errors.submit}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-sm uppercase tracking-wide shadow-lg hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Başvuruyu Gönder
          </button>
        </form>
      </div>

      {kvkkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setKvkkOpen(false)}>
          <div className="max-w-lg w-full max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-4">KVKK Aydınlatma Metni</h3>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{KVKK_TEXT}</pre>
            <button type="button" onClick={() => { setKvkkAccepted(true); setKvkkOpen(false); }} className="mt-4 w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">
              Okudum, Anladım
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ApplicationForm;
