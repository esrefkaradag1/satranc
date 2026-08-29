import React, { useCallback, useEffect, useState } from 'react';
import {
  X, Users, Phone, KeyRound, Copy, Check, Eye, EyeOff, GraduationCap,
} from 'lucide-react';
import type { Student } from '../../types';

type Props = {
  student: Student;
  onClose: () => void;
  onCopied?: () => void;
};

function formatPhone(digits?: string): string {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!d) return '—';
  if (d.length === 10) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 11 && d.startsWith('0')) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  }
  return d;
}

function buildClipboardText(student: Student, showSecrets: boolean): string {
  const lines = [`Öğrenci: ${student.name}`];
  if (student.fatherName?.trim() || student.parentName?.trim()) {
    lines.push(`Baba: ${student.fatherName?.trim() || student.parentName?.trim()}`);
  }
  if (student.fatherPhone?.trim()) lines.push(`Baba tel: ${formatPhone(student.fatherPhone)}`);
  if (student.motherName?.trim()) lines.push(`Anne: ${student.motherName.trim()}`);
  if (student.motherPhone?.trim()) lines.push(`Anne tel: ${formatPhone(student.motherPhone)}`);
  if (student.parentPhone?.trim()) lines.push(`Veli giriş tel: ${formatPhone(student.parentPhone)}`);
  if (student.parentPin?.trim() && showSecrets) lines.push(`Veli PIN: ${student.parentPin.trim()}`);
  if (student.username?.trim()) lines.push(`Öğrenci kullanıcı adı: ${student.username.trim()}`);
  if (student.password?.trim() && showSecrets) lines.push(`Öğrenci şifre: ${student.password.trim()}`);
  return lines.join('\n');
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`text-sm text-slate-100 truncate ${mono ? 'font-mono' : 'font-medium'}`} title={value}>
        {value || '—'}
      </span>
    </div>
  );
}

function SecretRow({
  label,
  value,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-slate-950/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <p className={`text-sm font-mono text-slate-100 mt-0.5 break-all ${!show ? 'tracking-widest' : ''}`}>
          {show ? value : '••••••••'}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        title={show ? 'Gizle' : 'Göster'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

const StudentParentAccessModal: React.FC<Props> = ({ student, onClose, onCopied }) => {
  const [showParentPin, setShowParentPin] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const parentPin = student.parentPin?.trim() || '';
  const username = student.username?.trim() || '';
  const password = student.password?.trim() || '';
  const loginPhone = student.parentPhone?.trim() || student.fatherPhone?.trim() || student.motherPhone?.trim() || '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyAll = useCallback(() => {
    const text = buildClipboardText(student, true);
    if (!text.trim()) return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [onCopied, student]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="parent-access-title"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-white/[0.06] bg-[#1e293b]/95 backdrop-blur-md">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-300 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="parent-access-title" className="text-lg font-black text-white truncate">
                Veli & Giriş Bilgileri
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{student.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-300/90 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Veli iletişim
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow
                label="Baba"
                value={student.fatherName?.trim() || student.parentName?.trim() || '—'}
              />
              <InfoRow label="Baba tel" value={formatPhone(student.fatherPhone || student.parentPhone)} mono />
              <InfoRow label="Anne" value={student.motherName?.trim() || '—'} />
              <InfoRow label="Anne tel" value={formatPhone(student.motherPhone)} mono />
            </div>
            {(student.contactNumbers?.length ?? 0) > 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Diğer numaralar</span>
                {student.contactNumbers!.slice(0, 3).map((p, i) => (
                  <p key={i} className="text-sm font-mono text-slate-200 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    {formatPhone(p)}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300/90 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Veli paneli girişi
            </h3>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
              <InfoRow label="Giriş telefonu" value={formatPhone(loginPhone)} mono />
              <SecretRow
                label="Veli PIN"
                value={parentPin}
                show={showParentPin}
                onToggle={() => setShowParentPin((v) => !v)}
              />
              {!parentPin ? (
                <p className="text-[11px] text-slate-500">
                  PIN tanımlı değilse veli, telefon numarasının son 4 hanesi ile giriş yapabilir.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-300/90 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" />
              Öğrenci paneli girişi
            </h3>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              {username ? (
                <InfoRow label="Kullanıcı adı" value={username} mono />
              ) : (
                <p className="text-sm text-slate-500">Öğrenci kullanıcı adı tanımlı değil.</p>
              )}
              <SecretRow
                label="Şifre"
                value={password}
                show={showStudentPassword}
                onToggle={() => setShowStudentPassword((v) => !v)}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={copyAll}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Kopyalandı' : 'Tüm bilgileri kopyala'}
          </button>
          <p className="text-[10px] text-center text-slate-500">
            Bu bilgileri yalnızca veli/öğrenci ile güvenli kanallardan paylaşın.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentParentAccessModal;
