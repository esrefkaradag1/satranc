/**
 * Günlük antrenman WhatsApp bildirimleri — sunucu tarafı.
 * Tamamlanınca anında; eksik/kısmi ise 23:00 (Europe/Istanbul).
 */
import { whatsappSendText } from './whatsappApi.mjs';
import { lichessProxyRequest } from './lichessProxyThrottle.mjs';
import {
  todayDayKey,
  istanbulNowParts,
  timestampMatchesDay,
  getStudentTrainingForDay,
  evaluatePlatformDayGoalsFromStats,
  parentPhonesForStudent,
  renderTemplate,
  buildTrainingTemplateVars,
  dbRowToStudent,
  dbRowToHomework,
  isPlatformHomework,
} from './trainingNotifyUtils.mjs';

const DEFAULT_TEMPLATES = {
  training_completed: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını tamamladı ({{tarih}} {{saat}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

{{kulup_adi}}`,
  training_partial: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını kısmen yaptı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Eksik kalan kısmı tamamlamasını hatırlatabilirsiniz.

{{kulup_adi}}`,
  training_incomplete: `Merhaba {{veli_adi}},

{{ogrenci_adi}} bugünkü antrenmanını yapmadı ({{tarih}}).

Hedef: {{bulmaca_hedef}} bulmaca, {{mac_hedef}} maç
Yapılan: {{bulmaca_sayisi}} bulmaca, {{mac_sayisi}} maç

Lütfen platformda antrenmanını tamamlamasını hatırlatın.

{{kulup_adi}}`,
};

const DEFAULT_RULES = {
  training_completed: true,
  training_partial: true,
  training_incomplete: true,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function supabaseConfig(env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function createSupabase(env) {
  const cfg = supabaseConfig(env);
  if (!cfg) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function whatsappConfigFromEnv(env) {
  const provider = String(env.WHATSAPP_PROVIDER || env.VITE_WHATSAPP_PROVIDER || 'wamessage').trim().toLowerCase();
  const defaultBase = provider === 'evolution' ? '' : 'https://api.toplusms.app';
  return {
    provider: provider === 'evolution' ? 'evolution' : 'wamessage',
    apiBaseUrl: String(env.WHATSAPP_API_BASE_URL || env.VITE_WHATSAPP_API_BASE_URL || defaultBase).trim().replace(/\/+$/, ''),
    apiKey: String(env.WHATSAPP_API_KEY || env.VITE_WHATSAPP_API_KEY || '').trim(),
    instanceName: String(env.WHATSAPP_INSTANCE || env.VITE_WHATSAPP_INSTANCE || '').trim(),
    devicePhone: String(env.WHATSAPP_DEVICE_PHONE || env.VITE_WHATSAPP_DEVICE_PHONE || '').trim(),
    enabled: Boolean(
      env.WHATSAPP_API_KEY ||
      env.VITE_WHATSAPP_API_KEY ||
      env.WHATSAPP_API_BASE_URL ||
      env.VITE_WHATSAPP_API_BASE_URL,
    ),
  };
}

async function loadWhatsAppConfig(sb, env) {
  const fromEnv = whatsappConfigFromEnv(env);
  if (!sb) return fromEnv;
  try {
    const { data } = await sb.from('whatsapp_config').select('*').eq('id', 'default').maybeSingle();
    if (!data) return fromEnv;
    return {
      provider: fromEnv.provider,
      apiBaseUrl: String(data.api_base_url ?? fromEnv.apiBaseUrl).trim().replace(/\/+$/, '') || fromEnv.apiBaseUrl,
      apiKey: String(data.api_key ?? fromEnv.apiKey).trim(),
      instanceName: String(data.instance_name ?? fromEnv.instanceName).trim(),
      devicePhone: fromEnv.devicePhone,
      enabled: data.enabled ?? fromEnv.enabled,
    };
  } catch {
    return fromEnv;
  }
}

async function loadAutoRuleEnabled(sb, event) {
  if (!sb) return DEFAULT_RULES[event] ?? false;
  try {
    const { data } = await sb.from('whatsapp_auto_rules').select('enabled').eq('event', event).maybeSingle();
    if (data == null) return DEFAULT_RULES[event] ?? false;
    return Boolean(data.enabled);
  } catch {
    return DEFAULT_RULES[event] ?? false;
  }
}

const DEFAULT_DELIVERY_CHANNELS = {
  parent_login: 'whatsapp',
  parent_consent: 'whatsapp',
  lesson_start: 'both',
  lesson_absent: 'panel',
  training_completed: 'whatsapp',
  training_partial: 'whatsapp',
  training_incomplete: 'whatsapp',
};

async function loadDeliveryChannel(sb, event) {
  if (sb) {
    try {
      const { data } = await sb
        .from('notification_delivery_rules')
        .select('channel')
        .eq('event', event)
        .maybeSingle();
      if (data?.channel) return String(data.channel);
    } catch { /* tablo yoksa whatsapp_auto_rules */ }
  }
  const enabled = await loadAutoRuleEnabled(sb, event);
  if (!enabled) return 'off';
  return DEFAULT_DELIVERY_CHANNELS[event] ?? 'whatsapp';
}

function panelContentForTraining(templateKey, student, dayIso) {
  const name = student.name || 'Öğrenci';
  const date = new Date(`${dayIso}T12:00:00`).toLocaleDateString('tr-TR');
  if (templateKey === 'training_completed') {
    return { title: 'Antrenman tamamlandı', body: `${name} bugünkü antrenman hedefini tamamladı (${date}).` };
  }
  if (templateKey === 'training_partial') {
    return { title: 'Antrenman kısmen yapıldı', body: `${name} bugünkü antrenmanını kısmen yaptı (${date}).` };
  }
  return { title: 'Antrenman yapılmadı', body: `${name} bugünkü antrenman hedefini yapmadı (${date}).` };
}

async function appendPanelNotification(sb, entry) {
  if (!sb) return;
  try {
    await sb.from('parent_panel_notifications').insert({
      id: entry.id,
      student_id: entry.studentId,
      event: entry.event,
      title: entry.title,
      body: entry.body,
      branch_office: entry.branchOffice ?? null,
      read_at: null,
      created_at: entry.createdAt,
    });
  } catch { /* ignore */ }
}

async function loadTemplateBody(sb, key) {
  if (sb) {
    try {
      const { data } = await sb.from('whatsapp_templates').select('body, enabled').eq('key', key).maybeSingle();
      if (data?.body && data.enabled !== false) return String(data.body);
    } catch { /* fallback */ }
  }
  return DEFAULT_TEMPLATES[key] ?? '';
}

async function wasNotificationSent(sb, studentId, dayIso, kind) {
  if (!sb) return false;
  try {
    const { data } = await sb
      .from('whatsapp_training_notifications')
      .select('student_id')
      .eq('student_id', studentId)
      .eq('day_iso', dayIso)
      .eq('kind', kind)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markNotificationSent(sb, studentId, dayIso, kind) {
  if (!sb) return;
  try {
    await sb.from('whatsapp_training_notifications').upsert({
      student_id: studentId,
      day_iso: dayIso,
      kind,
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[training-notify] dedup kaydı yazılamadı:', err instanceof Error ? err.message : err);
  }
}

async function appendMessageLog(sb, entry) {
  if (!sb) return;
  const row = {
    id: entry.id,
    phone: entry.phone,
    message: entry.message,
    status: entry.status,
    template_key: entry.templateKey,
    student_id: entry.studentId,
    student_name: entry.studentName,
    branch_office: entry.branchOffice,
    error: entry.error ?? null,
    created_at: entry.createdAt,
  };
  try {
    const withRecipient = entry.recipientName
      ? { ...row, recipient_name: entry.recipientName }
      : row;
    const { error } = await sb.from('whatsapp_message_logs').insert(withRecipient);
    if (error && /recipient_name/i.test(String(error.message ?? ''))) {
      await sb.from('whatsapp_message_logs').insert(row);
    }
  } catch { /* ignore */ }
}

function genId() {
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseNdjsonGames(text) {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function lichessGameTimestamp(game) {
  const createdAt = game?.createdAt ?? game?.lastMoveAt;
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') {
    const ms = new Date(createdAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

async function fetchLichessGamesForDay(username, dayIso) {
  const trimmed = String(username ?? '').trim();
  if (!trimmed) return 0;
  const [y, m, d] = dayIso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const since = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const params = new URLSearchParams();
  params.set('max', '100');
  params.set('moves', '0');
  params.set('since', String(since));
  params.set('soft', '1');
  const res = await lichessProxyRequest(
    `games/user/${trimmed}`,
    params,
    'application/x-ndjson',
  );
  if (res.status !== 200) return 0;
  const games = parseNdjsonGames(res.body);
  return games.filter((g) => {
    const ts = lichessGameTimestamp(g);
    return ts > 0 && timestampMatchesDay(ts, dayIso);
  }).length;
}

async function fetchLichessPuzzlesForDay(username, dayIso) {
  const trimmed = String(username ?? '').trim();
  if (!trimmed) return { count: 0, passed: 0, failed: 0 };
  const softQs = new URLSearchParams();
  softQs.set('soft', '1');
  const res = await lichessProxyRequest(`user/${trimmed}/activity`, softQs);
  if (res.rateLimited || res.status === 429 || res.status === 504) {
    return { count: 0, passed: 0, failed: 0 };
  }
  if (res.status < 200 || res.status >= 300) return { count: 0, passed: 0, failed: 0 };
  let activity;
  try {
    activity = JSON.parse(res.body);
  } catch {
    return { count: 0, passed: 0, failed: 0 };
  }
  if (!Array.isArray(activity)) return { count: 0, passed: 0, failed: 0 };

  // Güncel Lichess activity: interval + puzzles.score.win/loss (adet)
  for (const item of activity) {
    const start = item?.interval?.start;
    if (typeof start !== 'number' || !timestampMatchesDay(start, dayIso)) continue;
    const win = Math.max(0, Number(item?.puzzles?.score?.win ?? 0));
    const loss = Math.max(0, Number(item?.puzzles?.score?.loss ?? 0));
    if (win + loss > 0) return { count: win + loss, passed: win, failed: loss };
  }

  // Eski/yanlış tip alanlarına düşme (puzzleBatch.score rating delta olabiliyordu)
  let passed = 0;
  let failed = 0;
  for (const item of activity) {
    if (item?.type !== 'puzzle' && item?.type !== 'puzzleBatch') continue;
    const ts = typeof item.date === 'number' ? item.date : new Date(item.date ?? 0).getTime();
    if (!timestampMatchesDay(ts, dayIso)) continue;
    if (item.type === 'puzzleBatch') {
      // score.win/loss tercih; düz score/lost alanları rating delta olabilir — kullanma
      const win = Math.max(0, Number(item?.score?.win ?? item?.wins ?? 0));
      const loss = Math.max(0, Number(item?.score?.loss ?? item?.losses ?? 0));
      passed += win;
      failed += loss;
    } else {
      const win = Number(item.win ?? item.points ?? 0) > 0;
      if (win) passed += 1;
      else failed += 1;
    }
  }
  return { count: passed + failed, passed, failed };
}

async function fetchChessComGamesForDay(username, dayIso) {
  const trimmed = String(username ?? '').trim().toLowerCase();
  if (!trimmed) return 0;
  const [y, m] = dayIso.split('-');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/${y}/${m}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'NetChessAcademy/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const games = Array.isArray(data?.games) ? data.games : [];
    return games.filter((g) => {
      const ts = Number(g.end_time ?? g.endTime ?? 0) * 1000;
      return ts > 0 && timestampMatchesDay(ts, dayIso);
    }).length;
  } catch {
    return 0;
  }
}

async function fetchChessComMemberTacticsLifetime(username) {
  const trimmed = String(username ?? '').trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  try {
    const res = await fetch(
      `https://www.chess.com/callback/member/stats/puzzles/${encodeURIComponent(trimmed)}?type=rated`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'NetChessAcademy/1.0',
          Referer: profileUrl,
        },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tactics = Array.isArray(data?.stats) ? data.stats.find((s) => s?.key === 'tactics')?.stats : null;
    if (!tactics) return null;
    return {
      attemptCount: Number(tactics.attempt_count ?? 0),
      passedCount: Number(tactics.passed_count ?? 0),
      failedCount: Number(tactics.failed_count ?? 0),
    };
  } catch {
    return null;
  }
}

const chessTacticsServerTracker = new Map();

function shiftDayKey(dayIso, deltaDays) {
  const d = new Date(`${dayIso.slice(0, 10)}T12:00:00+03:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function chessComDailyFromLifetime(username, dayIso, lifetime, listStats) {
  const trimmed = String(username ?? '').trim().toLowerCase();
  const day = dayIso.slice(0, 10);
  const prev = chessTacticsServerTracker.get(trimmed);
  const yesterday = shiftDayKey(day, -1);
  const current = {
    attemptCount: Math.max(0, Number(lifetime.attemptCount ?? 0)),
    passedCount: Math.max(0, Number(lifetime.passedCount ?? 0)),
    failedCount: Math.max(0, Number(lifetime.failedCount ?? 0)),
  };

  let opening;
  if (prev?.day === day) opening = prev.opening;
  else if (prev?.day === yesterday) opening = prev.closing;
  else opening = current;

  chessTacticsServerTracker.set(trimmed, { day, opening, closing: current });

  const delta = {
    count: Math.max(0, current.attemptCount - opening.attemptCount),
    passed: Math.max(0, current.passedCount - opening.passedCount),
    failed: Math.max(0, current.failedCount - opening.failedCount),
  };
  delta.count = Math.max(delta.count, delta.passed + delta.failed);

  if (delta.count >= listStats.count) return delta;
  return listStats;
}

async function fetchChessComPuzzlesForDay(username, dayIso) {
  const trimmed = String(username ?? '').trim().toLowerCase();
  if (!trimmed) return { count: 0, passed: 0, failed: 0 };
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  const url = `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NetChessAcademy/1.0',
        Referer: profileUrl,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { count: 0, passed: 0, failed: 0 };
    const data = await res.json();
    const list = data?.recentRatedProblems;
    if (!Array.isArray(list)) return { count: 0, passed: 0, failed: 0 };
    let passed = 0;
    let failed = 0;
    for (const raw of list) {
      const dateRaw = raw?.date ?? raw?.createDate ?? '';
      const ms = typeof dateRaw === 'number' ? dateRaw * 1000 : new Date(dateRaw).getTime();
      if (!Number.isFinite(ms) || !timestampMatchesDay(ms, dayIso)) continue;
      const ratingChange = Number(raw?.rating_change ?? raw?.ratingChange ?? 0);
      const passedExplicit = raw?.is_passed ?? raw?.isPassed ?? raw?.passed;
      const ok = passedExplicit != null
        ? Boolean(passedExplicit)
        : Boolean(raw?.result === 1 || ratingChange > 0);
      if (ok) passed += 1;
      else failed += 1;
    }
    const listStats = { count: passed + failed, passed, failed };
    const lifetime = await fetchChessComMemberTacticsLifetime(trimmed);
    if (!lifetime) return listStats;
    return chessComDailyFromLifetime(trimmed, dayIso, lifetime, listStats);
  } catch {
    return { count: 0, passed: 0, failed: 0 };
  }
}

export async function fetchStudentPlatformDayStatsServer(student, dayIso) {
  const lichessUsername = student.lichessUsername?.trim();
  const chessComUsername = student.chessComUsername?.trim();
  let lichessGames = 0;
  let lichessPuzzles = { count: 0, passed: 0, failed: 0 };
  let chessComGames = 0;
  let chessComPuzzles = { count: 0, passed: 0, failed: 0 };

  if (lichessUsername) {
    lichessGames = await fetchLichessGamesForDay(lichessUsername, dayIso).catch(() => 0);
    await sleep(400);
    lichessPuzzles = await fetchLichessPuzzlesForDay(lichessUsername, dayIso).catch(() => ({
      count: 0, passed: 0, failed: 0,
    }));
  }
  if (chessComUsername) {
    chessComGames = await fetchChessComGamesForDay(chessComUsername, dayIso).catch(() => 0);
    await sleep(400);
    chessComPuzzles = await fetchChessComPuzzlesForDay(chessComUsername, dayIso).catch(() => ({
      count: 0, passed: 0, failed: 0,
    }));
  }

  return {
    games: lichessGames + chessComGames,
    puzzleSolved: lichessPuzzles.count + chessComPuzzles.count,
    puzzlePassed: lichessPuzzles.passed + chessComPuzzles.passed,
    puzzleFailed: lichessPuzzles.failed + chessComPuzzles.failed,
  };
}

async function loadStudentsAndHomeworks(sb) {
  const [studentsRes, homeworksRes] = await Promise.all([
    sb.from('students').select('*'),
    sb.from('homeworks').select('*'),
  ]);
  const students = (studentsRes.data ?? []).map(dbRowToStudent).filter((s) => s?.id);
  const homeworks = (homeworksRes.data ?? []).map(dbRowToHomework).filter((h) => h?.id && isPlatformHomework(h));
  return { students, homeworks };
}

async function sendTrainingNotification({
  sb,
  waConfig,
  student,
  training,
  evalResult,
  dayIso,
  kind,
  templateKey,
}) {
  const phones = parentPhonesForStudent(student);
  if (phones.length === 0) return { sent: 0, skipped: 'no_phone' };

  if (await wasNotificationSent(sb, student.id, dayIso, kind)) {
    return { sent: 0, skipped: 'already_sent' };
  }

  if (kind === 'incomplete') {
    const completedSent = await wasNotificationSent(sb, student.id, dayIso, 'completed');
    if (completedSent || evalResult.done) {
      return { sent: 0, skipped: 'already_completed' };
    }
  }

  const body = await loadTemplateBody(sb, templateKey);
  if (!body) return { sent: 0, skipped: 'no_template' };

  const channel = await loadDeliveryChannel(sb, templateKey);
  if (channel === 'off') return { sent: 0, skipped: 'channel_off' };

  const vars = buildTrainingTemplateVars(student, training, evalResult, dayIso);
  const message = renderTemplate(body, vars);
  const recipientName =
    vars.veli_adi
    || student.parentName
    || student.parent_name
    || student.fatherName
    || student.father_name
    || 'Veli';

  if (channel === 'panel' || channel === 'both') {
    const content = panelContentForTraining(templateKey, student, dayIso);
    await appendPanelNotification(sb, {
      id: genId(),
      studentId: student.id,
      event: templateKey,
      title: content.title,
      body: content.body,
      branchOffice: student.branchOffice,
      createdAt: new Date().toISOString(),
    });
  }

  if (channel !== 'whatsapp' && channel !== 'both') {
    await markNotificationSent(sb, student.id, dayIso, kind);
    return { sent: 0, skipped: 'panel_only', panel: true };
  }

  let sent = 0;
  for (const phone of phones) {
    const logBase = {
      id: genId(),
      phone,
      message,
      templateKey,
      studentId: student.id,
      studentName: student.name,
      recipientName,
      branchOffice: student.branchOffice,
      createdAt: new Date().toISOString(),
    };
    if (!waConfig.apiBaseUrl || !waConfig.apiKey || !waConfig.enabled) {
      await appendMessageLog(sb, {
        ...logBase,
        status: 'failed',
        error: !waConfig.enabled
          ? 'WhatsApp otomatik gönderim kapalı (whatsapp_config.enabled / API ayarları)'
          : 'WhatsApp API Key veya base URL eksik — mesaj gönderilmedi',
      });
      continue;
    }
    try {
      await whatsappSendText(waConfig, phone, message);
      await appendMessageLog(sb, { ...logBase, status: 'sent' });
      sent += 1;
    } catch (err) {
      await appendMessageLog(sb, {
        ...logBase,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Gönderilemedi',
      });
    }
    await sleep(1200);
  }

  if (sent > 0) {
    await markNotificationSent(sb, student.id, dayIso, kind);
  }
  return { sent, skipped: sent > 0 ? null : 'send_failed' };
}

async function processStudentTrainingNotify(sb, waConfig, student, homeworks, dayIso, mode) {
  const training = getStudentTrainingForDay(student, homeworks, dayIso);
  if (!training) return { studentId: student.id, action: 'no_training' };

  const stats = await fetchStudentPlatformDayStatsServer(student, dayIso);
  const evalResult = evaluatePlatformDayGoalsFromStats(
    training.gameTarget,
    training.puzzleTarget,
    training.minAccuracy,
    stats,
  );

  if (evalResult.done && (mode === 'poll' || mode === 'check')) {
    const enabled = await loadAutoRuleEnabled(sb, 'training_completed');
    if (!enabled) return { studentId: student.id, action: 'rule_disabled' };
    const result = await sendTrainingNotification({
      sb,
      waConfig,
      student,
      training,
      evalResult,
      dayIso,
      kind: 'completed',
      templateKey: 'training_completed',
    });
    return { studentId: student.id, action: 'completed', ...result };
  }

  if (!evalResult.done && mode === 'evening') {
    const hasActivity = (evalResult.games ?? 0) > 0 || (evalResult.puzzleSolved ?? 0) > 0;
    const kind = hasActivity ? 'partial' : 'incomplete';
    const templateKey = hasActivity ? 'training_partial' : 'training_incomplete';
    const ruleEvent = hasActivity ? 'training_partial' : 'training_incomplete';
    const enabled = await loadAutoRuleEnabled(sb, ruleEvent);
    if (!enabled) return { studentId: student.id, action: 'rule_disabled' };

    // Tamamlandı veya diğer akşam türü zaten gittiyse tekrarlama
    const otherKind = hasActivity ? 'incomplete' : 'partial';
    if (await wasNotificationSent(sb, student.id, dayIso, otherKind)) {
      return { studentId: student.id, action: 'already_evening_sent' };
    }

    const result = await sendTrainingNotification({
      sb,
      waConfig,
      student,
      training,
      evalResult,
      dayIso,
      kind,
      templateKey,
    });
    return { studentId: student.id, action: kind, ...result };
  }

  return { studentId: student.id, action: evalResult.done ? 'done_no_send' : 'pending' };
}

/** Tek öğrenci — tamamlanma kontrolü (öğrenci paneli tetikler) */
export async function checkStudentTrainingNotify(body, env) {
  const studentId = String(body?.studentId ?? '').trim();
  const dayIso = String(body?.dayIso ?? todayDayKey()).slice(0, 10);
  if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };

  const sb = await createSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Supabase yapılandırılmamış' } };

  const waConfig = await loadWhatsAppConfig(sb, env);
  const { data: studentRow } = await sb.from('students').select('*').eq('id', studentId).maybeSingle();
  const student = dbRowToStudent(studentRow);
  if (!student) return { status: 404, body: { error: 'Öğrenci bulunamadı' } };

  const { data: hwRows } = await sb.from('homeworks').select('*');
  const homeworks = (hwRows ?? []).map(dbRowToHomework).filter(Boolean);

  const result = await processStudentTrainingNotify(sb, waConfig, student, homeworks, dayIso, 'check');
  return { status: 200, body: { ok: true, ...result } };
}

/** Tüm öğrenciler — tamamlanma taraması (10 dk aralık) */
export async function runTrainingCompletionPoll(env) {
  const sb = await createSupabase(env);
  if (!sb) return { processed: 0, error: 'no_supabase' };

  const tr = istanbulNowParts();
  if (tr.hour < 8 || tr.hour >= 23) return { processed: 0, skipped: 'outside_hours' };

  const waConfig = await loadWhatsAppConfig(sb, env);
  const { students, homeworks } = await loadStudentsAndHomeworks(sb);
  const results = [];

  for (const student of students) {
    const r = await processStudentTrainingNotify(sb, waConfig, student, homeworks, tr.dayKey, 'poll');
    if (r.action === 'completed' && r.sent > 0) results.push(r);
    await sleep(800);
  }

  return { processed: students.length, notified: results.length, results };
}

/** 23:00 — eksik / kısmi antrenman bildirimi */
export async function runTrainingEveningNotify(env) {
  const sb = await createSupabase(env);
  if (!sb) return { processed: 0, error: 'no_supabase' };

  const tr = istanbulNowParts();
  const waConfig = await loadWhatsAppConfig(sb, env);
  const { students, homeworks } = await loadStudentsAndHomeworks(sb);
  const results = [];

  for (const student of students) {
    const r = await processStudentTrainingNotify(sb, waConfig, student, homeworks, tr.dayKey, 'evening');
    if ((r.action === 'incomplete' || r.action === 'partial') && r.sent > 0) results.push(r);
    await sleep(800);
  }

  return { processed: students.length, notified: results.length, results };
}

let lastEveningDayKey = '';
let lastPlatformSyncDayKey = '';
let lastPollAt = 0;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
/** Antrenman "eksik" WhatsApp + platform gün sonu sync — 23:00 TR. */
const NIGHTLY_HOUR_TR = 23;

/** docker-api / vite içinden periyodik çağrı */
export async function trainingNotifySchedulerTick(env, opts = {}) {
  const tr = istanbulNowParts();
  const now = Date.now();
  const out = { evening: null, poll: null, platformSync: null };
  const onNightly = typeof opts.onNightly === 'function' ? opts.onNightly : null;

  if (tr.hour === NIGHTLY_HOUR_TR && tr.minute < 6 && lastEveningDayKey !== tr.dayKey) {
    lastEveningDayKey = tr.dayKey;
    out.evening = await runTrainingEveningNotify(env);
    console.log('[training-notify] 23:00 eksik bildirimi:', out.evening?.notified ?? 0);
  }

  if (tr.hour === NIGHTLY_HOUR_TR && tr.minute < 6 && lastPlatformSyncDayKey !== tr.dayKey) {
    lastPlatformSyncDayKey = tr.dayKey;
    if (onNightly) {
      try {
        out.platformSync = await onNightly();
        console.log('[platform-day-sync] 23:00 senkron:', out.platformSync?.saved ?? 0);
      } catch (err) {
        console.error('[platform-day-sync]', err instanceof Error ? err.message : err);
      }
    }
  }

  if (tr.hour < 8 || tr.hour >= NIGHTLY_HOUR_TR) {
    // Gece sonrası / sabah öncesi tamamlanma poll'u gereksiz — Lichess kotasını koru.
  } else if (now - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = now;
    out.poll = await runTrainingCompletionPoll(env);
    if ((out.poll?.notified ?? 0) > 0) {
      console.log('[training-notify] tamamlanma bildirimi:', out.poll.notified);
    }
  }

  return out;
}

export function startTrainingNotifyScheduler(env, opts = {}) {
  const enabled = String(env.TRAINING_NOTIFY_ENABLED ?? '1').trim() !== '0';
  if (!enabled) {
    console.log('[training-notify] scheduler pasif (TRAINING_NOTIFY_ENABLED=0)');
    return;
  }
  console.log('[training-notify] scheduler aktif — tamamlanma taraması 10 dk (08–23), gece işi 23:00 TR');
  setInterval(() => {
    trainingNotifySchedulerTick(env, opts).catch((err) => {
      console.error('[training-notify]', err instanceof Error ? err.message : err);
    });
  }, 60_000);
  setTimeout(() => {
    trainingNotifySchedulerTick(env, opts).catch(() => {});
  }, 15_000);
}

export async function trainingNotifyHandler(body, env) {
  const mode = String(body?.mode ?? 'check').trim();
  if (mode === 'evening') return { status: 200, body: await runTrainingEveningNotify(env) };
  if (mode === 'poll') return { status: 200, body: await runTrainingCompletionPoll(env) };
  return checkStudentTrainingNotify(body, env);
}
