import React, { useEffect, useState } from 'react';
import { X, FileText, Printer, Loader2 } from 'lucide-react';
import type { Student } from '../types';
import type { StudentApplication } from '../lib/applicationTypes';
import {
  buildApplicationPreviewFromStudent,
  loadApplicationsByStudentId,
} from '../services/applicationStorage';
import ApplicationPrintView from './ApplicationPrintView';

type Props = {
  student: Student;
  onClose: () => void;
};

function formStatusLabel(app: StudentApplication): string {
  if (app.signatureDataUrl?.trim()) return 'İmzalı';
  if (app.status === 'signed') return 'İmzalı';
  if (app.registrarSignatureDataUrl?.trim() || app.inviteToken) return 'Veli imzası bekliyor';
  return 'İmza bekliyor';
}

function formStatusClass(app: StudentApplication): string {
  if (app.signatureDataUrl?.trim() || app.status === 'signed') {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  }
  if (app.registrarSignatureDataUrl?.trim() || app.inviteToken) {
    return 'bg-sky-500/15 text-sky-400 border-sky-500/25';
  }
  return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
}

const StudentSignedFormsModal: React.FC<Props> = ({ student, onClose }) => {
  const [applications, setApplications] = useState<StudentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [printApplication, setPrintApplication] = useState<StudentApplication | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadApplicationsByStudentId(student.id)
      .then((list) => {
        if (cancelled) return;
        setApplications(list.length > 0 ? list : [buildApplicationPreviewFromStudent(student)]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (printApplication) setPrintApplication(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [printApplication, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-[#1e293b]/95 backdrop-blur-2xl border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/60">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">Başvuru Formları</h3>
                <p className="text-xs text-slate-400 truncate">{student.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Yükleniyor…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-white">{app.applicationNo}</p>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${formStatusClass(app)}`}
                        >
                          {formStatusLabel(app)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {app.signatureDataUrl?.trim() ? (
                          <>
                            İmzalayan: {app.signatureName || '—'}
                            {app.signedAt ? ` · ${new Date(app.signedAt).toLocaleDateString('tr-TR')}` : ''}
                          </>
                        ) : app.registrarSignatureDataUrl?.trim() ? (
                          'Kayıt alındı; veli dijital imzası bekleniyor.'
                        ) : (
                          'Form görüntülenebilir; imza henüz eklenmemiş.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrintApplication(app)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-bold"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Görüntüle / İndir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {printApplication ? (
        <ApplicationPrintView
          application={printApplication}
          onClose={() => setPrintApplication(null)}
        />
      ) : null}
    </>
  );
};

export default StudentSignedFormsModal;
