export type MobileRole = 'student' | 'parent' | 'coach' | 'club' | 'admin';

export type StudentSession = {
  role: MobileRole;
  name: string;
  studentId?: string;
  coachId?: string;
  clubId?: string;
  group?: string;
  branch?: string;
};

export type HomeSnapshot = {
  title: string;
  lines: string[];
  people: Array<{ id: string; name: string; group?: string; branch?: string }>;
};

export type PanelNotification = {
  id: string;
  studentId: string;
  event: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

function trimBase(base: string) {
  return base.trim().replace(/\/+$/, '');
}

function networkError(err: unknown, apiBase: string) {
  const raw = err instanceof Error ? err.message : '';
  if (/network request failed|could not connect|failed to connect|fetch failed/i.test(raw)) {
    return `Sunucuya ulaşılamadı (${trimBase(apiBase)}). Telefon ve bilgisayar aynı Wi-Fi’da olmalı.`;
  }
  return raw || 'Bağlantı hatası';
}

export async function loginAccount(
  apiBase: string,
  role: MobileRole,
  identifier: string,
  password: string,
): Promise<StudentSession> {
  let res: Response;
  try {
    res = await fetch(`${trimBase(apiBase)}/api/mobile-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', role, identifier: identifier.trim(), password: password.trim() }),
    });
  } catch (err) {
    throw new Error(networkError(err, apiBase));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.role) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Giriş başarısız. Webdeki kullanıcı ve şifreyi kullanın.');
  }
  const user = data.user ?? {};
  return {
    role: data.role,
    name: String(data.name || user.name || 'Hesap'),
    studentId: data.studentId ? String(data.studentId) : undefined,
    coachId: data.coachId ? String(data.coachId) : undefined,
    clubId: data.clubId ? String(data.clubId) : undefined,
    group: user.group ? String(user.group) : '',
    branch: user.branch ? String(user.branch) : '',
  };
}

export async function fetchHome(apiBase: string, session: StudentSession): Promise<HomeSnapshot> {
  const res = await fetch(`${trimBase(apiBase)}/api/mobile-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'home',
      role: session.role,
      studentId: session.studentId,
      coachId: session.coachId,
      clubId: session.clubId,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Kayıtlar alınamadı');
  }
  return {
    title: String(data?.title || session.name),
    lines: Array.isArray(data?.lines) ? data.lines.map(String) : [],
    people: Array.isArray(data?.people) ? data.people : [],
  };
}

export async function fetchNotifications(apiBase: string, studentId: string): Promise<PanelNotification[]> {
  const res = await fetch(`${trimBase(apiBase)}/api/whatsapp?action=parent-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'parent-notifications', studentId, limit: 80 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Bildirimler alınamadı');
  }
  return Array.isArray(data?.notifications) ? data.notifications : [];
}

export type StudentPanel = {
  profile: {
    id: string;
    name: string;
    studentNo: number | null;
    tcNo: string;
    birthDate: string;
    branchOffice: string;
    branch: string;
    group: string;
    level: string;
    school: string;
    status: string;
    elo: number;
    ukd: number;
    fideId: string;
    lichessUsername: string;
    chessComUsername: string;
    paymentStatus: string;
    registrationDate: string;
    fatherName: string;
    fatherPhone: string;
    motherName: string;
    motherPhone: string;
    photoUrl: string;
  };
  summary: {
    duesLabel: string;
    attendanceCount: number;
    attendanceRate: string;
    pendingHomework: number;
    studyCount: number;
    unread: number;
  };
  schedule: Array<{ id: string; day: string; startTime: string; endTime: string; topic: string; group: string }>;
  attendance: Array<{ id: string; date: string; status: string; teacherName: string; summary: string; sessionTime: string }>;
  payments: Array<{ id: string; date: string; amount: number; category: string; description: string; lessonCount: number | null }>;
  privateLesson: { packageName: string; lessonCount: number | null; amount: number; date: string } | null;
  homeworks: Array<{ id: string; title: string; dueDate: string; puzzleCount: number; solved: number; done: boolean }>;
  studies: Array<{ id: string; title: string; emoji: string; description: string; chapters: Array<{ id: string; title: string; orientation: string }> }>;
  puzzles: Array<{ id: string; title: string; difficulty: string; points: number; category: string }>;
  liveRooms: Array<{ id: string; name: string; updatedAt: string }>;
  gallery: Array<{ id: string; title: string; url: string; date: string }>;
  messages: Array<{ id: string; senderName: string; senderRole: string; text: string; createdAt: string }>;
  notifications: PanelNotification[];
  analyses: Array<{ id: string; date: string; technical: number | null; tactical: number | null; notes: string }>;
  tournaments: Array<{ id: string; name: string; format: string; startAt: string; timeControl: string; points: number | null }>;
  leaderboard: Array<{ id: string; name: string; elo: number; ukd: number; level: string }>;
};

export async function fetchStudentPanel(apiBase: string, role: MobileRole, studentId: string): Promise<StudentPanel> {
  let res: Response;
  try {
    res = await fetch(`${trimBase(apiBase)}/api/mobile-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'panel', role, studentId }),
    });
  } catch (err) {
    throw new Error(networkError(err, apiBase));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.profile) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Öğrenci paneli alınamadı');
  }
  return data as StudentPanel;
}

export async function sendStudentMessage(apiBase: string, role: MobileRole, studentId: string, text: string) {
  const res = await fetch(`${trimBase(apiBase)}/api/mobile-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-message', role, studentId, text }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Mesaj gönderilemedi');
}

export async function registerPushToken(apiBase: string, studentId: string, token: string, platform: string) {
  const res = await fetch(`${trimBase(apiBase)}/api/mobile-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', studentId, token, platform }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Token kaydedilemedi');
  }
}
