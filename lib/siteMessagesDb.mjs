/**
 * Site içi mesajlaşma — Supabase site_messages + tarayıcı API yedeklemesi.
 */

function isMissingTableError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase();
  const code = String(err?.code ?? '');
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  return (
    status === 404 ||
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    (msg.includes('relation') && msg.includes('site_messages'))
  );
}

export function normalizeSiteMessageBody(body) {
  const raw = body?.message && typeof body.message === 'object' ? body.message : body;
  const conversationId = String(raw.conversationId ?? raw.conversation_id ?? '').trim();
  const text = String(raw.text ?? '').trim().slice(0, 2000);
  const kind = raw.kind === 'group' ? 'group' : raw.kind === 'student' ? 'student' : raw.kind === 'parent' ? 'parent' : null;
  const senderRole = raw.senderRole ?? raw.sender_role;
  if (!conversationId || !text || !kind) return { error: 'conversationId, kind ve text gerekli' };
  if (senderRole !== 'admin' && senderRole !== 'coach' && senderRole !== 'parent' && senderRole !== 'student') {
    return { error: 'Geçersiz senderRole' };
  }
  const id = String(
    raw.id ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
  );
  const createdAt = String(raw.createdAt ?? raw.created_at ?? new Date().toISOString());
  return {
    record: {
      id,
      conversationId,
      kind,
      targetStudentId: raw.targetStudentId
        ? String(raw.targetStudentId)
        : raw.target_student_id
          ? String(raw.target_student_id)
          : undefined,
      targetGroup: raw.targetGroup ? String(raw.targetGroup) : raw.target_group ? String(raw.target_group) : undefined,
      senderRole,
      senderName: String(raw.senderName ?? raw.sender_name ?? 'Kullanıcı').trim() || 'Kullanıcı',
      text,
      createdAt,
    },
  };
}

export function siteMessageToRow(message) {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    kind: message.kind,
    target_student_id: message.targetStudentId ?? null,
    target_group: message.targetGroup ?? null,
    sender_role: message.senderRole,
    sender_name: message.senderName,
    text: message.text,
    created_at: message.createdAt,
  };
}

export async function insertSiteMessage(sb, message) {
  const { error } = await sb.from('site_messages').insert(siteMessageToRow(message));
  if (!error) return { ok: true };
  return {
    ok: false,
    error: error.message,
    missingTable: isMissingTableError(error),
  };
}

export async function fetchSiteMessages(sb, conversationId) {
  let query = sb.from('site_messages').select('*').order('created_at', { ascending: true });
  if (conversationId) query = query.eq('conversation_id', conversationId);
  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      error: error.message,
      missingTable: isMissingTableError(error),
      messages: [],
    };
  }
  return { ok: true, messages: data ?? [] };
}

export async function insertSiteMessageViaEnv(body, env) {
  const normalized = normalizeSiteMessageBody(body);
  if (normalized.error) return { status: 400, body: { error: normalized.error } };

  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await insertSiteMessage(sb, normalized.record);
  if (!result.ok) {
    return {
      status: result.missingTable ? 503 : 500,
      body: { error: result.error || 'Mesaj kaydedilemedi', missingTable: !!result.missingTable },
    };
  }
  return { status: 200, body: { ok: true, id: normalized.record.id } };
}

export async function listSiteMessagesViaEnv(conversationId, env) {
  const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) return { status: 503, body: { error: 'Sunucu yapılandırması eksik' } };

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await fetchSiteMessages(sb, conversationId);
  if (!result.ok) {
    return {
      status: result.missingTable ? 503 : 500,
      body: { error: result.error, missingTable: !!result.missingTable, messages: [] },
    };
  }
  return { status: 200, body: { messages: result.messages } };
}
