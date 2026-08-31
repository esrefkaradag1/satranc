// lib/externalGameLink.ts
var LICHESS_GAME_ID = /^[a-zA-Z0-9]{8}$/;
var CHESSCOM_GAME_ID = /^\d{5,14}$/;
function normalizeInput(raw) {
  return String(raw ?? "").trim();
}
function normalizeExternalGamePasteInput(input) {
  const trimmed = normalizeInput(input);
  if (!trimmed) return "";
  const iframeSrc = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  if (iframeSrc) return iframeSrc.trim();
  const emboardUrl = trimmed.match(
    /https?:\/\/(?:www\.)?chess\.com\/emboard\?[^\s"'<>]+/i
  )?.[0];
  if (emboardUrl) return emboardUrl;
  const emboardId = trimmed.match(/emboard\?[^"'\s>]*\bid=(\d{5,14})/i)?.[1];
  if (emboardId) return `https://www.chess.com/emboard?id=${emboardId}`;
  return trimmed;
}
function chessComParsed(format, gameId, url) {
  return {
    platform: "chesscom",
    gameId,
    url: url ?? `https://www.chess.com/game/${format}/${gameId}`,
    chessComFormat: format
  };
}
function parseChessComPath(parts, url) {
  const gameIdx = parts.indexOf("game");
  if (gameIdx >= 0) {
    const kind = parts[gameIdx + 1];
    const id = parts[gameIdx + 2] ?? "";
    if ((kind === "live" || kind === "daily" || kind === "computer") && CHESSCOM_GAME_ID.test(id)) {
      return chessComParsed(kind, id, url.href);
    }
  }
  const analysisIdx = parts.indexOf("analysis");
  if (analysisIdx >= 0 && parts[analysisIdx + 1] === "game") {
    const kind = parts[analysisIdx + 2];
    const id = parts[analysisIdx + 3] ?? "";
    if ((kind === "live" || kind === "daily" || kind === "computer") && CHESSCOM_GAME_ID.test(id)) {
      return chessComParsed(kind, id, url.href);
    }
  }
  const liveIdx = parts.indexOf("live");
  if (liveIdx >= 0 && CHESSCOM_GAME_ID.test(parts[liveIdx + 1] ?? "")) {
    const id = parts[liveIdx + 1];
    return chessComParsed("live", id, `https://www.chess.com/game/live/${id}`);
  }
  return null;
}
function parseExternalGameLink(input) {
  const text = normalizeInput(input);
  if (!text) return null;
  if (LICHESS_GAME_ID.test(text)) {
    return {
      platform: "lichess",
      gameId: text,
      url: `https://lichess.org/${text}`
    };
  }
  if (CHESSCOM_GAME_ID.test(text)) {
    return chessComParsed("live", text);
  }
  let url;
  try {
    url = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "lichess.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (LICHESS_GAME_ID.test(last)) {
      return { platform: "lichess", gameId: last, url: `https://lichess.org/${last}` };
    }
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && LICHESS_GAME_ID.test(parts[embedIdx + 1] ?? "")) {
      const id = parts[embedIdx + 1];
      return { platform: "lichess", gameId: id, url: `https://lichess.org/${id}` };
    }
  }
  if (host === "chess.com") {
    if (url.pathname.includes("emboard")) {
      const id = url.searchParams.get("id")?.trim() ?? "";
      if (CHESSCOM_GAME_ID.test(id)) {
        return chessComParsed("computer", id, `https://www.chess.com/game/computer/${id}`);
      }
    }
    const parts = url.pathname.split("/").filter(Boolean);
    return parseChessComPath(parts, url);
  }
  return null;
}
function isChessComPuzzleUrl(input) {
  const text = normalizeInput(input).toLowerCase();
  return text.includes("/puzzles/") || text.includes("/puzzle/");
}

// lib/lichessOAuthServer.ts
import { createClient } from "@supabase/supabase-js";

// lib/homeworkDayUtils.ts
function istanbulDayKey(ref = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ref);
}
function homeworkDayKey(ref = /* @__PURE__ */ new Date()) {
  return istanbulDayKey(ref);
}
function todayDayKey(ref = /* @__PURE__ */ new Date()) {
  return homeworkDayKey(ref);
}
function localDayKeyFromMs(ms) {
  return todayDayKey(new Date(ms));
}
function utcDayKeyFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function timestampMatchesDay(ms, target) {
  const day = target.slice(0, 10);
  return localDayKeyFromMs(ms) === day || utcDayKeyFromMs(ms) === day;
}

// lib/lichessOAuthServer.ts
function getSupabase() {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function getStudentLichessToken(studentId) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("students").select("lichess_access_token").eq("id", studentId).maybeSingle();
  if (error || !data) return null;
  const token = String(data.lichess_access_token ?? "").trim();
  return token || null;
}
function parseNdjson(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((x) => x != null);
}
async function fetchLichessPuzzleActivityForDay(params) {
  const target = params.dayIso.slice(0, 10);
  const since = (/* @__PURE__ */ new Date(`${target}T00:00:00`)).getTime();
  const before = (/* @__PURE__ */ new Date(`${target}T23:59:59.999`)).getTime() + 1;
  const qs = new URLSearchParams();
  qs.set("max", String(Math.min(500, Math.max(20, params.max ?? 120))));
  qs.set("since", String(since));
  qs.set("before", String(before));
  const res = await fetch(`https://lichess.org/api/puzzle/activity?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/x-ndjson"
    },
    signal: AbortSignal.timeout(2e4)
  });
  if (!res.ok) {
    throw new Error(`Lichess bulmaca ge\xE7mi\u015Fi al\u0131namad\u0131 (${res.status})`);
  }
  const text = await res.text();
  const rows = parseNdjson(text);
  const out = [];
  for (const row of rows) {
    const date = Number(row.date);
    if (!Number.isFinite(date) || !timestampMatchesDay(date, target)) continue;
    const puzzle = row.puzzle;
    const puzzleId = String(puzzle?.id ?? puzzle?.name ?? "").trim();
    if (!puzzleId) continue;
    out.push({
      id: `${puzzleId}-${date}`,
      puzzleId,
      date,
      win: row.win === true,
      rating: typeof puzzle?.rating === "number" ? puzzle.rating : void 0,
      fen: typeof puzzle?.fen === "string" ? puzzle.fen : void 0,
      themes: typeof puzzle?.themes === "string" ? puzzle.themes : void 0
    });
  }
  out.sort((a, b) => a.date - b.date);
  return out;
}
async function fetchLichessPuzzleNext(params) {
  const qs = new URLSearchParams();
  if (params.difficulty?.trim()) qs.set("difficulty", params.difficulty.trim());
  if (params.angle?.trim()) qs.set("angle", params.angle.trim());
  if (params.color?.trim()) qs.set("color", params.color.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`https://lichess.org/api/puzzle/next${suffix}`, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(2e4)
  });
  if (!res.ok) {
    throw new Error(`Lichess s\u0131radaki bulmaca al\u0131namad\u0131 (${res.status})`);
  }
  const data = await res.json();
  if (!data?.puzzle || typeof data.puzzle !== "object") return null;
  return data;
}
async function fetchLichessLatestPuzzleActivity(params) {
  const lookback = Math.min(14, Math.max(1, Math.floor(params.lookbackDays ?? 7)));
  const all = [];
  for (let i = 0; i < lookback; i += 1) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() - i);
    const dayIso = d.toISOString().slice(0, 10);
    const rows = await fetchLichessPuzzleActivityForDay({ token: params.token, dayIso, max: 80 });
    all.push(...rows);
    if (all.length >= 80) break;
  }
  if (!all.length) return null;
  all.sort((a, b) => a.date - b.date);
  return all[all.length - 1] ?? null;
}

// lib/chesscomPuzzleParse.ts
import { Chess } from "chess.js";
function chessComTimestampToIso(dateRaw) {
  if (typeof dateRaw === "number" && Number.isFinite(dateRaw)) {
    const ms2 = dateRaw > 1e12 ? dateRaw : dateRaw * 1e3;
    return new Date(ms2).toISOString();
  }
  const s = String(dateRaw ?? "").trim();
  if (!s) return (/* @__PURE__ */ new Date()).toISOString();
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return (/* @__PURE__ */ new Date()).toISOString();
  return new Date(ms).toISOString();
}
function sanitizeChessComPuzzlePgn(raw) {
  return raw.replace(/\{\[%clk[^\]]*\]\}/gi, "").replace(/\{\[%eval[^\]]*\]\}/gi, "").replace(/\{\[%emt[^\]]*\]\}/gi, "").trim();
}
function puzzleSetupFenFromPgn(pgn) {
  const m = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return m?.[1]?.trim() ?? null;
}
function parseChessComSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) return Math.max(0, asNum);
    const m = trimmed.match(/^(\d+):(\d{2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return 0;
}
function normalizeChessComPuzzleAttempt(raw) {
  const id = Number(raw.id ?? raw.puzzleId ?? raw.puzzle_id ?? 0);
  if (!id) return null;
  const moveCount = Number(raw.move_count ?? raw.moveCount ?? raw.moves ?? raw.total_moves ?? 0);
  const correctMoveCount = Number(
    raw.correct_move_count ?? raw.correctMoveCount ?? raw.correct_moves ?? raw.movesCorrect ?? moveCount
  );
  const movesTotal = moveCount > 0 ? moveCount : Math.max(correctMoveCount, 1);
  const movesCorrect = Math.min(correctMoveCount, movesTotal);
  const ratingChange = Number(raw.rating_change ?? raw.ratingChange ?? raw.ratingDiff ?? 0);
  const myRatingAfter = Number(raw.my_rating ?? raw.myRating ?? raw.ratingAfter ?? raw.rating_after ?? 0);
  const puzzleRating = Number(raw.rating ?? raw.puzzle_rating ?? raw.puzzleRating ?? 0);
  const passedExplicit = raw.is_passed ?? raw.isPassed ?? raw.passed;
  const passed = passedExplicit != null ? Boolean(passedExplicit) : Boolean(raw.result === 1 || raw.result === "win" || ratingChange > 0);
  const dateRaw = raw.date ?? raw.createDate ?? raw.create_date ?? raw.last_date ?? "";
  const date = chessComTimestampToIso(dateRaw);
  return {
    id,
    date,
    puzzleRating,
    movesCorrect,
    movesTotal,
    avgTimeSec: parseChessComSeconds(
      raw.average_time ?? raw.averageTime ?? raw.target_time ?? raw.targetTime ?? raw.avg_time
    ),
    myTimeSec: parseChessComSeconds(raw.my_time ?? raw.myTime ?? raw.time ?? raw.time_spent),
    passed,
    ratingChange,
    myRatingAfter: myRatingAfter || puzzleRating,
    fen: typeof raw.fen === "string" ? raw.fen : void 0,
    flipBoard: Boolean(raw.flipBoard ?? raw.flip_board)
  };
}
var TACTICS2_PUZZLE_LIST_KEYS = {
  rated: "recentRatedProblems",
  learning: "recentLearningProblems",
  rush: "recentTacticsChallenges"
};
function parseChessComTactics2Puzzles(data, type) {
  if (!data || typeof data !== "object") return [];
  const root = data;
  const key = TACTICS2_PUZZLE_LIST_KEYS[type];
  const list = root[key];
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const parsed = normalizeChessComPuzzleAttempt(item);
    if (!parsed) continue;
    out.push(parsed);
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// lib/leaderboardPointSettings.ts
var DEFAULT_MODE_POINTS = { win: 10, draw: 5, loss: 1 };
var DEFAULT_LEADERBOARD_POINT_SETTINGS = {
  puzzle: 1,
  puzzleCorrect: 1,
  puzzleWrong: 0,
  bullet: { ...DEFAULT_MODE_POINTS },
  blitz: { ...DEFAULT_MODE_POINTS },
  rapid: { ...DEFAULT_MODE_POINTS },
  classical: { ...DEFAULT_MODE_POINTS },
  other: { ...DEFAULT_MODE_POINTS }
};

// lib/chesscomDailyTacticsTracker.ts
var MAX_PLAUSIBLE_DAILY_SECONDS = 6 * 3600;

// lib/chesscomPuzzleDailyChart.ts
import { fetchChessComUpstream } from "../../lib/chesscomUpstreamFetch.mjs";

// services/chessPlatformService.ts
var FETCH_TIMEOUT_MS = 8e3;
async function fetchWithTimeout(url, init, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}
var CHESSCOM_MONTH_GAMES_CACHE_TTL_MS = 10 * 60 * 1e3;
var LICHESS_ACTIVITY_CACHE_TTL_MS = 15 * 60 * 1e3;
var LICHESS_ACTIVITY_RATE_LIMIT_MS = 10 * 60 * 1e3;
var LICHESS_USER_CACHE_TTL_MS = 45 * 60 * 1e3;
var LICHESS_MAX_BACKOFF_MS = 5 * 6e4;
var lichessRequestChain = Promise.resolve();
async function fetchLichessGamePgn(gameId) {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const load = async (url) => {
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/x-chess-pgn" } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  };
  try {
    const direct = `https://lichess.org/game/export/${encodeURIComponent(id)}`;
    return await load(direct) ?? await load(`/api/lichess-proxy?path=${encodeURIComponent(`game/export/${id}`)}`);
  } catch {
    return null;
  }
}
var CHESSCOM_BUNDLE_CACHE_TTL_MS = 5 * 60 * 1e3;

// lib/externalGameSnapshot.ts
import { Chess as Chess4 } from "chess.js";

// lib/studyUtils.ts
import { Chess as Chess3 } from "chess.js";

// lib/studyPgnTags.ts
var PGN_TAG_TYPES = [
  "White",
  "WhiteElo",
  "WhiteTitle",
  "WhiteTeam",
  "WhiteFideId",
  "Black",
  "BlackElo",
  "BlackTitle",
  "BlackTeam",
  "BlackFideId",
  "TimeControl",
  "Date",
  "Result",
  "Termination",
  "Site",
  "Event",
  "Round",
  "Board",
  "Annotator",
  "GameId"
];
var TYPE_ORDER = new Map(PGN_TAG_TYPES.map((t, i) => [t.toLowerCase(), i]));

// lib/puzzlePlayUtils.ts
import { Chess as Chess2 } from "chess.js";
var DEFAULT_FEN2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function applyPuzzleMove(game, moveStr) {
  if (!moveStr || typeof moveStr !== "string") return null;
  const s = moveStr.trim().replace(/\s+/g, "");
  try {
    if (s.length >= 4 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s.toLowerCase())) {
      const from = s.slice(0, 2).toLowerCase();
      const to = s.slice(2, 4).toLowerCase();
      const promotion = s[4] ? s[4].toLowerCase() : void 0;
      return game.move({ from, to, ...promotion && { promotion } });
    }
    const sanCandidates = [s];
    if (/[+#]$/.test(s)) sanCandidates.push(s.replace(/[+#]+$/, ""));
    for (const cand of sanCandidates) {
      try {
        return game.move(cand);
      } catch {
        try {
          return game.move(cand, { sloppy: true });
        } catch {
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
function looksLikeUciMove(s) {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(s.trim());
}
function looksLikeCastlingUci(moveStr) {
  const s = moveStr.trim().toLowerCase();
  return looksLikeUciMove(s) && (s.endsWith("g1") || s.endsWith("g8") || s.endsWith("c1") || s.endsWith("c8"));
}
function isMoveLegalForSideToMove(fen, moveStr) {
  try {
    const probe = resolveExpectedMoveSquares(fen, moveStr);
    if (!probe) return false;
    const g = new Chess2(fen);
    const piece = g.get(probe.from);
    if (!piece || piece.color !== g.turn()) return false;
    if (looksLikeCastlingUci(moveStr) && piece.type !== "k") return false;
    return applyPuzzleMove(new Chess2(fen), moveStr) != null;
  } catch {
    return false;
  }
}
function lichessImportToPlayState(rawFen, uciMoves) {
  const fen = rawFen.trim() || DEFAULT_FEN2;
  const moves = uciMoves.map((m) => String(m).trim()).filter(Boolean);
  if (moves.length === 0) {
    return { playFen: fen, solutionMoves: [] };
  }
  if (moves.length === 1) {
    return { playFen: fen, solutionMoves: moves };
  }
  const setupGame = new Chess2(fen);
  const setup = applyPuzzleMove(setupGame, moves[0]);
  if (setup && !setupGame.isGameOver()) {
    const rest = moves.slice(1);
    if (rest.length > 0) {
      const replayOk = canReplayMovesFrom(setupGame.fen(), rest);
      if (replayOk || setup.color === new Chess2(fen).turn()) {
        return {
          playFen: setupGame.fen(),
          solutionMoves: rest,
          setupMoveSan: setup.san,
          lichessSetupMove: moves[0]
        };
      }
    }
  }
  if (isMoveLegalForSideToMove(fen, moves[0]) && canReplayMovesFrom(fen, moves)) {
    return { playFen: fen, solutionMoves: moves };
  }
  return { playFen: fen, solutionMoves: moves };
}
function canReplayMovesFrom(fen, moves, startIndex = 0) {
  try {
    const g = new Chess2(fen);
    for (let i = startIndex; i < moves.length; i++) {
      if (!applyPuzzleMove(g, moves[i])) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function resolveExpectedMoveSquares(currentFen, moveStr) {
  try {
    const g = new Chess2(currentFen);
    const move = applyPuzzleMove(g, moveStr);
    return move ? { from: move.from, to: move.to, san: move.san } : null;
  } catch {
    return null;
  }
}

// lib/studyUtils.ts
var DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var PGN_SAN_TOKEN = /\b(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|[a-h]x[a-h](?:=[NBRQ])?[+#]?)\b/g;
function parsePgnBlockToMoves(block) {
  const trimmed = block.trim();
  if (!trimmed) return { startFen: DEFAULT_FEN, moves: [] };
  const fenMatch = trimmed.match(/\[FEN\s+"([^"]+)"\s*\]/i);
  const startFen = fenMatch ? fenMatch[1].trim() : DEFAULT_FEN;
  try {
    const g = new Chess3();
    g.loadPgn(trimmed);
    const moves = g.history();
    if (moves.length > 0) {
      return { startFen: fenMatch ? startFen : DEFAULT_FEN, moves };
    }
  } catch {
  }
  try {
    const g2 = new Chess3(startFen);
    const movetext = trimmed.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\([^)]*\)/g, " ").replace(/\d+\.(?:\.\.)?/g, " ").trim();
    const sans = movetext.match(PGN_SAN_TOKEN) ?? [];
    for (const san of sans) {
      const m = g2.move(san);
      if (!m) break;
    }
    return { startFen, moves: g2.history() };
  } catch {
    return { startFen, moves: [] };
  }
}

// lib/externalGameSnapshot.ts
var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function fenAtSanMoves(baseFen, moves, ply = null) {
  try {
    const game = new Chess4(baseFen);
    const total = moves.length;
    const target = ply ?? total;
    for (let i = 0; i < Math.min(target, total); i++) {
      const m = moves[i];
      if (!m) break;
      try {
        if (!game.move(m)) break;
      } catch {
        break;
      }
    }
    return game.fen();
  } catch {
    return baseFen;
  }
}
function snapshotFromSanList(sanText, meta, opts) {
  const trimmed = sanText.trim();
  if (!trimmed) return null;
  const baseFen = opts?.initialFen?.trim() || START_FEN;
  try {
    const game = new Chess4(baseFen);
    const sans = [];
    for (const raw of trimmed.split(/\s+/)) {
      const token = raw.replace(/^\d+\.+\.?/, "").trim();
      if (!token || token === "1-0" || token === "0-1" || token === "1/2-1/2" || token === "*") continue;
      const played = game.move(token);
      if (!played) break;
      sans.push(played.san);
    }
    if (sans.length === 0) return null;
    const fen = opts?.headFen?.trim() || game.fen();
    return { fen, moves: sans, baseFen, ...meta };
  } catch {
    return null;
  }
}
function snapshotFromPgn(pgn, meta) {
  const trimmed = pgn.trim();
  if (!trimmed) return null;
  const { startFen, moves } = parsePgnBlockToMoves(trimmed);
  const baseFen = startFen || START_FEN;
  const fen = moves.length > 0 ? fenAtSanMoves(baseFen, moves, moves.length) : baseFen;
  return {
    fen,
    moves,
    baseFen,
    ...meta
  };
}
function snapshotFromTcnMoves(tcnMoves, meta) {
  if (tcnMoves.length === 0) return null;
  const baseFen = meta.initialFen?.trim() || START_FEN;
  try {
    const game = new Chess4(baseFen);
    const sans = [];
    for (const m of tcnMoves) {
      if (m.drop) {
        const piece = m.drop === "p" ? "p" : m.drop;
        const played2 = game.move({
          from: m.to,
          to: m.to,
          promotion: m.promotion
        });
        if (!played2) {
          const alt = game.move({
            from: "a1",
            to: m.to,
            promotion: m.promotion ?? piece
          });
          if (!alt) break;
          sans.push(alt.san);
          continue;
        }
        sans.push(played2.san);
        continue;
      }
      if (!m.from) break;
      const played = game.move({
        from: m.from,
        to: m.to,
        promotion: m.promotion
      });
      if (!played) break;
      sans.push(played.san);
    }
    if (sans.length === 0) return null;
    return {
      fen: game.fen(),
      moves: sans,
      baseFen,
      source: meta.source,
      gameId: meta.gameId,
      gameUrl: meta.gameUrl,
      label: meta.label,
      isFinished: meta.isFinished
    };
  } catch {
    return null;
  }
}
function snapshotFromLichessStreamLine(line, meta) {
  const type = String(line.type ?? "");
  const state = line.state && typeof line.state === "object" ? line.state : null;
  const initialFenRaw = typeof line.initialFen === "string" && line.initialFen.trim() ? line.initialFen.trim() : START_FEN;
  const fenRaw = typeof line.fen === "string" && line.fen.trim() || typeof state?.fen === "string" && state.fen.trim() || "";
  const movesUci = typeof line.moves === "string" && line.moves.trim() || typeof state?.moves === "string" && state.moves.trim() || "";
  if (!fenRaw && !movesUci && type !== "gameFull") return null;
  const baseFen = initialFenRaw.includes("/") ? initialFenRaw : START_FEN;
  try {
    const game = new Chess4(baseFen);
    const sans = [];
    if (movesUci) {
      const ucis = movesUci.split(/\s+/).filter(Boolean);
      for (const uci of ucis) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : void 0;
        const played = game.move({
          from,
          to,
          promotion
        });
        if (!played) break;
        sans.push(played.san);
      }
    }
    const fen = fenRaw || (sans.length ? game.fen() : baseFen);
    if (!fen.includes("/")) return null;
    const status = String(state?.status ?? line.status ?? "");
    return {
      fen,
      moves: sans,
      baseFen,
      source: "lichess",
      gameId: meta.gameId,
      gameUrl: meta.gameUrl,
      label: meta.label,
      isFinished: status === "mate" || status === "draw" || status === "stalemate" || status === "resign" || status === "outoftime" || status === "aborted" || status === "timeout"
    };
  } catch {
    return null;
  }
}

// lib/lichessLiveGameServer.ts
var START_FEN2 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function parseNdjson2(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((x) => x != null);
}
function normalizeLichessGameId(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return "";
  if (/^[a-zA-Z0-9]{8}$/.test(id)) return id;
  if (/^[a-zA-Z0-9]{12}$/.test(id)) return id.slice(0, 8);
  const m = id.match(/([a-zA-Z0-9]{8})/);
  return m?.[1] ?? id;
}
async function fetchLichessPlayingGames(token) {
  const res = await fetch("https://lichess.org/api/account/playing", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12e3)
  });
  if (!res.ok) return [];
  const data = await res.json();
  const rows = Array.isArray(data.nowPlaying) ? data.nowPlaying : [];
  return rows.map((row) => {
    const bare = normalizeLichessGameId(String(row.gameId ?? "").trim()) || normalizeLichessGameId(String(row.fullId ?? "").trim());
    if (!bare) return null;
    return {
      gameId: bare,
      fullId: row.fullId,
      color: row.color === "black" ? "black" : row.color === "white" ? "white" : void 0,
      speed: row.speed,
      variant: row.variant?.key,
      fen: typeof row.fen === "string" ? row.fen.trim() : void 0,
      lastMove: typeof row.lastMove === "string" ? row.lastMove.trim() : void 0,
      isMyTurn: row.isMyTurn === true
    };
  }).filter((x) => x != null);
}
function snapshotFromPlayingRow(row) {
  const fen = row.fen?.trim();
  if (!fen || !fen.includes("/")) return null;
  return {
    fen,
    moves: [],
    baseFen: fen,
    source: "lichess",
    gameId: row.gameId,
    gameUrl: `https://lichess.org/${row.gameId}`,
    label: [row.speed, row.variant].filter(Boolean).join(" \xB7 ") || void 0,
    isFinished: false
  };
}
async function fetchLichessSnapshotFromStream(gameId) {
  const id = normalizeLichessGameId(gameId);
  if (!id) return null;
  const res = await fetch(`https://lichess.org/api/stream/game/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/x-ndjson" },
    signal: AbortSignal.timeout(1e4)
  });
  if (!res.ok) return null;
  const text = await res.text();
  const lines = parseNdjson2(text);
  let best = null;
  for (const line of lines) {
    const snap = snapshotFromLichessStreamLine(line, {
      gameId: id,
      gameUrl: `https://lichess.org/${id}`,
      label: typeof line.speed === "string" ? line.speed : void 0
    });
    if (snap) {
      best = snap;
      if (snap.moves.length > 0 || snap.fen !== START_FEN2) break;
    }
    if (line.type === "gameState" && best) break;
  }
  return best;
}
async function fetchLichessGameSnapshot(gameId) {
  const id = normalizeLichessGameId(gameId);
  if (!id) return null;
  const fromStream = await fetchLichessSnapshotFromStream(id);
  if (fromStream && fromStream.moves.length > 0) {
    return fromStream;
  }
  const pgn = await fetchLichessGamePgn(id);
  if (pgn) {
    const fromPgn = snapshotFromPgn(pgn, {
      source: "lichess",
      gameId: id,
      gameUrl: `https://lichess.org/${id}`
    });
    if (fromPgn) return fromPgn;
  }
  return fromStream;
}
async function fetchLichessOAuthLiveSnapshot(studentId) {
  const token = await getStudentLichessToken(studentId);
  if (!token) return { connected: false, error: "Lichess OAuth ba\u011Fl\u0131 de\u011Fil" };
  try {
    const playing = await fetchLichessPlayingGames(token);
    if (playing.length === 0) {
      return { connected: true, playing: [], error: "Devam eden Lichess oyunu yok" };
    }
    const primary = playing[0];
    let snapshot = await fetchLichessGameSnapshot(primary.gameId);
    if (!snapshot) {
      snapshot = snapshotFromPlayingRow(primary);
    }
    if (!snapshot) {
      return { connected: true, playing, error: "Oyun konumu al\u0131namad\u0131" };
    }
    return {
      connected: true,
      playing,
      snapshot: {
        ...snapshot,
        label: [primary.speed, primary.variant].filter(Boolean).join(" \xB7 ") || snapshot.label
      }
    };
  } catch (err) {
    return {
      connected: true,
      error: err instanceof Error ? err.message : "Lichess canl\u0131 oyun al\u0131namad\u0131"
    };
  }
}

// lib/chesscomLiveGameServer.ts
import { fetchChessComUpstream as fetchChessComUpstream2 } from "../../lib/chesscomUpstreamFetch.mjs";

// lib/chesscomTcn.ts
var TCN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=";
function decodeChessComTcn(tcn) {
  const raw = String(tcn ?? "").trim();
  if (!raw) return [];
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    const move = { to: "a1" };
    let fromIdx = TCN_ALPHABET.indexOf(raw[i]);
    let toIdx = TCN_ALPHABET.indexOf(raw[i + 1]);
    if (fromIdx < 0 || toIdx < 0) break;
    if (toIdx > 63) {
      move.promotion = "qnrbkp"[Math.floor((toIdx - 64) / 3)] ?? "q";
      toIdx = fromIdx + (fromIdx < 16 ? -8 : 8) + (toIdx - 1) % 3 - 1;
    }
    if (fromIdx > 75) {
      move.drop = "qnrbkp"[fromIdx - 79] ?? "p";
    } else {
      move.from = `${TCN_ALPHABET[fromIdx % 8]}${Math.floor(fromIdx / 8) + 1}`;
    }
    move.to = `${TCN_ALPHABET[toIdx % 8]}${Math.floor(toIdx / 8) + 1}`;
    out.push(move);
  }
  return out;
}

// lib/chesscomLiveGameServer.ts
var FORMAT_LABELS = {
  live: "Canl\u0131",
  daily: "G\xFCnl\xFCk",
  computer: "Bot"
};
function chessComInitialFen(initialSetup) {
  const raw = String(initialSetup ?? "").trim();
  if (!raw) return void 0;
  if (raw.includes("/")) return raw.split(/\s+/).slice(0, 6).join(" ");
  return void 0;
}
function chessComGameUrl(format, gameId) {
  return `https://www.chess.com/game/${format}/${gameId}`;
}
function snapshotFromChessComCallback(game, format, gameId) {
  if (!game.moveList) return null;
  const tcnMoves = decodeChessComTcn(game.moveList);
  const white = game.pgnheader?.White ?? game.white?.username ?? "Beyaz";
  const black = game.pgnheader?.Black ?? game.black?.username ?? "Siyah";
  const label = [FORMAT_LABELS[format], game.timeClass, `${white} \u2014 ${black}`].filter(Boolean).join(" \xB7 ");
  return snapshotFromTcnMoves(tcnMoves, {
    source: "chesscom",
    gameId,
    gameUrl: chessComGameUrl(format, gameId),
    label,
    isFinished: !!game.isFinished,
    initialFen: chessComInitialFen(game.initialSetup)
  });
}
async function fetchChessComGameSnapshot(gameId, format = "live") {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const upstream = await fetchChessComUpstream2(
    `https://www.chess.com/callback/${format}/game/${encodeURIComponent(id)}`,
    {
      headers: {
        Referer: chessComGameUrl(format, id)
      }
    },
    12e3
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const game = data.game;
  if (!game) return null;
  return snapshotFromChessComCallback(game, format, id);
}
async function fetchChessComGameSnapshotAuto(gameId) {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const formats = ["live", "computer", "daily"];
  for (const format of formats) {
    const snap = await fetchChessComGameSnapshot(id, format);
    if (snap) return snap;
  }
  return null;
}
async function fetchChessComGameSnapshotFromParsed(parsed) {
  if (parsed.platform !== "chesscom") return null;
  if (parsed.chessComFormat) {
    return fetchChessComGameSnapshot(parsed.gameId, parsed.chessComFormat);
  }
  return fetchChessComGameSnapshotAuto(parsed.gameId);
}

// lib/studentChessComPuzzlePull.ts
import { fetchChessComUpstream as fetchChessComUpstream3 } from "../../lib/chesscomUpstreamFetch.mjs";

// lib/studentPlatformPullProfile.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
function getSupabase2() {
  const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient2(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function normalizeUsername(raw) {
  const v = String(raw ?? "").trim();
  return v || void 0;
}
function mergeProfile(row, hints) {
  const hintLichess = normalizeUsername(hints?.lichessUsername)?.toLowerCase();
  const hintChess = normalizeUsername(hints?.chessComUsername)?.toLowerCase();
  if (!row) {
    if (!hintLichess && !hintChess) return null;
    return {
      lichessUsername: hintLichess,
      chessComUsername: hintChess,
      lichessOauthConnected: false
    };
  }
  const lichessUsername = normalizeUsername(row.lichess_username ?? row.lichessUsername)?.toLowerCase() || hintLichess;
  const chessComUsername = normalizeUsername(row.chess_com_username ?? row.chessComUsername)?.toLowerCase() || hintChess;
  if (!lichessUsername && !chessComUsername && !String(row.lichess_access_token ?? "").trim() && !String(row.lichess_oauth_connected_at ?? "").trim() && !hintLichess && !hintChess) {
    return null;
  }
  return {
    lichessUsername,
    chessComUsername,
    lichessOauthConnected: !!String(row.lichess_access_token ?? "").trim() || !!String(row.lichess_oauth_connected_at ?? "").trim()
  };
}
async function getStudentPlatformPullProfile(studentId, hints) {
  const sb = getSupabase2();
  if (!sb) return mergeProfile(null, hints);
  const { data, error } = await sb.from("students").select("lichess_username, chess_com_username, lichess_access_token, lichess_oauth_connected_at").eq("id", studentId).maybeSingle();
  if (error) return mergeProfile(null, hints);
  return mergeProfile(data, hints);
}

// lib/studentChessComPuzzlePull.ts
var START_FEN3 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var CHESSCOM_PUZZLE_RECENT_MS = 20 * 60 * 1e3;
async function fetchChessComTactics2Bundle(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  const upstream = await fetchChessComUpstream3(
    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(trimmed)}`,
    {
      headers: {
        Accept: "application/json",
        Referer: profileUrl
      }
    },
    12e3
  );
  if (!upstream.ok) return null;
  return upstream.json();
}
function pickLatestChessComPuzzleAttempt(data) {
  if (!data || typeof data !== "object") return null;
  const rated = parseChessComTactics2Puzzles(data, "rated");
  const learning = parseChessComTactics2Puzzles(data, "learning");
  const rush = parseChessComTactics2Puzzles(data, "rush");
  const all = [...rated, ...learning, ...rush].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return all[0] ?? null;
}
function isChessComPuzzleRecentlyActive(attempt, bundle) {
  if (!attempt) return false;
  const attemptMs = new Date(attempt.date).getTime();
  if (Number.isFinite(attemptMs) && Date.now() - attemptMs < CHESSCOM_PUZZLE_RECENT_MS) {
    return true;
  }
  if (!bundle || typeof bundle !== "object") return false;
  const statsInfo = bundle.statsInfo;
  if (!statsInfo || typeof statsInfo !== "object") return false;
  if (statsInfo.lastPlayed !== true) return false;
  const stats = statsInfo.stats;
  if (!stats || typeof stats !== "object") return false;
  const lastDate = stats.last_date;
  if (typeof lastDate !== "string" || !lastDate.trim()) return false;
  const lastMs = new Date(lastDate).getTime();
  return Number.isFinite(lastMs) && Date.now() - lastMs < CHESSCOM_PUZZLE_RECENT_MS;
}
async function fetchChessComPuzzlePgn(puzzleId) {
  const upstream = await fetchChessComUpstream3(
    `https://www.chess.com/callback/puzzle/tactics/${encodeURIComponent(String(puzzleId))}`,
    {},
    12e3
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const pgn = data.pgn?.trim();
  return pgn || null;
}
function puzzleAttemptLabel(attempt) {
  const rating = attempt.puzzleRating > 0 ? ` \xB7 ${attempt.puzzleRating}` : "";
  const result = attempt.passed ? "do\u011Fru" : "yanl\u0131\u015F";
  return `Chess.com bulmaca${rating} \xB7 ${result}`;
}
async function chessComPuzzleAttemptToBoardSnapshot(attempt) {
  const puzzleId = Number(attempt.id);
  if (!puzzleId) return null;
  const pgn = await fetchChessComPuzzlePgn(puzzleId);
  let fen = START_FEN3;
  if (pgn) {
    const setup = puzzleSetupFenFromPgn(sanitizeChessComPuzzlePgn(pgn));
    if (setup) fen = setup;
  } else if (attempt.fen?.trim()) {
    fen = attempt.fen.trim();
  }
  return {
    fen,
    moves: [],
    baseFen: fen,
    source: "chesscom",
    gameId: String(puzzleId),
    gameUrl: `https://www.chess.com/puzzles/problem/${encodeURIComponent(String(puzzleId))}`,
    label: puzzleAttemptLabel(attempt),
    boardOrientation: attempt.flipBoard ? "black" : "white",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function fetchChessComPuzzleRecentStatus(username) {
  const bundle = await fetchChessComTactics2Bundle(username);
  if (!bundle) return false;
  const attempt = pickLatestChessComPuzzleAttempt(bundle);
  return isChessComPuzzleRecentlyActive(attempt, bundle);
}

// lib/studentLichessPuzzlePull.ts
function lichessPuzzleApiToBoardSnapshot(data, opts) {
  const puzzle = data.puzzle;
  if (!puzzle || typeof puzzle !== "object") return null;
  const puzzleId = String(
    puzzle.id ?? puzzle.gameId ?? ""
  ).trim();
  if (!puzzleId) return null;
  let fen = typeof puzzle.fen === "string" ? puzzle.fen.trim() : "";
  const sol = Array.isArray(puzzle.solution) ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean) : [];
  if (!fen) return null;
  if (sol.length > 0) {
    fen = lichessImportToPlayState(fen, sol).playFen;
  }
  const rating = typeof puzzle.rating === "number" ? puzzle.rating : void 0;
  const suffix = opts?.inProgress ? " \xB7 \xE7\xF6z\xFCl\xFCyor" : "";
  const label = `Lichess bulmaca${rating ? ` \xB7 ${rating}` : ""}${suffix}`;
  return {
    fen,
    moves: [],
    baseFen: fen,
    source: "lichess",
    gameId: puzzleId,
    gameUrl: `https://lichess.org/training/${encodeURIComponent(puzzleId)}`,
    label,
    activityKind: "puzzle",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function fetchLichessPuzzlePlayFen(puzzleId) {
  const clean = String(puzzleId ?? "").trim();
  if (!clean) return null;
  try {
    const res = await fetch(`https://lichess.org/api/puzzle/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const puzzle = data.puzzle;
    if (!puzzle || typeof puzzle !== "object") return null;
    let fen = typeof puzzle.fen === "string" ? puzzle.fen.trim() : "";
    const sol = Array.isArray(puzzle.solution) ? puzzle.solution.map((m) => String(m).trim()).filter(Boolean) : [];
    if (!fen) return null;
    return lichessImportToPlayState(fen, sol).playFen;
  } catch {
    return null;
  }
}
function puzzleAttemptLabel2(attempt) {
  const rating = attempt.rating != null ? ` \xB7 ${attempt.rating}` : "";
  const result = attempt.win ? "do\u011Fru" : "yanl\u0131\u015F";
  return `Lichess bulmaca${rating} \xB7 ${result}`;
}
async function lichessPuzzleAttemptToBoardSnapshot(attempt) {
  const puzzleId = String(attempt.puzzleId ?? "").trim();
  if (!puzzleId) return null;
  const playFen = await fetchLichessPuzzlePlayFen(puzzleId);
  if (!playFen) return null;
  return {
    fen: playFen,
    moves: [],
    baseFen: playFen,
    source: "lichess",
    gameId: puzzleId,
    gameUrl: `https://lichess.org/training/${encodeURIComponent(puzzleId)}`,
    label: puzzleAttemptLabel2(attempt),
    activityKind: "puzzle",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function fetchStudentLichessCurrentPuzzle(studentId) {
  const token = await getStudentLichessToken(studentId);
  if (!token) {
    return { ok: false, error: "Lichess hesab\u0131 ba\u011Fl\u0131 de\u011Fil" };
  }
  try {
    const data = await fetchLichessPuzzleNext({ token });
    if (!data) {
      return { ok: false, error: "Aktif Lichess bulmacas\u0131 yok" };
    }
    const snapshot = lichessPuzzleApiToBoardSnapshot(data, { inProgress: true });
    if (!snapshot) {
      return { ok: false, error: "Bulmaca konumu al\u0131namad\u0131" };
    }
    return { ok: true, snapshot };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Bulmaca \xE7ekilemedi"
    };
  }
}
async function fetchLichessPuzzleRecentStatus(studentId) {
  const token = await getStudentLichessToken(studentId);
  if (!token) return false;
  try {
    const current = await fetchLichessPuzzleNext({ token });
    if (current?.puzzle) return true;
  } catch {
  }
  try {
    const attempt = await fetchLichessLatestPuzzleActivity({ token, lookbackDays: 1 });
    if (!attempt) return false;
    return Date.now() - attempt.date < CHESSCOM_PUZZLE_RECENT_MS;
  } catch {
    return false;
  }
}
async function fetchStudentLatestLichessPuzzle(studentId) {
  const token = await getStudentLichessToken(studentId);
  if (!token) {
    return { ok: false, error: "Lichess hesab\u0131 ba\u011Fl\u0131 de\u011Fil" };
  }
  try {
    const attempt = await fetchLichessLatestPuzzleActivity({ token, lookbackDays: 7 });
    if (!attempt) {
      return { ok: false, error: "Son Lichess bulmacas\u0131 bulunamad\u0131" };
    }
    const snapshot = await lichessPuzzleAttemptToBoardSnapshot(attempt);
    if (!snapshot) {
      return { ok: false, error: "Bulmaca konumu al\u0131namad\u0131" };
    }
    return { ok: true, snapshot, attempt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Bulmaca \xE7ekilemedi"
    };
  }
}

// lib/studentExternalGamePull.ts
import { lichessProxyRequest } from "../../lib/lichessProxyThrottle.mjs";

// lib/studentChessComActivityPull.ts
async function fetchChessComPlayingGame(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/playing`,
    {
      headers: { Accept: "application/json", "User-Agent": "SatrancEdu/1.0" },
      signal: AbortSignal.timeout(12e3)
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const game = Array.isArray(data.games) ? data.games[0] : void 0;
  if (!game) return null;
  const link = game.url?.trim() || (game.uuid ? `https://www.chess.com/game/live/${game.uuid}` : "");
  const parsed = link ? parseExternalGameLink(link) : null;
  if (parsed?.platform === "chesscom") {
    return fetchChessComGameSnapshotFromParsed(parsed);
  }
  return null;
}
async function fetchChessComToMoveGame(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/to-move`,
    {
      headers: { Accept: "application/json", "User-Agent": "SatrancEdu/1.0" },
      signal: AbortSignal.timeout(12e3)
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const game = Array.isArray(data.games) ? data.games[0] : void 0;
  if (!game) return null;
  const link = game.url?.trim() || (game.uuid ? `https://www.chess.com/game/live/${game.uuid}` : "");
  const parsed = link ? parseExternalGameLink(link) : null;
  if (parsed?.platform === "chesscom") {
    return fetchChessComGameSnapshotFromParsed(parsed);
  }
  return null;
}
async function fetchChessComSnapshotByUrl(gameUrl) {
  const trimmed = String(gameUrl ?? "").trim();
  if (!trimmed || isChessComPuzzleUrl(trimmed)) return null;
  const parsed = parseExternalGameLink(trimmed);
  if (!parsed || parsed.platform !== "chesscom") return null;
  return fetchChessComGameSnapshotFromParsed(parsed);
}
async function fetchStudentChessComCurrentActivity(studentId, opts) {
  const profile = await getStudentPlatformPullProfile(studentId, opts?.hints);
  if (!profile?.chessComUsername) {
    return { ok: false, error: "Chess.com kullan\u0131c\u0131 ad\u0131 tan\u0131ml\u0131 de\u011Fil" };
  }
  const sharedUrl = String(opts?.sharedGameUrl ?? "").trim();
  if (sharedUrl) {
    const fromShare = await fetchChessComSnapshotByUrl(sharedUrl);
    if (fromShare) {
      return { ok: true, snapshot: fromShare, method: "chesscom-shared-link" };
    }
  }
  const playing = await fetchChessComPlayingGame(profile.chessComUsername);
  if (playing && !playing.isFinished) {
    return { ok: true, snapshot: playing, method: "chesscom-to-move" };
  }
  const live = await fetchChessComToMoveGame(profile.chessComUsername);
  if (live && !live.isFinished) {
    return { ok: true, snapshot: live, method: "chesscom-to-move" };
  }
  return {
    ok: false,
    error: "Aktif Chess.com oyunu bulunamad\u0131. Bot veya bulmaca i\xE7in \xF6\u011Frenci oyun linkini payla\u015Fmal\u0131 (Chess.com \u2192 Payla\u015F \u2192 linki kopyala)."
  };
}

// lib/studentExternalGamePull.ts
var START_FEN4 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
function parseNdjson3(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((x) => x != null);
}
function snapshotFromLichessNdjsonGame(game) {
  const id = String(game.id ?? "").trim();
  if (!id) return null;
  const speed = typeof game.speed === "string" ? game.speed : void 0;
  const status = String(game.status ?? "");
  const isFinished = status !== "started" && status !== "created";
  const movesSan = typeof game.moves === "string" ? game.moves.trim() : "";
  const initialFen = typeof game.initialFen === "string" && game.initialFen.trim() || "";
  const lastFen = typeof game.lastFen === "string" && game.lastFen.trim() || typeof game.fen === "string" && game.fen.trim() || "";
  const meta = {
    source: "lichess",
    gameId: id,
    gameUrl: `https://lichess.org/${id}`,
    label: speed,
    isFinished
  };
  if (movesSan) {
    const fromSan = snapshotFromSanList(movesSan, meta, {
      initialFen: initialFen || void 0,
      headFen: lastFen || void 0
    });
    if (fromSan) return fromSan;
    const fromPgn = snapshotFromPgn(movesSan, meta);
    if (fromPgn) {
      return lastFen ? { ...fromPgn, fen: lastFen } : fromPgn;
    }
  }
  if (lastFen) {
    return { fen: lastFen, moves: [], baseFen: initialFen || START_FEN4, ...meta };
  }
  return null;
}
async function fetchLichessOngoingByUsername(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const upstream = await lichessProxyRequest(
    `games/user/${encodeURIComponent(trimmed)}`,
    {
      max: "1",
      ongoing: "true",
      lastFen: "true",
      moves: "true",
      sort: "dateDesc"
    },
    "application/x-ndjson",
    process.env
  );
  if (upstream.status !== 200) return null;
  const games = parseNdjson3(String(upstream.body ?? ""));
  const ongoing = games.find((g) => {
    const status = String(g.status ?? "");
    return status === "started" || status === "created";
  });
  if (!ongoing) return null;
  const id = String(ongoing.id ?? "").trim();
  if (!id) return null;
  const fromStream = await fetchLichessGameSnapshot(id);
  if (fromStream && !fromStream.isFinished) return fromStream;
  const fromNdjson = snapshotFromLichessNdjsonGame(ongoing);
  if (fromNdjson) return fromNdjson;
  return fromStream;
}
async function fetchChessComOngoingByUsername(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const playingRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/playing`,
    {
      headers: { Accept: "application/json", "User-Agent": "SatrancEdu/1.0" },
      signal: AbortSignal.timeout(12e3)
    }
  );
  if (playingRes.ok) {
    const playingData = await playingRes.json();
    const playingGame = Array.isArray(playingData.games) ? playingData.games[0] : void 0;
    if (playingGame) {
      const link2 = playingGame.url?.trim() || (playingGame.uuid ? `https://www.chess.com/game/live/${playingGame.uuid}` : "");
      const parsed2 = link2 ? parseExternalGameLink(link2) : null;
      if (parsed2?.platform === "chesscom") {
        const snap = await fetchChessComGameSnapshotFromParsed(parsed2);
        if (snap && !snap.isFinished) return snap;
      }
    }
  }
  const res = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(trimmed)}/games/to-move`,
    {
      headers: { Accept: "application/json", "User-Agent": "SatrancEdu/1.0" },
      signal: AbortSignal.timeout(12e3)
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const game = Array.isArray(data.games) ? data.games[0] : void 0;
  if (!game) return null;
  const link = game.url?.trim() || (game.uuid ? `https://www.chess.com/game/live/${game.uuid}` : "");
  const parsed = link ? parseExternalGameLink(link) : null;
  if (parsed?.platform === "chesscom") {
    return fetchChessComGameSnapshotFromParsed(parsed);
  }
  return null;
}
async function fetchStudentLivePlatformStatus(studentId, hints) {
  try {
    const profile = await getStudentPlatformPullProfile(studentId, hints);
    if (!profile) {
      return {
        lichessLive: false,
        chesscomLive: false,
        lichessPuzzleRecent: false,
        chesscomPuzzleRecent: false
      };
    }
    let lichessLive = false;
    let lichessPuzzleRecent = false;
    if (profile.lichessOauthConnected) {
      try {
        const oauth = await fetchLichessOAuthLiveSnapshot(studentId);
        lichessLive = !!(oauth.connected && oauth.playing && oauth.playing.length > 0);
      } catch {
        lichessLive = false;
      }
    }
    if (!lichessLive && profile.lichessUsername) {
      try {
        const snap = await fetchLichessOngoingByUsername(profile.lichessUsername);
        lichessLive = !!snap && !snap.isFinished;
      } catch {
        lichessLive = false;
      }
    }
    if (profile.lichessOauthConnected) {
      try {
        lichessPuzzleRecent = await fetchLichessPuzzleRecentStatus(studentId);
      } catch {
        lichessPuzzleRecent = false;
      }
    }
    let chesscomLive = false;
    let chesscomPuzzleRecent = false;
    if (profile.chessComUsername) {
      try {
        const [snap, puzzleRecent] = await Promise.all([
          fetchChessComOngoingByUsername(profile.chessComUsername),
          fetchChessComPuzzleRecentStatus(profile.chessComUsername)
        ]);
        chesscomLive = !!snap && !snap.isFinished;
        chesscomPuzzleRecent = puzzleRecent;
      } catch {
        chesscomLive = false;
        chesscomPuzzleRecent = false;
      }
    }
    return { lichessLive, chesscomLive, lichessPuzzleRecent, chesscomPuzzleRecent };
  } catch {
    return {
      lichessLive: false,
      chesscomLive: false,
      lichessPuzzleRecent: false,
      chesscomPuzzleRecent: false
    };
  }
}
async function fetchStudentExternalGameAuto(studentId, hints) {
  const profile = await getStudentPlatformPullProfile(studentId, hints);
  if (!profile) {
    return { ok: false, error: "\xD6\u011Frenci profili bulunamad\u0131" };
  }
  if (profile.lichessOauthConnected) {
    const oauth = await fetchLichessOAuthLiveSnapshot(studentId);
    if (oauth.snapshot) {
      return { ok: true, snapshot: oauth.snapshot, method: "lichess-oauth" };
    }
  }
  if (profile.lichessUsername) {
    const snap = await fetchLichessOngoingByUsername(profile.lichessUsername);
    if (snap) {
      return { ok: true, snapshot: snap, method: "lichess-username" };
    }
  }
  if (profile.chessComUsername) {
    const snap = await fetchChessComOngoingByUsername(profile.chessComUsername);
    if (snap) {
      return { ok: true, snapshot: snap, method: "chesscom-to-move" };
    }
  }
  if (!profile.lichessUsername && !profile.chessComUsername && !profile.lichessOauthConnected) {
    return {
      ok: false,
      error: "\xD6\u011Frencide Lichess/Chess.com kullan\u0131c\u0131 ad\u0131 veya Lichess OAuth yok"
    };
  }
  return {
    ok: false,
    error: "Devam eden oyun bulunamad\u0131 (Lichess OAuth ba\u011Flant\u0131s\u0131 h\u0131zland\u0131r\u0131r)"
  };
}

// lib/studentActivityPull.ts
import { fetchChessComUpstream as fetchChessComUpstream4 } from "../../lib/chesscomUpstreamFetch.mjs";
function fromExternalGame(snapshot) {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: snapshot.source === "chesscom" ? "chesscom" : "lichess",
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label ?? (snapshot.source === "chesscom" ? "Chess.com" : "Lichess"),
    activityKind: "game",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function fromLichessPuzzle(snapshot) {
  return {
    fen: snapshot.fen,
    moves: snapshot.moves,
    baseFen: snapshot.baseFen,
    source: "lichess",
    gameId: snapshot.gameId,
    gameUrl: snapshot.gameUrl,
    label: snapshot.label,
    activityKind: "puzzle",
    updatedAt: snapshot.updatedAt
  };
}
async function fetchChessComTactics2Bundle2(username) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return null;
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  const upstream = await fetchChessComUpstream4(
    `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(trimmed)}`,
    {
      headers: {
        Accept: "application/json",
        Referer: profileUrl
      }
    },
    12e3
  );
  if (!upstream.ok) return null;
  return upstream.json();
}
async function fetchRecentChessComPuzzle(username) {
  const bundle = await fetchChessComTactics2Bundle2(username);
  if (!bundle) return null;
  const attempt = pickLatestChessComPuzzleAttempt(bundle);
  if (!isChessComPuzzleRecentlyActive(attempt, bundle) || !attempt) return null;
  const snap = await chessComPuzzleAttemptToBoardSnapshot(attempt);
  if (!snap) return null;
  return {
    fen: snap.fen,
    moves: snap.moves,
    baseFen: snap.baseFen,
    source: "chesscom",
    gameId: snap.gameId,
    gameUrl: snap.gameUrl,
    label: snap.label,
    boardOrientation: snap.boardOrientation,
    activityKind: "puzzle",
    updatedAt: snap.updatedAt
  };
}
async function fetchRecentLichessPuzzle(studentId) {
  const result = await fetchStudentLatestLichessPuzzle(studentId);
  if (!result.ok || !result.snapshot || !result.attempt) return null;
  if (Date.now() - result.attempt.date >= CHESSCOM_PUZZLE_RECENT_MS) return null;
  return fromLichessPuzzle(result.snapshot);
}
async function fetchStudentActivityAuto(studentId, hints) {
  const profile = await getStudentPlatformPullProfile(studentId, hints);
  if (!profile) {
    return { ok: false, error: "\xD6\u011Frenci profili bulunamad\u0131" };
  }
  let gameResult = { ok: false };
  try {
    gameResult = await fetchStudentExternalGameAuto(studentId, hints);
    if (gameResult.ok && gameResult.snapshot) {
      return {
        ok: true,
        snapshot: fromExternalGame(gameResult.snapshot),
        method: gameResult.method
      };
    }
  } catch (err) {
    gameResult = {
      ok: false,
      error: err instanceof Error ? err.message : "Oyun \xE7ekilemedi"
    };
  }
  if (profile.lichessOauthConnected) {
    try {
      const current = await fetchStudentLichessCurrentPuzzle(studentId);
      if (current.ok && current.snapshot) {
        return {
          ok: true,
          snapshot: fromLichessPuzzle(current.snapshot),
          method: "lichess-puzzle-current"
        };
      }
    } catch {
    }
  }
  if (profile.chessComUsername) {
    try {
      const ccPuzzle = await fetchRecentChessComPuzzle(profile.chessComUsername);
      if (ccPuzzle) {
        return { ok: true, snapshot: ccPuzzle, method: "chesscom-puzzle-recent" };
      }
    } catch {
    }
  }
  if (profile.lichessOauthConnected) {
    try {
      const lichessPuzzle = await fetchRecentLichessPuzzle(studentId);
      if (lichessPuzzle) {
        return { ok: true, snapshot: lichessPuzzle, method: "lichess-puzzle-recent" };
      }
    } catch {
    }
  }
  if (!profile.lichessUsername && !profile.chessComUsername && !profile.lichessOauthConnected) {
    return {
      ok: false,
      error: "\xD6\u011Frencide Lichess/Chess.com kullan\u0131c\u0131 ad\u0131 veya Lichess OAuth yok"
    };
  }
  return {
    ok: false,
    error: gameResult.error || "Aktif oyun veya bulmaca bulunamad\u0131. Lichess bulmaca i\xE7in OAuth (puzzle:read) gerekir."
  };
}

// lib/api-handlers/external-game-snapshot.ts
function queryParam(q, key) {
  const raw = q[key];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}
function profileHintsFromQuery(q) {
  const lichessUsername = queryParam(q, "lichessUsername");
  const chessComUsername = queryParam(q, "chessComUsername");
  return {
    ...lichessUsername ? { lichessUsername } : {},
    ...chessComUsername ? { chessComUsername } : {}
  };
}
async function snapshotForPlatform(parsed) {
  if (parsed.platform === "lichess") return fetchLichessGameSnapshot(parsed.gameId);
  return fetchChessComGameSnapshotFromParsed(parsed);
}
async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Yaln\u0131zca GET desteklenir" });
    return;
  }
  const mode = queryParam(req.query, "mode") || "link";
  const studentId = queryParam(req.query, "studentId");
  const link = queryParam(req.query, "link");
  const platform = queryParam(req.query, "platform");
  const gameId = queryParam(req.query, "gameId");
  const profileHints = profileHintsFromQuery(req.query);
  try {
    if (mode === "lichess-oauth") {
      if (!studentId) {
        res.status(400).json({ error: "studentId gerekli" });
        return;
      }
      const result = await fetchLichessOAuthLiveSnapshot(studentId);
      res.status(200).json(result);
      return;
    }
    if (mode === "chesscom-live") {
      if (!studentId) {
        res.status(400).json({ error: "studentId gerekli" });
        return;
      }
      const sharedGameUrl = queryParam(req.query, "sharedGameUrl");
      const result = await fetchStudentChessComCurrentActivity(studentId, {
        sharedGameUrl,
        hints: profileHints
      });
      res.status(200).json(result);
      return;
    }
    if (mode === "live-platforms") {
      if (!studentId) {
        res.status(400).json({ error: "studentId gerekli" });
        return;
      }
      try {
        const status = await fetchStudentLivePlatformStatus(studentId, profileHints);
        res.status(200).json(status);
      } catch {
        res.status(200).json({
          lichessLive: false,
          chesscomLive: false,
          lichessPuzzleRecent: false,
          chesscomPuzzleRecent: false
        });
      }
      return;
    }
    if (mode === "auto") {
      if (!studentId) {
        res.status(400).json({ error: "studentId gerekli" });
        return;
      }
      const result = await fetchStudentExternalGameAuto(studentId, profileHints);
      res.status(200).json(result);
      return;
    }
    if (mode === "activity") {
      if (!studentId) {
        res.status(400).json({ error: "studentId gerekli" });
        return;
      }
      const result = await fetchStudentActivityAuto(studentId, profileHints);
      res.status(200).json(result);
      return;
    }
    const normalizedLink = link ? normalizeExternalGamePasteInput(link) : "";
    let parsed = normalizedLink ? parseExternalGameLink(normalizedLink) : null;
    if (!parsed && platform && gameId) {
      parsed = {
        platform: platform === "chesscom" ? "chesscom" : "lichess",
        gameId,
        url: platform === "chesscom" ? `https://www.chess.com/game/live/${gameId}` : `https://lichess.org/${gameId}`
      };
    }
    if (!parsed) {
      res.status(400).json({ error: "Ge\xE7erli Lichess veya Chess.com oyun linki gerekli" });
      return;
    }
    const snapshot = await snapshotForPlatform(parsed);
    if (!snapshot) {
      res.status(404).json({ error: "Oyun konumu al\u0131namad\u0131", parsed });
      return;
    }
    res.status(200).json({
      ok: true,
      parsed,
      snapshot: {
        ...snapshot,
        gameUrl: parsed.url
      }
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "D\u0131\u015F oyun anl\u0131k g\xF6r\xFCnt\xFCs\xFC al\u0131namad\u0131"
    });
  }
}
export {
  handler as default
};
