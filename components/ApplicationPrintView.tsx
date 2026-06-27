import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { StudentApplication } from '../lib/applicationTypes';
import { KVKK_TEXT } from '../lib/applicationTypes';

function formatDateTR(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  application: StudentApplication;
  onClose: () => void;
};

const ApplicationPrintView: React.FC<Props> = ({ application: app, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950/90 print:bg-white print:static print:overflow-visible"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-print-title"
    >
      <div
        className="fixed top-0 left-0 right-0 z-[201] flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-700 print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold text-white truncate min-w-0">
          Başvuru: {app.applicationNo} — {app.name}
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
          >
            Yazdır / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold"
          >
            <X className="w-4 h-4" />
            Kapat
          </button>
        </div>
      </div>

      <article
        id="application-print-root"
        className="max-w-3xl mx-auto my-8 mt-20 mb-12 p-8 bg-white text-slate-900 rounded-2xl shadow-2xl print:shadow-none print:my-0 print:mt-0 print:max-w-none print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="text-center border-b border-slate-200 pb-6 mb-6">
          <h1 id="application-print-title" className="text-2xl font-black">Öğrenci Başvuru / Veli Onay Formu</h1>
          <p className="text-sm text-slate-600 mt-2 font-mono">{app.applicationNo}</p>
          <p className="text-xs text-slate-500 mt-1">
            Oluşturulma: {formatDateTR(app.createdAt)}
            {app.signedAt ? ` · İmza: ${formatDateTR(app.signedAt)}` : ''}
          </p>
        </header>

        <section className="mb-6">
          <h2 className="text-sm font-black uppercase text-indigo-700 mb-3">Öğrenci Bilgileri</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {[
                ['Ad Soyad', app.name],
                ['TC Kimlik No', app.tcNo],
                ['Doğum Tarihi', app.birthDate],
                ['Şube', app.branchOffice],
                ['Grup', app.group],
                ['Okul', app.school],
                ['Öğretmen', app.teacher],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-semibold text-slate-600 w-40">{k}</td>
                  <td className="py-2">{v || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-black uppercase text-indigo-700 mb-3">Veli Bilgileri</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {[
                ['Baba', app.fatherName],
                ['Baba Tel', app.fatherPhone],
                ['Baba Meslek', app.fatherJob],
                ['Anne', app.motherName],
                ['Anne Tel', app.motherPhone],
                ['Anne Meslek', app.motherJob],
                ['Adres', app.address],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-semibold text-slate-600 w-40">{k}</td>
                  <td className="py-2">{v || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {app.healthInfo ? (
          <section className="mb-6">
            <h2 className="text-sm font-black uppercase text-indigo-700 mb-2">Sağlık Bilgisi</h2>
            <p className="text-sm whitespace-pre-wrap">{app.healthInfo}</p>
          </section>
        ) : null}

        <section className="mb-6">
          <h2 className="text-sm font-black uppercase text-indigo-700 mb-2">KVKK Onayı</h2>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed border border-slate-200 rounded-lg p-4 bg-slate-50">
            {KVKK_TEXT}
          </pre>
          <p className="text-xs mt-2 text-slate-600">
            Onay: {app.kvkkAccepted ? 'Evet' : 'Hayır'}
            {app.kvkkAcceptedAt ? ` (${formatDateTR(app.kvkkAcceptedAt)})` : ''}
          </p>
        </section>

        {app.registrarSignatureDataUrl ? (
          <section className="mb-6">
            <h2 className="text-sm font-black uppercase text-indigo-700 mb-3">Kayıt Temsilcisi İmzası</h2>
            <p className="text-sm mb-2">
              <strong>İmzalayan:</strong> {app.registrarSignatureName || '—'}
            </p>
            <img
              src={app.registrarSignatureDataUrl}
              alt="Kayıt temsilcisi imzası"
              className="max-h-28 border border-slate-300 rounded-lg p-2 bg-white"
            />
          </section>
        ) : null}

        <section>
          <h2 className="text-sm font-black uppercase text-indigo-700 mb-3">Veli İmzası</h2>
          <p className="text-sm mb-2">
            <strong>İmzalayan:</strong> {app.signatureName || '—'}
          </p>
          {app.signatureDataUrl ? (
            <img
              src={app.signatureDataUrl}
              alt="Veli imzası"
              className="max-h-28 border border-slate-300 rounded-lg p-2 bg-white"
            />
          ) : (
            <p className="text-sm text-slate-500">Veli imzası bekleniyor</p>
          )}
        </section>

        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-center print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold"
          >
            <X className="w-4 h-4" />
            Kapat
          </button>
        </div>
      </article>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #application-print-root, #application-print-root * { visibility: visible; }
          #application-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ApplicationPrintView;
