import type { MainSiteAnnouncement } from '../types';

export type ClubAnnouncement = MainSiteAnnouncement & {
  clubId: string;
  createdAt: string;
};

const STORAGE_KEY = 'netchess_club_parent_announcements';

function loadAll(): ClubAnnouncement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClubAnnouncement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(rows: ClubAnnouncement[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500)));
  } catch { /* quota */ }
}

export function listClubAnnouncements(clubId?: string): ClubAnnouncement[] {
  const cid = String(clubId ?? '').trim();
  if (!cid) return [];
  return loadAll()
    .filter((a) => a.clubId === cid)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function addClubAnnouncement(input: {
  clubId: string;
  title: string;
  body: string;
}): ClubAnnouncement {
  const row: ClubAnnouncement = {
    id: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clubId: input.clubId,
    title: input.title.trim(),
    body: input.body.trim(),
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  const all = loadAll();
  all.unshift(row);
  saveAll(all);
  return row;
}

export function removeClubAnnouncement(id: string, clubId: string) {
  const cid = String(clubId).trim();
  saveAll(loadAll().filter((a) => a.id !== id || a.clubId !== cid));
}
