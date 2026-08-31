/**
 * Canlı ders sohbeti — chat_messages jsonb'ye güvenli ekleme (okuma + birleştirme + yazma).
 */

export function normalizeLiveChatMessageBody(body) {
  const roomId = String(body.roomId ?? body.room_id ?? '').trim();
  const raw = body.message && typeof body.message === 'object' ? body.message : body;
  if (!roomId) return { error: 'roomId gerekli' };
  const text = String(raw.text ?? '').trim().slice(0, 600);
  if (!text) return { error: 'text gerekli' };
  const studentId = String(raw.studentId ?? '').trim();
  if (!studentId) return { error: 'studentId gerekli' };
  const role = raw.role === 'coach' ? 'coach' : 'student';
  const id = String(
    raw.id ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
  );
  const at = String(raw.at ?? new Date().toISOString());
  const privateWithStudentId = raw.privateWithStudentId ? String(raw.privateWithStudentId) : undefined;
  return {
    record: {
      roomId,
      message: {
        id,
        studentId,
        role,
        text,
        at,
        ...(privateWithStudentId ? { privateWithStudentId } : {}),
      },
    },
  };
}

export function parseStoredChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x != null && typeof x === 'object')
    .map((x) => ({
      id: String(x.id ?? ''),
      studentId: String(x.studentId ?? ''),
      role: x.role === 'coach' ? 'coach' : 'student',
      text: String(x.text ?? ''),
      at: String(x.at ?? ''),
      privateWithStudentId: x.privateWithStudentId
        ? String(x.privateWithStudentId)
        : x.private_with_student_id
          ? String(x.private_with_student_id)
          : undefined,
    }))
    .filter((m) => m.id && m.text);
}

export function mergeChatMessages(existing, incoming) {
  const map = new Map();
  for (const m of existing) map.set(m.id, m);
  map.set(incoming.id, incoming);
  return [...map.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function mergeChatMessageLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (m?.id) map.set(m.id, m);
    }
  }
  return [...map.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
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

export async function appendLiveLessonChatMessage(sb, roomId, message) {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error: readErr } = await sb
      .from('live_lesson_state')
      .select('chat_messages')
      .eq('id', roomId)
      .maybeSingle();
    if (readErr) {
      return {
        ok: false,
        error: readErr.message ?? 'Oda okunamadı',
        status: isPgColumnError(readErr) ? 400 : 500,
        missingColumn: isPgColumnError(readErr),
      };
    }
    if (!data) return { ok: false, error: 'Oda bulunamadı', status: 404 };
    const existing = parseStoredChatMessages(data.chat_messages);
    const next = mergeChatMessages(existing, message);
    const { error: writeErr } = await sb
      .from('live_lesson_state')
      .update({ chat_messages: next, updated_at: new Date().toISOString() })
      .eq('id', roomId);
    if (!writeErr) return { ok: true, messages: next };
    if (isPgColumnError(writeErr)) {
      return {
        ok: false,
        error: writeErr.message ?? 'chat_messages kolonu yok',
        status: 400,
        missingColumn: true,
      };
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 35 * (attempt + 1)));
      continue;
    }
    return { ok: false, error: writeErr.message ?? 'Mesaj kaydedilemedi', status: 500 };
  }
  return { ok: false, error: 'Mesaj gönderilemedi', status: 500 };
}

export async function appendLiveLessonChatViaEnv(body, env = process.env) {
  const normalized = normalizeLiveChatMessageBody(body);
  if (normalized.error) return { status: 400, body: { error: normalized.error } };
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await appendLiveLessonChatMessage(sb, normalized.record.roomId, normalized.record.message);
  if (!result.ok) {
    return {
      status: result.status ?? 500,
      body: { error: result.error, missingColumn: !!result.missingColumn },
    };
  }
  return { status: 200, body: { ok: true, id: normalized.record.message.id } };
}

/** Tarayıcı: service role varsa doğrudan, yoksa /api/live-lesson-chat */
export async function persistLiveLessonChatMessage(roomId, message, getServiceClient) {
  const sb = typeof getServiceClient === 'function' ? getServiceClient() : null;
  if (sb) {
    const direct = await appendLiveLessonChatMessage(sb, roomId, message);
    if (direct.ok) return { ok: true };
    if (direct.missingColumn) {
      return { ok: false, error: direct.error, missingColumn: true };
    }
  }
  try {
    const res = await fetch('/api/live-lesson-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, message }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return {
      ok: false,
      error: body.error ?? `HTTP ${res.status}`,
      missingColumn: !!body.missingColumn,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ağ hatası' };
  }
}
