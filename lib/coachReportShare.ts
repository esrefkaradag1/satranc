import type { CoachAiReport, Student } from '../types';
import { stripMarkdownBold } from './parseAiInsightText';

export function getStudentParentPhone(student: Student): string {
  return (
    student.fatherPhone?.trim() ||
    student.motherPhone?.trim() ||
    student.parentPhone?.trim() ||
    student.contactNumbers?.[0]?.trim() ||
    ''
  );
}

export function getParentDisplayName(student: Student): string {
  return (
    student.fatherName?.trim() ||
    student.motherName?.trim() ||
    student.parentName?.trim() ||
    'Veli'
  );
}

function truncateBlock(text: string, maxLen: number): string {
  const clean = stripMarkdownBold(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

export function buildCoachReportWhatsAppMessage(
  student: Student,
  report: Pick<CoachAiReport, 'summary' | 'eksiklikler' | 'hamleler' | 'title' | 'createdAt'>
): string {
  const date = new Date(report.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parentName = getParentDisplayName(student);
  return [
    `Merhaba ${parentName},`,
    '',
    `${student.name} için satranç gelişim raporu (${date}):`,
    '',
    `📋 ${report.title}`,
    '',
    truncateBlock(report.summary, 280),
    '',
    '⚠️ Eksiklikler:',
    truncateBlock(report.eksiklikler, 520),
    '',
    '✅ Çalışma planı:',
    truncateBlock(report.hamleler, 520),
    '',
    'Detaylı rapor öğrenci/veli panelinde «Analizler» sekmesinde.',
    '',
    'İyi çalışmalar.',
  ].join('\n');
}

export function buildCoachReportClipboardText(
  student: Student,
  report: Pick<CoachAiReport, 'summary' | 'eksiklikler' | 'hamleler' | 'title' | 'createdAt'>
): string {
  const date = new Date(report.createdAt).toLocaleString('tr-TR');
  return [
    `${report.title}`,
    `Öğrenci: ${student.name}`,
    `Tarih: ${date}`,
    '',
    'ÖZET',
    stripMarkdownBold(report.summary),
    '',
    'EKSİKLİKLER',
    stripMarkdownBold(report.eksiklikler),
    '',
    'ÇALIŞMA PLANI',
    stripMarkdownBold(report.hamleler),
  ].join('\n');
}
