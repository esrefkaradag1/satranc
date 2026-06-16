/**
 * Tüm AI çağrıları OpenRouter API üzerinden yapılır.
 * API anahtarı: VITE_OPENROUTER_API_KEY
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
