/**
 * homework_attempts insert — farklı Supabase şema kurulumları (lowercase / camelCase / snake_case).
 * Bu projedeki canlı DB: studentid, homeworkid, movesplayed, finalfen (lowercase).
 */

const STYLE_KEY = 'netchess_hw_attempt_payload_style';
const STYLE_ORDER = ['lower', 'camel', 'snake'];

export function detectHomeworkAttemptPayloadStyle(sampleRow) {
  if (!sampleRow || typeof sampleRow !== 'object') return 'lower';
  if (Object.prototype.hasOwnProperty.call(sampleRow, 'studentId')) return 'camel';
  if (Object.prototype.hasOwnProperty.call(sampleRow, 'student_id')) return 'snake';
  return 'lower';
}

export function getCachedHomeworkAttemptPayloadStyle() {
  try {
    const cached = sessionStorage.getItem(STYLE_KEY);
    if (cached && STYLE_ORDER.includes(cached)) return cached;
  } catch {
    /* ignore */
  }
  return 'lower';
}

export function setCachedHomeworkAttemptPayloadStyle(style) {
  try {
    if (STYLE_ORDER.includes(style)) sessionStorage.setItem(STYLE_KEY, style);
  } catch {
    /* ignore */
  }
}

export function normalizeHomeworkAttemptBody(body) {
  const studentId = String(body.studentId ?? '').trim();
  const homeworkId = String(body.homeworkId ?? '').trim();
  const puzzleId = String(body.puzzleId ?? '').trim();
  if (!studentId || !homeworkId || !puzzleId) {
    return { error: 'studentId, homeworkId ve puzzleId gerekli' };
  }
  return {
    record: {
      id: String(body.id ?? `att-${Date.now()}`),
      studentId,
      homeworkId,
      puzzleId,
      puzzleTitle: String(body.puzzleTitle ?? ''),
      correct: Boolean(body.correct),
      movesPlayed: Array.isArray(body.movesPlayed) ? body.movesPlayed : [],
      solutionMoves: Array.isArray(body.solutionMoves) ? body.solutionMoves : [],
      finalFen: body.finalFen != null ? String(body.finalFen) : null,
      thinkSeconds: body.thinkSeconds != null ? Number(body.thinkSeconds) : null,
      hintUsed: Boolean(body.hintUsed),
      timestamp: String(body.timestamp ?? new Date().toISOString()),
    },
  };
}

function buildPayloadVariants(record) {
  const core = {
    id: record.id,
    correct: record.correct,
    timestamp: record.timestamp,
  };
  return {
    lower: {
      ...core,
      studentid: record.studentId,
      homeworkid: record.homeworkId,
      puzzleid: record.puzzleId,
      puzzletitle: record.puzzleTitle,
      movesplayed: record.movesPlayed ?? [],
      solutionmoves: record.solutionMoves ?? [],
      finalfen: record.finalFen ?? null,
    },
    camel: {
      ...core,
      studentId: record.studentId,
      homeworkId: record.homeworkId,
      puzzleId: record.puzzleId,
      puzzleTitle: record.puzzleTitle,
      movesPlayed: record.movesPlayed ?? [],
      solutionMoves: record.solutionMoves ?? [],
      finalFen: record.finalFen ?? null,
    },
    snake: {
      ...core,
      student_id: record.studentId,
      homework_id: record.homeworkId,
      puzzle_id: record.puzzleId,
      puzzle_title: record.puzzleTitle,
      moves_played: record.movesPlayed ?? [],
      solution_moves: record.solutionMoves ?? [],
      final_fen: record.finalFen ?? null,
    },
  };
}

function appendOptionalAttemptMetrics(payload, record, style) {
  const out = { ...payload };
  if (record.thinkSeconds != null && Number.isFinite(record.thinkSeconds)) {
    if (style === 'lower') out.thinkseconds = record.thinkSeconds;
    else if (style === 'camel') out.thinkSeconds = record.thinkSeconds;
    else out.think_seconds = record.thinkSeconds;
  }
  if (record.hintUsed) {
    if (style === 'lower') out.hintused = true;
    else if (style === 'camel') out.hintUsed = true;
    else out.hint_used = true;
  }
  return out;
}

/** thinkSeconds/hintUsed eski şemalarda olmayabilir — önce geniş payload dene. */
export function homeworkAttemptInsertPayloads(record, preferredStyle = getCachedHomeworkAttemptPayloadStyle()) {
  const variants = buildPayloadVariants(record);
  const order = [
    preferredStyle,
    ...STYLE_ORDER.filter((s) => s !== preferredStyle),
  ];
  const out = [];
  for (const style of order) {
    out.push({ style, payload: appendOptionalAttemptMetrics(variants[style], record, style), extended: true });
    out.push({ style, payload: variants[style], extended: false });
  }
  return out;
}

function isColumnSchemaError(message) {
  const m = String(message ?? '').toLowerCase();
  return m.includes('column') || m.includes('schema cache') || m.includes('could not find');
}

export async function insertHomeworkAttemptSupabase(sb, record, preferredStyle) {
  const attempts = homeworkAttemptInsertPayloads(record, preferredStyle);
  let lastError = '';
  for (const { style, payload } of attempts) {
    const { error } = await sb.from('homework_attempts').insert(payload);
    if (!error) {
      setCachedHomeworkAttemptPayloadStyle(style);
      return { ok: true, id: record.id };
    }
    lastError = error.message ?? String(error);
    if (!isColumnSchemaError(lastError)) break;
  }
  return { ok: false, error: lastError };
}

export async function insertHomeworkAttemptViaEnv(body, env = process.env) {
  const normalized = normalizeHomeworkAttemptBody(body);
  if (normalized.error) {
    return { status: 400, body: { error: normalized.error } };
  }

  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const serviceKey = (env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await insertHomeworkAttemptSupabase(sb, normalized.record, 'lower');
  if (!result.ok) {
    return { status: 500, body: { error: result.error || 'Kayıt hatası' } };
  }
  return { status: 200, body: { ok: true, id: normalized.record.id } };
}
