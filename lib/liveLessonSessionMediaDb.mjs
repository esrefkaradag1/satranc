/**
 * Canlı ders session_media — atomik yamalar (söz isteme, bekleme odası).
 */

function normId(id) {
  if (id == null) return '';
  return String(id).trim();
}

function parseIdArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => normId(x)).filter(Boolean);
}

function isPgColumnError(err) {
  return (
    err?.status === 400 ||
    err?.code === 'PGRST204' ||
    String(err?.message ?? '')
      .toLowerCase()
      .includes('column')
  );
}

function cloneSessionMedia(sm) {
  if (!sm || typeof sm !== 'object') return {};
  return JSON.parse(JSON.stringify(sm));
}

export function normalizeSessionMediaOpBody(body) {
  const roomId = normId(body.roomId ?? body.room_id);
  const op = String(body.op ?? '').trim();
  const studentId = normId(body.studentId ?? body.student_id);
  if (!roomId) return { error: 'roomId gerekli' };
  if (!op) return { error: 'op gerekli' };
  if (
    (op === 'handRaise' || op === 'handLower' || op === 'joinPending' || op === 'releaseFloor') &&
    !studentId
  ) {
    return { error: 'studentId gerekli' };
  }
  return { record: { roomId, op, studentId } };
}

async function readSessionMedia(sb, roomId) {
  const { data, error } = await sb
    .from('live_lesson_state')
    .select('session_media')
    .eq('id', roomId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: error.message ?? 'Oda okunamadı',
      status: isPgColumnError(error) ? 400 : 500,
      missingColumn: isPgColumnError(error),
    };
  }
  if (!data) return { ok: false, error: 'Oda bulunamadı', status: 404 };
  const sm = cloneSessionMedia(data.session_media);
  return { ok: true, sessionMedia: sm };
}

async function writeSessionMedia(sb, roomId, sessionMedia) {
  const { error } = await sb
    .from('live_lesson_state')
    .update({ session_media: sessionMedia, updated_at: new Date().toISOString() })
    .eq('id', roomId);
  if (!error) return { ok: true };
  if (isPgColumnError(error)) {
    return {
      ok: false,
      error: error.message ?? 'session_media kolonu yok',
      status: 400,
      missingColumn: true,
    };
  }
  return { ok: false, error: error.message ?? 'Kayıt hatası', status: 500 };
}

export async function patchHandRaise(sb, roomId, studentId, raised) {
  const sid = normId(studentId);
  if (!sid) return { ok: false, error: 'studentId gerekli', status: 400 };
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readSessionMedia(sb, roomId);
    if (!read.ok) return read;
    const sm = read.sessionMedia;
    let list = parseIdArray(sm.handRaisedStudentIds);
    if (raised) {
      if (!list.includes(sid)) list = [...list, sid];
    } else {
      list = list.filter((id) => id !== sid);
    }
    sm.handRaisedStudentIds = list;
    const write = await writeSessionMedia(sb, roomId, sm);
    if (write.ok) return { ok: true, sessionMedia: sm, handRaisedStudentIds: list };
    if (write.missingColumn) return write;
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
      continue;
    }
    return write;
  }
  return { ok: false, error: 'Söz isteği kaydedilemedi', status: 500 };
}

export async function patchJoinPending(sb, roomId, studentId) {
  const sid = normId(studentId);
  if (!sid) return { ok: false, error: 'studentId gerekli', status: 400 };
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readSessionMedia(sb, roomId);
    if (!read.ok) return read;
    const sm = read.sessionMedia;
    const admitted = parseIdArray(sm.admittedStudentIds);
    if (admitted.includes(sid)) return { ok: true, sessionMedia: sm, alreadyAdmitted: true };
    const pending = parseIdArray(sm.pendingStudentIds);
    if (!pending.includes(sid)) pending.push(sid);
    sm.pendingStudentIds = pending;
    const write = await writeSessionMedia(sb, roomId, sm);
    if (write.ok) return { ok: true, sessionMedia: sm };
    if (write.missingColumn) return write;
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
      continue;
    }
    return write;
  }
  return { ok: false, error: 'Katılım kaydı yapılamadı', status: 500 };
}

/** Koç güncellemesi: handRaisedStudentIds sunucudaki değeri korur (öğrenci söz isteği kaybolmasın). */
export async function replaceSessionMediaPreservingHands(sb, roomId, nextSessionMedia) {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = await readSessionMedia(sb, roomId);
    if (!read.ok) return read;
    const remoteHands = parseIdArray(read.sessionMedia.handRaisedStudentIds);
    const merged = { ...read.sessionMedia, ...cloneSessionMedia(nextSessionMedia) };
    merged.handRaisedStudentIds = remoteHands;
    const write = await writeSessionMedia(sb, roomId, merged);
    if (write.ok) return { ok: true, sessionMedia: merged };
    if (write.missingColumn) return write;
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
      continue;
    }
    return write;
  }
  return { ok: false, error: 'Oturum medyası güncellenemedi', status: 500 };
}

export async function patchReleaseFloor(sb, roomId, studentId) {
  const sid = normId(studentId);
  if (!sid) return { ok: false, error: 'studentId gerekli', status: 400 };
  const read = await readSessionMedia(sb, roomId);
  if (!read.ok) return read;
  const sm = read.sessionMedia;
  if (normId(sm.floorStudentId) !== sid) {
    return { ok: true, sessionMedia: sm, released: false };
  }
  sm.floorStudentId = null;
  const write = await writeSessionMedia(sb, roomId, sm);
  if (write.ok) return { ok: true, sessionMedia: sm, released: true };
  if (write.missingColumn) return write;
  return write;
}

export async function runSessionMediaOp(sb, { roomId, op, studentId }) {
  if (op === 'handRaise') return patchHandRaise(sb, roomId, studentId, true);
  if (op === 'handLower') return patchHandRaise(sb, roomId, studentId, false);
  if (op === 'joinPending') return patchJoinPending(sb, roomId, studentId);
  if (op === 'releaseFloor') return patchReleaseFloor(sb, roomId, studentId);
  return { ok: false, error: 'Bilinmeyen op', status: 400 };
}

export async function sessionMediaOpViaEnv(body, env = process.env) {
  const normalized = normalizeSessionMediaOpBody(body);
  if (normalized.error) return { status: 400, body: { error: normalized.error } };
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await runSessionMediaOp(sb, normalized.record);
  if (!result.ok) {
    return {
      status: result.status ?? 500,
      body: { error: result.error, missingColumn: !!result.missingColumn },
    };
  }
  return { status: 200, body: { ok: true, sessionMedia: result.sessionMedia } };
}

export async function replaceSessionMediaViaEnv(body, env = process.env) {
  const roomId = normId(body.roomId ?? body.room_id);
  const sessionMedia = body.sessionMedia ?? body.session_media;
  if (!roomId) return { status: 400, body: { error: 'roomId gerekli' } };
  if (!sessionMedia || typeof sessionMedia !== 'object') {
    return { status: 400, body: { error: 'sessionMedia gerekli' } };
  }
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await replaceSessionMediaPreservingHands(sb, roomId, sessionMedia);
  if (!result.ok) {
    return {
      status: result.status ?? 500,
      body: { error: result.error, missingColumn: !!result.missingColumn },
    };
  }
  return { status: 200, body: { ok: true, sessionMedia: result.sessionMedia } };
}

export async function persistSessionMediaOp(roomId, op, studentId, getServiceClient) {
  const payload = { roomId, op, studentId };
  const sb = typeof getServiceClient === 'function' ? getServiceClient() : null;
  if (sb) {
    const direct = await runSessionMediaOp(sb, { roomId, op, studentId });
    if (direct.ok) return { ok: true, sessionMedia: direct.sessionMedia };
    if (direct.missingColumn) return { ok: false, error: direct.error, missingColumn: true };
  }
  try {
    const res = await fetch('/api/live-lesson-session-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, sessionMedia: body.sessionMedia };
    return {
      ok: false,
      error: body.error ?? `HTTP ${res.status}`,
      missingColumn: !!body.missingColumn,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}

export async function persistSessionMediaReplace(roomId, sessionMedia, getServiceClient) {
  const sb = typeof getServiceClient === 'function' ? getServiceClient() : null;
  if (sb) {
    const direct = await replaceSessionMediaPreservingHands(sb, roomId, sessionMedia);
    if (direct.ok) return { ok: true, sessionMedia: direct.sessionMedia };
    if (direct.missingColumn) return { ok: false, error: direct.error, missingColumn: true };
  }
  try {
    const res = await fetch('/api/live-lesson-session-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, sessionMedia, replace: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, sessionMedia: body.sessionMedia };
    return {
      ok: false,
      error: body.error ?? `HTTP ${res.status}`,
      missingColumn: !!body.missingColumn,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}
