import { getRuntimeEnv } from '../runtimeEnv';

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const getApiKey = () => getRuntimeEnv('VITE_OPENROUTER_API_KEY');

const ENV_MODEL = getRuntimeEnv('VITE_OPENROUTER_MODEL');

/** Vision için model sırası — 404 olursa sıradaki denenir */
const VISION_MODEL_CANDIDATES = [
  ENV_MODEL,
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-preview-05-20",
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

const TEXT_MODEL = VISION_MODEL_CANDIDATES[0] || "google/gemini-2.5-flash";

type ChatMessage =
  | { role: "user"; content: string }
  | { role: "user"; content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };

export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

async function chatOnce(
  messages: ChatMessage[],
  model: string,
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new OpenRouterError("OpenRouter API anahtarı tanımlı değil (VITE_OPENROUTER_API_KEY).");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
      ...(model.includes("gemini-2.5")
        ? { reasoning: { effort: "none" } }
        : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new OpenRouterError(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function chat(
  messages: ChatMessage[],
  options?: { model?: string; vision?: boolean },
): Promise<string> {
  const candidates = options?.vision
    ? (options.model ? [options.model, ...VISION_MODEL_CANDIDATES] : VISION_MODEL_CANDIDATES)
    : [options?.model ?? TEXT_MODEL];

  const unique = candidates.filter((m, i, arr) => m && arr.indexOf(m) === i);
  let lastError: Error | null = null;

  for (const model of unique) {
    try {
      return await chatOnce(messages, model);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;
      const retryable = msg.includes("404") || msg.includes("No endpoints found") || msg.includes("503");
      if (!retryable) throw lastError;
    }
  }

  throw lastError ?? new OpenRouterError("OpenRouter isteği başarısız.");
}

const FEN_REGEX =
  /([rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8\/]+\s+[wb]\s+[KQkq\-]+\s+[a-h0-9\-]+\s+\d+\s+\d+)/;

function extractFenFromText(text: string): string {
  const trimmed = text.trim();
  const labeled = trimmed.match(/FEN:\s*([^\n]+)/i);
  if (labeled) return labeled[1].trim();
  const direct = trimmed.match(FEN_REGEX);
  return direct ? direct[1].trim() : "";
}

function extractSolutionFromText(text: string): string | undefined {
  const moveMatch = text.match(/HAMLELER:\s*([^\n]+)/i);
  if (moveMatch && moveMatch[1].trim()) {
    return moveMatch[1].trim().replace(/\s+/g, ", ");
  }
  return undefined;
}

function parseBoardsFromJson(raw: string): ImageBoardResult[] {
  const jsonMatch = raw.match(/\{[\s\S]*"boards"[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { boards?: Array<{ fen?: string; solution?: string }> };
    if (!Array.isArray(parsed.boards)) return [];
    return parsed.boards
      .map((b) => ({
        fen: (b.fen ?? "").trim(),
        solution: b.solution?.trim() || undefined,
      }))
      .filter((b) => b.fen && FEN_REGEX.test(b.fen));
  } catch {
    return [];
  }
}

function parseBoardsFromBlocks(raw: string): ImageBoardResult[] {
  const boards: ImageBoardResult[] = [];
  const blockRegex = /---TAHTA\s*\d+---\s*([\s\S]*?)(?=---TAHTA\s*\d+---|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(raw)) !== null) {
    const block = m[1].trim();
    const fen = extractFenFromText(block);
    if (fen) boards.push({ fen, solution: extractSolutionFromText(block) });
  }
  return boards;
}

function parseAllFensFromRaw(raw: string): ImageBoardResult[] {
  const fromJson = parseBoardsFromJson(raw);
  if (fromJson.length > 0) return fromJson;

  const fromBlocks = parseBoardsFromBlocks(raw);
  if (fromBlocks.length > 0) return fromBlocks;

  const allFenMatches = [...raw.matchAll(new RegExp(FEN_REGEX, "g"))];
  if (allFenMatches.length > 0) {
    return allFenMatches.map((match) => ({ fen: match[1].trim() }));
  }

  const single = extractFenFromText(raw);
  return single && FEN_REGEX.test(single) ? [{ fen: single, solution: extractSolutionFromText(raw) }] : [];
}

const MULTI_BOARD_PROMPT = `Bu görselde veya PDF sayfasında BİR veya BİRDEN FAZLA satranç tahtası olabilir (ör. 2x2 ızgara, yan yana diyagramlar).

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

/**
 * Satranç tahtası görselinden FEN kodu çıkarır (OpenRouter vision).
 */
export const imageToFen = async (
  imageDataUrl: string
): Promise<{ fen: string; solution?: string } | null> => {
  try {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    const text = await chat(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Bu görselde bir satranç tahtası pozisyonu var. Sadece FEN döndür.

Yanıt formatı (tercihen JSON):
{"boards":[{"fen":"<FEN>","solution":""}]}

veya:
FEN: <tek satır FEN>
HAMLELER: <virgülle ayrılmış UCI veya boş>`,
            },
            {
              type: "image_url",
              image_url: { url: imageDataUrl },
            },
          ],
        },
      ],
      { vision: true },
    );

    const boards = parseAllFensFromRaw((text || "").trim());
    return boards[0] ?? null;
  } catch (error) {
    console.error("imageToFen error:", error);
    throw error;
  }
};

/** Görseldeki her satranç tahtası için FEN (+ isteğe bağlı çözüm). */
export type ImageBoardResult = { fen: string; solution?: string };

export const imageToFenMultiple = async (
  imageDataUrl: string
): Promise<ImageBoardResult[]> => {
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return [];

  const text = await chat(
    [
      {
        role: "user",
        content: [
          { type: "text", text: MULTI_BOARD_PROMPT },
          {
            type: "image_url",
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    { vision: true },
  );

  const boards = parseAllFensFromRaw((text || "").trim());
  if (boards.length > 0) return boards;

  const single = await imageToFen(imageDataUrl);
  return single ? [single] : [];
};

export const getChessAnalysis = async (fen: string, move: string) => {
  try {
    const text = await chat([
      {
        role: "user",
        content: `Analyze this chess position (FEN): ${fen}. The player played: ${move}. Is this a good move? Provide a short tactical summary for a student.`,
      },
    ]);
    return text || "Analiz şu an kullanılamıyor.";
  } catch (error) {
    console.error("Analysis Error:", error);
    return "Analiz şu an kullanılamıyor.";
  }
};

export const generatePuzzleFromFEN = async (fen: string) => {
  try {
    const text = await chat([
      {
        role: "user",
        content: `Create a chess puzzle from this FEN position: ${fen}. Return ONLY a valid JSON object (no markdown, no code block) with these exact keys: "title" (string), "difficulty" (string), "points" (number), "solution" (array of move strings).`,
      },
    ]);
    const cleaned = (text || "").replace(/^```\w*\n?|\n?```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Puzzle Generation Error:", error);
    return null;
  }
};

/** Öğrenci satranç ödev denemelerine göre AI analizi */
export interface StudentHomeworkAttemptForAI {
  puzzleTitle: string;
  correct: boolean;
  movesPlayed: string[];
  solutionMoves: string[];
}

function parseAiInsightSections(raw: string): { eksiklikler: string; hamleler: string } {
  const trimmed = raw.trim();
  const eksikliklerMatch = trimmed.match(/EKSİKLİKLER?[:\s]*([\s\S]*?)(?=HAMLELER|ÖNERİLER|AÇILIŞ|$)/i);
  const hamlelerMatch = trimmed.match(/(?:HAMLELER?|ÖNERİLER)[:\s]*([\s\S]*?)(?=EKSİKLİKLER|$)/i);
  const eksiklikler = eksikliklerMatch ? eksikliklerMatch[1].trim() : trimmed.slice(0, 1500);
  const hamleler = hamlelerMatch ? hamlelerMatch[1].trim() : "";
  return { eksiklikler, hamleler: hamleler || "Hamle ve çalışma özeti oluşturulamadı." };
}

export const analyzeStudentHomework = async (
  studentName: string,
  homeworkTitle: string,
  attempts: StudentHomeworkAttemptForAI[]
): Promise<{ eksiklikler: string; hamleler: string }> => {
  const summary = attempts
    .map(
      (a, i) =>
        `${i + 1}. "${a.puzzleTitle}": ${a.correct ? "Doğru" : "Yanlış"}. Oynanan: ${a.movesPlayed.join(", ") || "-"}. Doğru çözüm: ${a.solutionMoves.join(", ")}`
    )
    .join("\n");

  const text = await chat([
    {
      role: "user",
      content: `Aşağıda bir öğrencinin satranç bulmaca ödevindeki denemeleri var. Öğrenci adı: ${studentName}. Ödev: ${homeworkTitle}.

DENEMELER:
${summary || "(Henüz ödev denemesi yok)"}

Lütfen iki bölüm halinde Türkçe yanıt ver (antrenöre gösterilecek):

1) EKSİKLİKLER: Öğrencinin zayıf olduğu noktaları, sık yaptığı hataları ve geliştirilmesi gereken becerileri kısaca listeleyin (madde işaretli, 3-6 madde).

2) HAMLELER: Hangi bulmacada hangi hamleleri oynadığı ve doğru çözümle karşılaştırması (kısa özet).`,
    },
  ]);

  return parseAiInsightSections(text || "");
};

export interface StudentComprehensiveContext {
  skillLines: string;
  homeworkLine: string;
  platformLine: string;
  recentOpeningsLine: string;
  detailedStatsLine?: string;
  activityLine?: string;
}

/** Lichess + Chess.com + ödev + beceri verisiyle kapsamlı AI raporu */
export const analyzeStudentComprehensive = async (
  studentName: string,
  attempts: StudentHomeworkAttemptForAI[],
  context: StudentComprehensiveContext
): Promise<{ eksiklikler: string; hamleler: string }> => {
  const attemptsSummary = attempts
    .map(
      (a, i) =>
        `${i + 1}. "${a.puzzleTitle}": ${a.correct ? "Doğru" : "Yanlış"}. Oynanan: ${a.movesPlayed.join(", ") || "-"}. Çözüm: ${a.solutionMoves.join(", ") || "-"}`
    )
    .join("\n");

  const text = await chat([
    {
      role: "user",
      content: `Sen bir satranç antrenörüsün. Öğrenci: ${studentName}.

BECERİ DAĞILIMI (%):
${context.skillLines}

ÖDEV ÖZETİ:
${context.homeworkLine}

ONLİNE PLATFORM (Lichess + Chess.com):
${context.platformLine}

PLATFORM BECERİ SKORLARI:
${context.detailedStatsLine || context.skillLines}

TEMPO / AKTİVİTE DAĞILIMI:
${context.activityLine || '(Tempo verisi yok)'}

SON AÇILIŞLAR:
${context.recentOpeningsLine}

ÖDEV DENEMELERİ (son kayıtlar):
${attemptsSummary || "(Kayıtlı ödev denemesi yok — platform verisine ağırlık ver)"}

Türkçe, antrenöre yönelik iki bölüm yaz. Her maddeyi "1." "2." şeklinde numaralandır; madde başlığını kalın yazma, sadece "Başlık: açıklama" formatı kullan.

1) EKSİKLİKLER: Açılış, taktik, oyun sonu ve platform performansına göre 4-7 madde; hangi açılışlarda/temposlarda sorun var.

2) HAMLELER: Somut çalışma planı — haftalık 3-5 adımlık öneri. Ödev denemesi yoksa platform verisinden çıkarım yap.`,
    },
  ]);

  return parseAiInsightSections(text || "");
};

export function isOpenRouterConfigured(): boolean {
  return !!getApiKey();
}

export function formatOpenRouterError(error: unknown): string {
  if (error instanceof OpenRouterError) {
    if (error.message.includes("402") || /insufficient|credit/i.test(error.message)) {
      return "OpenRouter AI kredisi yetersiz. Görselden FEN için hesabınıza kredi yükleyin veya FEN'i elle girin.";
    }
    if (error.message.includes("404") || error.message.includes("No endpoints found")) {
      return "Vision modeli bulunamadı. .env içinde VITE_OPENROUTER_MODEL=google/gemini-2.5-flash deneyin.";
    }
    if (error.message.includes("API anahtarı")) {
      return error.message;
    }
    return `OpenRouter hatası: ${error.message.slice(0, 200)}`;
  }
  if (error instanceof Error) return error.message;
  return "Görselden FEN çıkarılamadı.";
}
