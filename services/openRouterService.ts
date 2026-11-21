/**
 * Yapay zekâ istemcisi — tüm çağrılar sunucudaki POST /api/ai uç noktasına gider (lib/aiProxy.mjs).
 * OpenRouter anahtarı artık tarayıcıda YOK (eskiden VITE_OPENROUTER_API_KEY ile JS'e gömülüyordu).
 * İstemler sunucuda kurulur; istemci yalnızca görev adı ve verisini yollar.
 * Raporlar tarayıcıda önbelleğe alınır: aynı veriyle aynı rapor tekrar üretilmez (maliyet).
 */

export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/** Görseldeki her satranç tahtası için FEN (+ isteğe bağlı çözüm). */
export type ImageBoardResult = { fen: string; solution?: string };

type AiTask = "homework-report" | "comprehensive-report" | "image-to-fen" | "image-to-fen-multiple";

async function callAi(task: AiTask, payload: Record<string, unknown>): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, ...payload }),
    });
  } catch (err) {
    throw new OpenRouterError(err instanceof Error ? err.message : "Yapay zekâ sunucusuna ulaşılamadı.");
  }
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new OpenRouterError(body.error || `Yapay zekâ isteği başarısız (HTTP ${res.status}).`);
  return typeof body.text === "string" ? body.text : "";
}

/**
 * Görseli göndermeden önce en fazla 1600 px'e küçült (JPEG). Tahta tanıma için yeterli;
 * istek gövdesi sunucu/proxy sınırlarının (nginx, Vercel 4.5 MB) altında kalır ve görsel token'ı
 * (dolayısıyla maliyet) düşer. Küçültme mümkün değilse görsel olduğu gibi gönderilir.
 */
const MAX_IMAGE_SIDE = 1600;
async function shrinkImageDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("görsel okunamadı"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    if (scale >= 1 && dataUrl.length < 1_500_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return dataUrl;
  }
}

// ── Rapor önbelleği (tarayıcı) ─────────────────────────────────────────────
const REPORT_CACHE_KEY = "netchess_ai_report_cache_v1";
const REPORT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REPORT_CACHE_MAX = 100;

type ReportCacheEntry = { at: number; value: { eksiklikler: string; hamleler: string } };

function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + input.length;
}

function readReportCache(): Record<string, ReportCacheEntry> {
  try {
    const raw = localStorage.getItem(REPORT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReportCacheEntry>) : {};
  } catch {
    return {};
  }
}

function cachedReport(key: string): ReportCacheEntry["value"] | null {
  const hit = readReportCache()[key];
  return hit && Date.now() - hit.at < REPORT_CACHE_TTL_MS ? hit.value : null;
}

function storeReport(key: string, value: ReportCacheEntry["value"]): void {
  try {
    const all = readReportCache();
    all[key] = { at: Date.now(), value };
    const entries = Object.entries(all)
      .filter(([, e]) => Date.now() - e.at < REPORT_CACHE_TTL_MS)
      .sort((x, y) => y[1].at - x[1].at)
      .slice(0, REPORT_CACHE_MAX);
    localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* depolama yoksa önbelleksiz çalışır */
  }
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


/**
 * Satranç tahtası görselinden FEN kodu çıkarır (sunucu → OpenRouter vision).
 */
export const imageToFen = async (
  imageDataUrl: string
): Promise<{ fen: string; solution?: string } | null> => {
  try {
    if (!/^data:([^;]+);base64,(.+)$/.test(imageDataUrl)) return null;
    const text = await callAi("image-to-fen", { imageDataUrl: await shrinkImageDataUrl(imageDataUrl) });
    const boards = parseAllFensFromRaw((text || "").trim());
    return boards[0] ?? null;
  } catch (error) {
    console.error("imageToFen error:", error);
    throw error;
  }
};

export const imageToFenMultiple = async (
  imageDataUrl: string
): Promise<ImageBoardResult[]> => {
  if (!/^data:([^;]+);base64,(.+)$/.test(imageDataUrl)) return [];
  const text = await callAi("image-to-fen-multiple", { imageDataUrl: await shrinkImageDataUrl(imageDataUrl) });
  const boards = parseAllFensFromRaw((text || "").trim());
  if (boards.length > 0) return boards;

  const single = await imageToFen(imageDataUrl);
  return single ? [single] : [];
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
  const payload = { studentName, homeworkTitle, attempts };
  const key = hashKey("homework|" + JSON.stringify(payload));
  const hit = cachedReport(key);
  if (hit) return hit;
  const text = await callAi("homework-report", payload);
  const result = parseAiInsightSections(text || "");
  if (text.trim()) storeReport(key, result);
  return result;
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
  const payload = { studentName, attempts, context };
  const key = hashKey("comprehensive|" + JSON.stringify(payload));
  const hit = cachedReport(key);
  if (hit) return hit;
  const text = await callAi("comprehensive-report", payload);
  const result = parseAiInsightSections(text || "");
  if (text.trim()) storeReport(key, result);
  return result;
};

/** Hiçbir ekranda kullanılmıyor; geriye dönük dışa aktarım için korunur (sunucuda karşılığı yok). */
export const getChessAnalysis = async (_fen: string, _move: string) => "Analiz şu an kullanılamıyor.";
export const generatePuzzleFromFEN = async (_fen: string) => null;

/** Anahtar sunucuda; istemci bilemez — uygunluğu sunucu yanıtı belirler. */
export function isOpenRouterConfigured(): boolean {
  return true;
}

export function formatOpenRouterError(error: unknown): string {
  if (error instanceof OpenRouterError) {
    if (error.message.includes("402") || /insufficient|credit/i.test(error.message)) {
      return "Yapay zekâ kredisi yetersiz. OpenRouter hesabına kredi yükleyin veya FEN'i elle girin.";
    }
    if (error.message.includes("404") || error.message.includes("No endpoints found")) {
      return "Yapay zekâ modeli bulunamadı. Sunucuda OPENROUTER_MODEL=google/gemini-2.5-flash deneyin.";
    }
    if (/yapılandırılmamış|sınır|Çok fazla|Görsel/i.test(error.message)) {
      return error.message;
    }
    return `Yapay zekâ hatası: ${error.message.slice(0, 200)}`;
  }
  if (error instanceof Error) return error.message;
  return "Görselden FEN çıkarılamadı.";
}
