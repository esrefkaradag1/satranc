import { getMainSiteContent } from './mainSiteContent';
import { listClubAnnouncements } from './clubAnnouncements';
import type { Student } from '../types';

export type ParentFeedAnnouncement = {
  id: string;
  title: string;
  body: string;
  date?: string;
  source: 'club' | 'platform';
};

export function parentPanelAnnouncements(student: Student): ParentFeedAnnouncement[] {
  const clubRows = listClubAnnouncements(student.clubId).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    date: a.date || a.createdAt?.slice(0, 10),
    source: 'club' as const,
  }));

  const site = getMainSiteContent();
  const platformRows = (site.announcements ?? []).map((a) => ({
    id: `platform-${a.id}`,
    title: a.title,
    body: a.body,
    date: a.date,
    source: 'platform' as const,
  }));

  return [...clubRows, ...platformRows].sort((a, b) =>
    String(b.date ?? '').localeCompare(String(a.date ?? '')),
  );
}
