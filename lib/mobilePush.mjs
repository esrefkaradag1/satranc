/**
 * Expo push token kaydı ve gönderimi.
 * WhatsApp web panelinde kalır; ders/yoklama/antrenman olayları ayrıca telefona düşer.
 */

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

function isExpoToken(token) {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

export async function mobilePushHandler(body, env) {
  const action = String(body?.action ?? 'register').trim();
  if (action === 'register') return registerMobilePushToken(env, body);
  if (action === 'unregister') return unregisterMobilePushToken(env, body);
  if (action === 'test') return testMobilePush(env, body);
  return { status: 400, body: { error: 'Geçersiz action' } };
}

export async function registerMobilePushToken(env, body) {
  const studentId = String(body?.studentId ?? '').trim();
  const token = String(body?.token ?? '').trim();
  const platform = String(body?.platform ?? 'unknown').slice(0, 24);
  if (!studentId || !isExpoToken(token)) {
    return { status: 400, body: { error: 'Öğrenci ve geçerli Expo push token gerekli' } };
  }
  const sb = await createSupabase(env);
  if (!sb) return { status: 500, body: { error: 'Supabase yapılandırılmamış' } };
  const { error } = await sb.from('mobile_push_tokens').upsert(
    {
      expo_token: token,
      student_id: studentId,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_token' },
  );
  if (error) {
    const missing = /mobile_push_tokens|schema cache|does not exist/i.test(error.message);
    return {
      status: 500,
      body: {
        error: missing
          ? 'mobile_push_tokens tablosu yok. supabase_mobile_push.sql dosyasını çalıştırın.'
          : error.message,
      },
    };
  }
  return { status: 200, body: { ok: true } };
}

export async function unregisterMobilePushToken(env, body) {
  const token = String(body?.token ?? '').trim();
  if (!isExpoToken(token)) return { status: 400, body: { error: 'Token gerekli' } };
  const sb = await createSupabase(env);
  if (!sb) return { status: 500, body: { error: 'Supabase yapılandırılmamış' } };
  const { error } = await sb.from('mobile_push_tokens').delete().eq('expo_token', token);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

export async function testMobilePush(env, body) {
  const studentId = String(body?.studentId ?? '').trim();
  if (!studentId) return { status: 400, body: { error: 'studentId gerekli' } };
  const result = await sendMobilePushToStudent(env, {
    studentId,
    title: 'SatrançEdu',
    body: 'Mobil bildirim çalışıyor.',
    data: { event: 'test' },
  });
  if (result.error) return { status: 500, body: { error: result.error, sent: result.sent } };
  if (result.sent === 0) {
    return { status: 200, body: { ok: true, sent: 0, hint: 'Bu öğrenci için kayıtlı telefon token yok.' } };
  }
  return { status: 200, body: { ok: true, sent: result.sent } };
}

/** Panel bildirimi oluşunca kayıtlı telefonlara Expo push gönderir. Hata ana akışı bozmaz. */
export async function sendMobilePushToStudent(env, { studentId, title, body, data }, sbClient) {
  const sid = String(studentId ?? '').trim();
  if (!sid) return { sent: 0 };
  try {
    const sb = sbClient || await createSupabase(env || {});
    if (!sb) return { sent: 0 };
    const { data: rows, error } = await sb
      .from('mobile_push_tokens')
      .select('expo_token')
      .eq('student_id', sid);
    if (error || !rows?.length) return { sent: 0, error: error?.message };
    const messages = rows
      .map((row) => String(row.expo_token ?? '').trim())
      .filter(isExpoToken)
      .map((to) => ({
        to,
        title: String(title || 'SatrançEdu'),
        body: String(body || ''),
        sound: 'default',
        priority: 'high',
        channelId: 'lessons',
        data: data ?? { studentId: sid },
      }));
    if (messages.length === 0) return { sent: 0 };
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { sent: 0, error: text.slice(0, 240) || `Expo push HTTP ${res.status}` };
    }
    return { sent: messages.length };
  } catch (err) {
    return { sent: 0, error: err instanceof Error ? err.message : 'push failed' };
  }
}
