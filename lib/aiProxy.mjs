/**
 * Sunucu tarafı yapay zekâ (OpenRouter) uç noktası — POST /api/ai
 *
 * Neden sunucuda: anahtar eskiden VITE_OPENROUTER_API_KEY olarak tarayıcıya gidiyordu; sitenin
 * JS dosyasından herkes okuyup sınırsız harcayabilirdi. Artık anahtar yalnızca sunucu ortamında
 * (OPENROUTER_API_KEY) durur.
 *
 * Kötüye kullanım koruması:
 *  - Serbest istem kabul edilmez; yalnızca tanımlı görevler (istemleri burada kurulur).
 *  - Girdi boyutu sınırlı (deneme sayısı, metin uzunluğu, görsel boyutu).
 *  - IP başına hız sınırı ve sunucu geneli günlük istek tavanı (AI_DAILY_REQUEST_LIMIT).
 *
 * Yanıt: { text } — ayrıştırma (FEN, rapor bölümleri) istemci tarafında yapılır.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_VISION_MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-preview-05-20',
  'google/gemini-2.0-flash-001',
  'google/gemini-flash-1.5',
];

const MAX_ATTEMPTS = 50;
const MAX_TEXT = 300;
const MAX_CONTEXT_TEXT = 4000;
// İstemci görseli 1600 px'e küçültür; Vercel istek gövdesi sınırı 4.5 MB.
const MAX_IMAGE_DATA_URL = 4 * 1024 * 1024;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_REQUESTS = 30;

const ipHits = new Map();
let dailyKey = '';
let dailyCount = 0;

function envValue(env, ...names) {
  for (const n of names) {
    const v = String(env?.[n] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function clip(value, max = MAX_TEXT) {
  return String(value ?? '').slice(0, max);
}

function clipList(list, maxItems = 40) {
  return Array.isArray(list) ? list.slice(0, maxItems).map((m) => clip(m, 12)) : [];
}

function rateLimited(ip, env) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (dailyKey !== today) {
    dailyKey = today;
    dailyCount = 0;
  }
  const dailyLimit = Number(envValue(env, 'AI_DAILY_REQUEST_LIMIT')) || 500;
  if (dailyCount >= dailyLimit) return 'Günlük yapay zekâ kullanım sınırına ulaşıldı. Yarın tekrar deneyin.';

  const key = ip || 'unknown';
  const hits = (ipHits.get(key) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_MAX_REQUESTS) {
    ipHits.set(key, hits);
    return 'Çok fazla yapay zekâ isteği. Birkaç dakika sonra tekrar deneyin.';
  }
  hits.push(now);
  ipHits.set(key, hits);
  if (ipHits.size > 5000) ipHits.clear(); // bellek koruması
  dailyCount += 1;
  return null;
}

function sanitizeAttempts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ATTEMPTS).map((a) => ({
    puzzleTitle: clip(a?.puzzleTitle, 120),
    correct: !!a?.correct,
    movesPlayed: clipList(a?.movesPlayed),
    solutionMoves: clipList(a?.solutionMoves),
  }));
}

function homeworkPrompt(body) {
  const attempts = sanitizeAttempts(body.attempts);
  const summary = attempts
    .map(
      (a, i) =>
        `${i + 1}. "${a.puzzleTitle}": ${a.correct ? 'Doğru' : 'Yanlış'}. Oynanan: ${a.movesPlayed.join(', ') || '-'}. Doğru çözüm: ${a.solutionMoves.join(', ')}`,
    )
    .join('\n');
  return `Aşağıda bir öğrencinin satranç bulmaca ödevindeki denemeleri var. Öğrenci adı: ${clip(body.studentName, 120)}. Ödev: ${clip(body.homeworkTitle, 200)}.

DENEMELER:
${summary || '(Henüz ödev denemesi yok)'}

Lütfen iki bölüm halinde Türkçe yanıt ver (antrenöre gösterilecek):

1) EKSİKLİKLER: Öğrencinin zayıf olduğu noktaları, sık yaptığı hataları ve geliştirilmesi gereken becerileri kısaca listeleyin (madde işaretli, 3-6 madde).

2) HAMLELER: Hangi bulmacada hangi hamleleri oynadığı ve doğru çözümle karşılaştırması (kısa özet).`;
}

function comprehensivePrompt(body) {
  const attempts = sanitizeAttempts(body.attempts);
  const ctx = body.context && typeof body.context === 'object' ? body.context : {};
  const c = (k) => clip(ctx[k], MAX_CONTEXT_TEXT);
  const attemptsSummary = attempts
    .map(
      (a, i) =>
        `${i + 1}. "${a.puzzleTitle}": ${a.correct ? 'Doğru' : 'Yanlış'}. Oynanan: ${a.movesPlayed.join(', ') || '-'}. Çözüm: ${a.solutionMoves.join(', ') || '-'}`,
    )
    .join('\n');
  return `Sen bir satranç antrenörüsün. Öğrenci: ${clip(body.studentName, 120)}.

BECERİ DAĞILIMI (%):
${c('skillLines')}

ÖDEV ÖZETİ:
${c('homeworkLine')}

ONLİNE PLATFORM (Lichess + Chess.com):
${c('platformLine')}

PLATFORM BECERİ SKORLARI:
${c('detailedStatsLine') || c('skillLines')}

TEMPO / AKTİVİTE DAĞILIMI:
${c('activityLine') || '(Tempo verisi yok)'}

SON AÇILIŞLAR:
${c('recentOpeningsLine')}

ÖDEV DENEMELERİ (son kayıtlar):
${attemptsSummary || '(Kayıtlı ödev denemesi yok — platform verisine ağırlık ver)'}

Türkçe, antrenöre yönelik iki bölüm yaz. Her maddeyi "1." "2." şeklinde numaralandır; madde başlığını kalın yazma, sadece "Başlık: açıklama" formatı kullan.

1) EKSİKLİKLER: Açılış, taktik, oyun sonu ve platform performansına göre 4-7 madde; hangi açılışlarda/temposlarda sorun var.

2) HAMLELER: Somut çalışma planı — haftalık 3-5 adımlık öneri. Ödev denemesi yoksa platform verisinden çıkarım yap.`;
}

const SINGLE_FEN_PROMPT = `Bu görselde bir satranç tahtası pozisyonu var. Sadece FEN döndür.

Yanıt formatı (tercihen JSON):
{"boards":[{"fen":"<FEN>","solution":""}]}

veya:
FEN: <tek satır FEN>
HAMLELER: <virgülle ayrılmış UCI veya boş>`;

const MULTI_FEN_PROMPT = `Bu görselde veya PDF sayfasında BİR veya BİRDEN FAZLA satranç tahtası olabilir (ör. 2x2 ızgara, yan yana diyagramlar).

Görev:
1) Görseldeki TÜM satranç tahtalarını say (soldan sağa, yukarıdan aşağıya sıra: 1, 2, 3, ...).
2) Her tahta için geçerli standart FEN yaz.
3) Varsa o tahtaya özel çözüm hamlelerini UCI formatında virgülle ayır; yoksa boş string.

Yanıtı ÖNCELİKLE şu JSON formatında ver (başka metin ekleme):
{"boards":[{"fen":"<FEN>","solution":""},{"fen":"<FEN>","solution":""}]}

JSON mümkün değilse her tahta için şu blokları kullan:
---TAHTA 1---
FEN: <tek satır FEN>
HAMLELER: <UCI veya boş>
---TAHTA 2---
...

Önemli: Izgara düzeninde 4 tahta varsa 4 FEN döndür. Tek tahta varsa boards dizisinde 1 eleman olsun.`;

function buildMessages(body) {
  const task = String(body?.task ?? '');
  if (task === 'homework-report') {
    return { messages: [{ role: 'user', content: homeworkPrompt(body) }], vision: false };
  }
  if (task === 'comprehensive-report') {
    return { messages: [{ role: 'user', content: comprehensivePrompt(body) }], vision: false };
  }
  if (task === 'image-to-fen' || task === 'image-to-fen-multiple') {
    const image = String(body.imageDataUrl ?? '');
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return { error: 'Geçerli bir görsel gerekli.' };
    if (image.length > MAX_IMAGE_DATA_URL) return { error: 'Görsel çok büyük (en fazla ~3 MB).' };
    const prompt = task === 'image-to-fen' ? SINGLE_FEN_PROMPT : MULTI_FEN_PROMPT;
    return {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
      vision: true,
    };
  }
  return { error: 'Bilinmeyen yapay zekâ görevi.' };
}

async function chatOnce(apiKey, model, messages, referer) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(referer ? { 'HTTP-Referer': referer } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
      ...(model.includes('gemini-2.5') ? { reasoning: { effort: 'none' } } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = (await res.text()).slice(0, 500);
    const e = new Error(`OpenRouter ${res.status}: ${err}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * @param {Record<string, unknown>} body { task, ... }
 * @param {Record<string, string|undefined>} env
 * @param {{ ip?: string, referer?: string }} [meta]
 */
export async function aiHandler(body, env, meta = {}) {
  // Geriye dönük uyum: eski kurulumlarda anahtar VITE_ adıyla tanımlı. Sunucu ortamında okunması
  // güvenli — artık tarayıcıya gönderilmiyor (env-config.js / RUNTIME_ENV_KEYS'ten çıkarıldı).
  const apiKey = envValue(env, 'OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY');
  if (!apiKey) {
    return { status: 503, body: { error: 'Yapay zekâ yapılandırılmamış (sunucuda OPENROUTER_API_KEY yok).' } };
  }

  const built = buildMessages(body ?? {});
  if (built.error) return { status: 400, body: { error: built.error } };

  const limited = rateLimited(meta.ip, env);
  if (limited) return { status: 429, body: { error: limited } };

  const envModel = envValue(env, 'OPENROUTER_MODEL', 'VITE_OPENROUTER_MODEL');
  const candidates = built.vision
    ? [envModel, ...DEFAULT_VISION_MODELS]
    : [envModel || DEFAULT_VISION_MODELS[0]];
  const models = candidates.filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;
  for (const model of models) {
    try {
      const text = await chatOnce(apiKey, model, built.messages, meta.referer);
      return { status: 200, body: { text } };
    } catch (err) {
      lastError = err;
      const retryable = err?.status === 404 || /No endpoints found|not a valid model/i.test(String(err?.message));
      if (!retryable) break;
    }
  }
  const status = lastError?.status === 402 ? 402 : 502;
  return { status, body: { error: String(lastError?.message ?? 'OpenRouter isteği başarısız.').slice(0, 300) } };
}
