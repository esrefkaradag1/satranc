/**
 * Tüm AI çağrıları OpenRouter API üzerinden yapılır.
 * Çağrılar sunucudaki /api/ai'ye gider; anahtar sunucuda: OPENROUTER_API_KEY
 */
export {
  imageToFen,
  imageToFenMultiple,
  getChessAnalysis,
  generatePuzzleFromFEN,
  analyzeStudentHomework,
  analyzeStudentComprehensive,
  isOpenRouterConfigured,
  formatOpenRouterError,
  type StudentHomeworkAttemptForAI,
  type StudentComprehensiveContext,
  type ImageBoardResult,
} from "./openRouterService";
