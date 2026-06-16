import React, { useCallback, useMemo, useState } from 'react';
import { Check, Copy, GraduationCap, MessageCircle, Send, Users } from 'lucide-react';
import { useApp } from '../../AppContext';
import type { CoachAiReport, Student } from '../../types';
import {
  buildCoachReportClipboardText,
  buildCoachReportWhatsAppMessage,
  getStudentParentPhone,
} from '../../lib/coachReportShare';
import { openWhatsAppSend } from '../../lib/whatsappUtils';

interface SendCoachReportBarProps {
  student: Student;
  summary: string;
  eksiklikler: string;
  hamleler: string;
  skillSnapshot?: Record<string, number>;
}

export const SendCoachReportBar: React.FC<SendCoachReportBarProps> = ({
  student,
  summary,
  eksiklikler,
  hamleler,
  skillSnapshot,
}) => {
  const { addCoachAiReport, showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const parentPhone = useMemo(() => getStudentParentPhone(student), [student]);

  const publish = useCallback(
    (opts: { student: boolean; parent: boolean }) => {
      const now = new Date().toISOString();
      const title = `Kapsamlı AI Analizi · ${new Date().toLocaleDateString('tr-TR')}`;
      addCoachAiReport({
        studentId: student.id,
        createdAt: now,
        title,
        summary,
        eksiklikler,
        hamleler,
        skillSnapshot: skillSnapshot as CoachAiReport['skillSnapshot'],
        publishedToStudent: opts.student,
        publishedToParent: opts.parent,
      });

      if (opts.student && opts.parent) {
        showToast(`${student.name} için rapor öğrenci ve veli paneline gönderildi.`, 'success');
      } else if (opts.student) {
        showToast(`Rapor öğrenci panelinde «Analizler» sekmesinde.`, 'success');
      } else {
        showToast(`Rapor veli panelinde «Analizler» sekmesinde.`, 'success');
      }
    },
    [addCoachAiReport, student, summary, eksiklikler, hamleler, skillSnapshot, showToast]
  );

  const sendWhatsAppToParent = useCallback(() => {
    if (!parentPhone) {
      showToast('Veli telefon numarası bulunamadı. Öğrenci profilini güncelleyin.', 'warning');
      return;
    }
    const now = new Date().toISOString();
    const title = `Kapsamlı AI Analizi · ${new Date().toLocaleDateString('tr-TR')}`;
    const msg = buildCoachReportWhatsAppMessage(student, {
      title,
      summary,
      eksiklikler,
      hamleler,
      createdAt: now,
    });
    openWhatsAppSend(parentPhone, msg);
    addCoachAiReport({
      studentId: student.id,
      createdAt: now,
      title,
      summary,
      eksiklikler,
      hamleler,
      skillSnapshot: skillSnapshot as CoachAiReportSkillSnapshot | undefined,
      publishedToParent: true,
    });
    showToast('WhatsApp mesajı hazırlandı.', 'success');
  }, [
    parentPhone,
    student,
    summary,
    eksiklikler,
    hamleler,
    skillSnapshot,
    showToast,
    addCoachAiReport,
  ]);

  const copyReport = useCallback(async () => {
    const text = buildCoachReportClipboardText(student, {
      title: `Kapsamlı AI Analizi`,
      summary,
      eksiklikler,
      hamleler,
      createdAt: new Date().toISOString(),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Rapor panoya kopyalandı.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Kopyalama başarısız.', 'error');
    }
  }, [student, summary, eksiklikler, hamleler, showToast]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <Send className="w-3.5 h-3.5 text-indigo-400" />
        Raporu paylaş
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => publish({ student: true, parent: false })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
        >
          <GraduationCap className="w-4 h-4" />
          Öğrenciye gönder
        </button>
        <button
          type="button"
          onClick={() => publish({ student: false, parent: true })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600/90 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
        >
          <Users className="w-4 h-4" />
          Veliye gönder
        </button>
        <button
          type="button"
          onClick={() => publish({ student: true, parent: true })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-slate-200 text-xs font-bold transition-colors"
        >
          <Send className="w-4 h-4" />
          İkisine birden
        </button>
        <button
          type="button"
          onClick={sendWhatsAppToParent}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Veliye WhatsApp
        </button>
        <button
          type="button"
          onClick={() => void copyReport()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          Kopyala
        </button>
      </div>
      {!parentPhone ? (
        <p className="text-[11px] text-amber-300/80">
          WhatsApp için öğrenci profiline baba/anne veya veli telefonu ekleyin.
        </p>
      ) : null}
    </div>
  );
};
