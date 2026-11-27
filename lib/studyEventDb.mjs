/**
 * chess_study_events insert + chess_studies.practice_logs güncelleme (service role).
 */

const STUDY_EVENTS_TABLE = 'chess_study_events';
const STUDIES_TABLE = 'chess_studies';

function createServiceClient(env) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const serviceKey = (env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return null;
  return { supabaseUrl, serviceKey };
}

export function normalizeStudyEventBody(body) {
  const studyId = String(body.studyId ?? '').trim();
  const chapterId = String(body.chapterId ?? '').trim();
  const studentId = String(body.studentId ?? '').trim();
  if (!studyId || !chapterId || !studentId) {
    return { error: 'studyId, chapterId ve studentId gerekli' };
  }
  const result = String(body.result ?? 'correct');
  if (!['correct', 'wrong', 'solution'].includes(result)) {
    return { error: 'Geçersiz result' };
  }
  return {
    record: {
      study_id: studyId,
      chapter_id: chapterId,
      student_id: studentId,
      move_index: Number(body.moveIndex) || 0,
      expected_move: body.expectedMove != null ? String(body.expectedMove) : null,
      played_move: body.playedMove != null ? String(body.playedMove) : null,
      result,
      think_ms: Number(body.thinkMs) || 0,
    },
  };
}

export async function insertStudyEventViaEnv(body, env = process.env) {
  const normalized = normalizeStudyEventBody(body);
  if (normalized.error) {
    return { status: 400, body: { error: normalized.error } };
  }

  const cfg = createServiceClient(env);
  if (!cfg) {
    return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(cfg.supabaseUrl, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await sb.from(STUDY_EVENTS_TABLE).insert(normalized.record);
  if (error) {
    return { status: 500, body: { error: error.message ?? String(error) } };
  }
  return { status: 200, body: { ok: true } };
}

function normalizePracticeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? raw.atIso ?? Date.now()),
    chapterId: raw.chapterId != null ? String(raw.chapterId) : undefined,
    moveNo: Number(raw.moveNo) || 1,
    playedSan: String(raw.playedSan ?? raw.played ?? ''),
    expectedSan: String(raw.expectedSan ?? raw.expected ?? ''),
    isCorrect: raw.isCorrect !== false && raw.result !== 'wrong',
    thinkMs: Number(raw.thinkMs) || 0,
    atIso: String(raw.atIso ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function mergePracticeLogEntries(existing, chapterId, chapterEntries) {
  const prev = Array.isArray(existing) ? existing : [];
  const rest = prev
    .map(normalizePracticeEntry)
    .filter(Boolean)
    .filter((item) => (item.chapterId ?? '') !== chapterId);
  const tagged = chapterEntries.map((entry) => ({ ...entry, chapterId }));
  return [...rest, ...tagged];
}

export function normalizeStudyPracticeLogBody(body) {
  const studyId = String(body.studyId ?? '').trim();
  const studentId = String(body.studentId ?? '').trim();
  const chapterId = String(body.chapterId ?? '').trim();
  if (!studyId || !studentId || !chapterId) {
    return { error: 'studyId, studentId ve chapterId gerekli' };
  }
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const normalizedEntries = entries.map(normalizePracticeEntry).filter(Boolean);
  if (normalizedEntries.length === 0) {
    return { error: 'entries boş olamaz' };
  }
  return { studyId, studentId, chapterId, entries: normalizedEntries };
}

export async function appendStudyPracticeLogsViaEnv(body, env = process.env) {
  const normalized = normalizeStudyPracticeLogBody(body);
  if (normalized.error) {
    return { status: 400, body: { error: normalized.error } };
  }

  const cfg = createServiceClient(env);
  if (!cfg) {
    return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(cfg.supabaseUrl, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: loadError } = await sb
    .from(STUDIES_TABLE)
    .select('id, practice_logs')
    .eq('id', normalized.studyId)
    .maybeSingle();

  if (loadError) {
    return { status: 500, body: { error: loadError.message ?? String(loadError) } };
  }
  if (!row) {
    return { status: 404, body: { error: 'Çalışma bulunamadı' } };
  }

  const practiceLogs =
    row.practice_logs && typeof row.practice_logs === 'object' ? { ...row.practice_logs } : {};
  const existing = practiceLogs[normalized.studentId];
  practiceLogs[normalized.studentId] = mergePracticeLogEntries(
    existing,
    normalized.chapterId,
    normalized.entries,
  );

  const { error: saveError } = await sb
    .from(STUDIES_TABLE)
    .update({
      practice_logs: practiceLogs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalized.studyId);

  if (saveError) {
    const msg = saveError.message ?? String(saveError);
    if (msg.toLowerCase().includes('practice_logs')) {
      return { status: 500, body: { error: 'practice_logs sütunu mevcut değil' } };
    }
    return { status: 500, body: { error: msg } };
  }

  return { status: 200, body: { ok: true } };
}
