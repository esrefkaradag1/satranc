// lib/chesscomGamesParse.ts
function parsePgnHeaders(pgn) {
  const out = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(pgn)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}
function splitMonthlyPgnBlocks(pgnText) {
  const trimmed = pgnText.trim();
  if (!trimmed) return [];
  return trimmed.split(/\n\n(?=\[Event)/).filter((block) => block.trim().length > 0);
}
function parseUtcTimestamp(date, time) {
  if (!date) return 0;
  const normalizedDate = date.replace(/\./g, "-");
  const normalizedTime = time?.trim() || "00:00:00";
  const ms = Date.parse(`${normalizedDate}T${normalizedTime}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1e3) : 0;
}
function timeClassFromTimeControl(timeControl) {
  const tc = (timeControl ?? "").trim();
  if (!tc) return "rapid";
  if (tc === "-" || tc === "1/259200") return "daily";
  const base = Number(tc.split("+")[0]);
  if (!Number.isFinite(base) || base <= 0) return "rapid";
  if (base <= 60) return "bullet";
  if (base <= 600) return "blitz";
  return "rapid";
}
function playerResultFromPgnResult(result, color) {
  if (result === "1-0") return color === "white" ? "win" : "lose";
  if (result === "0-1") return color === "black" ? "win" : "lose";
  if (result === "1/2-1/2") return "agreed";
  return "lose";
}
function gameUuidFromLink(link) {
  if (!link) return void 0;
  const m = link.match(/\/game\/(?:live|daily)\/(\d+)/i);
  return m?.[1];
}
function pgnBlockToGame(block) {
  const headers = parsePgnHeaders(block);
  const white = headers.White?.trim();
  const black = headers.Black?.trim();
  if (!white || !black) return null;
  const endTime = parseUtcTimestamp(headers.EndDate, headers.EndTime) || parseUtcTimestamp(headers.UTCDate, headers.UTCTime) || parseUtcTimestamp(headers.Date, headers.StartTime);
  const timeControl = headers.TimeControl?.trim() || void 0;
  const link = headers.Link?.trim() || void 0;
  return {
    url: link,
    uuid: gameUuidFromLink(link),
    pgn: block.trim(),
    time_control: timeControl,
    end_time: endTime || void 0,
    rated: true,
    white: {
      username: white,
      rating: Number(headers.WhiteElo) || void 0,
      result: playerResultFromPgnResult(headers.Result ?? "", "white")
    },
    black: {
      username: black,
      rating: Number(headers.BlackElo) || void 0,
      result: playerResultFromPgnResult(headers.Result ?? "", "black")
    },
    fen: headers.CurrentPosition?.trim() || void 0,
    time_class: timeClassFromTimeControl(timeControl),
    rules: "chess"
  };
}
function parseChessComMonthlyPgn(pgnText) {
  const games = [];
  for (const block of splitMonthlyPgnBlocks(pgnText)) {
    const game = pgnBlockToGame(block);
    if (game) games.push(game);
  }
  return games.sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0));
}

// lib/chesscomMonthGamesFetch.ts
import { fetchChessComUpstream } from "../../lib/chesscomUpstreamFetch.mjs";

// lib/homeworkDayUtils.ts
function istanbulDayKey(ref = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(ref);
}
function shiftIstanbulDayKey(day, deltaDays) {
  const d = /* @__PURE__ */ new Date(`${day.slice(0, 10)}T12:00:00+03:00`);
  d.setDate(d.getDate() + deltaDays);
  return istanbulDayKey(d);
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

// lib/chesscomGameDuration.ts
var MAX_GAME_DURATION_SECONDS = 3 * 3600;
function parseClockSeconds(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parts = value.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isFinite(num))) return null;
  if (nums.length === 2) {
    const [minutes2, seconds2] = nums;
    return Math.round(minutes2 * 60 + seconds2);
  }
  const [hours, minutes, seconds] = nums;
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}
function parseInitialTimeControlSeconds(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "-" || value.includes("/")) return null;
  const [baseRaw, incrementRaw = "0"] = value.split("+");
  const base = Number(baseRaw);
  const increment = Number(incrementRaw);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(increment) || increment < 0) return null;
  return {
    initialSeconds: Math.round(base),
    incrementSeconds: Math.round(increment)
  };
}
function sumClockDurationsFromPgn(rawPgn, timeControl) {
  const pgn = String(rawPgn ?? "");
  if (!pgn.trim()) return 0;
  const emtMatches = [...pgn.matchAll(/\[%emt\s+([0-9:.]+)\]/gi)];
  if (emtMatches.length > 0) {
    return emtMatches.reduce((sum, match) => {
      const sec = parseClockSeconds(match[1]);
      return sum + Math.max(0, sec ?? 0);
    }, 0);
  }
  const clockMatches = [...pgn.matchAll(/\[%clk\s+([0-9:.]+)\]/gi)];
  if (clockMatches.length === 0) return 0;
  const tc = parseInitialTimeControlSeconds(timeControl);
  if (!tc) return 0;
  let prevWhite = tc.initialSeconds;
  let prevBlack = tc.initialSeconds;
  let total = 0;
  clockMatches.forEach((match, index) => {
    const remaining = parseClockSeconds(match[1]);
    if (remaining == null) return;
    if (index % 2 === 0) {
      total += Math.max(0, prevWhite + tc.incrementSeconds - remaining);
      prevWhite = remaining;
    } else {
      total += Math.max(0, prevBlack + tc.incrementSeconds - remaining);
      prevBlack = remaining;
    }
  });
  return total;
}
function chessComGameWallClockSeconds(game) {
  if (!game.end_time || !game.pgn) return 0;
  const startMatch = game.pgn.match(/\[UTCDate\s+"([^"]+)"\][\s\S]*?\[UTCTime\s+"([^"]+)"\]/i);
  if (!startMatch) return 0;
  try {
    const startMs = Date.parse(`${startMatch[1].replace(/\./g, "-")}T${startMatch[2]}Z`);
    const endMs = game.end_time * 1e3;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
    return Math.max(0, Math.round((endMs - startMs) / 1e3));
  } catch {
    return 0;
  }
}
function chessComGameDurationSeconds(game) {
  const headerTimeControl = game.pgn?.match(/\[TimeControl\s+"([^"]+)"\]/i)?.[1];
  const fromClocks = sumClockDurationsFromPgn(game.pgn, headerTimeControl ?? game.time_control);
  const wall = chessComGameWallClockSeconds(game);
  const raw = Math.max(fromClocks, wall);
  return Math.min(MAX_GAME_DURATION_SECONDS, Math.max(0, raw));
}
function lichessGameDurationSeconds(game) {
  const start = game.createdAt;
  const end = game.lastMoveAt ?? start;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / 1e3));
}
function chessComGameInvolvesUser(game, username) {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const w = game.white?.username?.toLowerCase() ?? "";
  const b = game.black?.username?.toLowerCase() ?? "";
  return w === u || b === u;
}
function chessComGameOnDay(game, dayIso) {
  if (!game.end_time) return false;
  const ms = game.end_time * 1e3;
  const target = dayIso.slice(0, 10);
  return istanbulDayKey(new Date(ms)) === target || localDayKeyFromMs(ms) === target;
}
function chessComGamesTimeSecondsForDay(monthGames, username, dayIso) {
  const trimmed = username.trim().toLowerCase();
  return monthGames.filter((g) => chessComGameInvolvesUser(g, trimmed) && chessComGameOnDay(g, dayIso)).reduce((sum, g) => sum + chessComGameDurationSeconds(g), 0);
}

// lib/chesscomMonthGamesFetch.ts
async function fetchMonthlyJson(username, year, month) {
  const mm = month.padStart(2, "0");
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;
  const upstream = await fetchChessComUpstream(url, {}, 15e3);
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, games: [] };
  }
  const data = await upstream.json();
  return { ok: true, status: upstream.status, games: data.games ?? [] };
}
async function fetchMonthlyPgn(username, year, month) {
  const mm = month.padStart(2, "0");
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}/pgn`;
  const upstream = await fetchChessComUpstream(
    url,
    { headers: { Accept: "application/x-chess-pgn, text/plain, */*" } },
    2e4
  );
  if (!upstream.ok) return [];
  const text = await upstream.text();
  return parseChessComMonthlyPgn(text);
}
function gameMergeKey(game) {
  return game.uuid?.trim() || game.url?.trim() || String(game.end_time ?? "");
}
function jsonGamesNeedPgnDuration(games) {
  return games.some((g) => chessComGameDurationSeconds(g) <= 0);
}
function mergeJsonGamesWithPgn(jsonGames, pgnGames) {
  const pgnByKey = /* @__PURE__ */ new Map();
  for (const g of pgnGames) {
    const key = gameMergeKey(g);
    if (key) pgnByKey.set(key, g);
  }
  return jsonGames.map((g) => {
    if (chessComGameDurationSeconds(g) > 0) return g;
    const key = gameMergeKey(g);
    const pgn = key ? pgnByKey.get(key) : void 0;
    if (pgn?.pgn) return { ...g, pgn: pgn.pgn };
    return g;
  });
}
async function fetchChessComMonthGames(username, year, month) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed || !year || !month) {
    return { games: [], unavailable: true, error: "username, year, month gerekli" };
  }
  let jsonStatus = 0;
  let jsonOk = false;
  try {
    const json = await fetchMonthlyJson(trimmed, year, month);
    jsonStatus = json.status;
    jsonOk = json.ok;
    if (json.ok && json.games.length > 0) {
      if (!jsonGamesNeedPgnDuration(json.games)) {
        return { games: json.games, source: "json" };
      }
      try {
        const pgnGames = await fetchMonthlyPgn(trimmed, year, month);
        if (pgnGames.length > 0) {
          return { games: mergeJsonGamesWithPgn(json.games, pgnGames), source: "json" };
        }
      } catch {
      }
      return { games: json.games, source: "json" };
    }
  } catch {
  }
  try {
    const pgnGames = await fetchMonthlyPgn(trimmed, year, month);
    if (pgnGames.length > 0) {
      return { games: pgnGames, source: "pgn", upstreamStatus: jsonOk ? void 0 : jsonStatus || void 0 };
    }
  } catch {
  }
  if (jsonOk) {
    return { games: [], source: "json" };
  }
  return {
    games: [],
    unavailable: true,
    upstreamStatus: jsonStatus || void 0,
    error: "Chess.com oyun ar\u015Fivi al\u0131namad\u0131"
  };
}

// lib/api-handlers/platform-week-stats.ts
import { fetchChessComUpstream as fetchChessComUpstream3 } from "../../lib/chesscomUpstreamFetch.mjs";

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
function parseChessComTacticsLifetimeFromMemberPayload(data) {
  if (!data || typeof data !== "object") return null;
  const raw = data;
  const tactics = raw.stats?.find((s) => s.key === "tactics")?.stats;
  if (!tactics) return null;
  if (tactics.attempt_count === void 0 && tactics.passed_count === void 0) return null;
  const attemptCount = Number(tactics.attempt_count ?? 0);
  const passedCount = Number(tactics.passed_count ?? 0);
  const failedCount = Number(tactics.failed_count ?? 0);
  const totalSeconds = Number(tactics.total_seconds ?? 0);
  if (![attemptCount, passedCount, failedCount, totalSeconds].every((n) => Number.isFinite(n))) return null;
  return {
    attemptCount: Math.max(0, attemptCount),
    passedCount: Math.max(0, passedCount),
    failedCount: Math.max(0, failedCount),
    totalSeconds: Math.max(0, totalSeconds)
  };
}
function parseChessComTacticsLifetimeFromTactics2Bundle(data) {
  if (!data || typeof data !== "object") return null;
  const statsInfo = data.statsInfo;
  if (!statsInfo || typeof statsInfo !== "object") return null;
  const stats = statsInfo.stats;
  if (!stats || typeof stats !== "object") return null;
  const s = stats;
  if (s.attempt_count === void 0 && s.passed_count === void 0) return null;
  const attemptCount = Number(s.attempt_count ?? 0);
  const passedCount = Number(s.passed_count ?? 0);
  const failedCount = Number(s.failed_count ?? 0);
  const totalSeconds = Number(s.total_seconds ?? 0);
  if (![attemptCount, passedCount, failedCount, totalSeconds].every((n) => Number.isFinite(n))) return null;
  return {
    attemptCount: Math.max(0, attemptCount),
    passedCount: Math.max(0, passedCount),
    failedCount: Math.max(0, failedCount),
    totalSeconds: Math.max(0, totalSeconds)
  };
}

// lib/api-handlers/platform-week-stats.ts
import { lichessProxyRequest as lichessProxyRequest2 } from "../../lib/lichessProxyThrottle.mjs";

// lib/chesscomDailyTacticsTracker.ts
var MAX_PLAUSIBLE_DAILY_PUZZLES = 500;
var MAX_PLAUSIBLE_DAILY_SECONDS = 6 * 3600;
function clampCounts(value) {
  return {
    attemptCount: Math.max(0, Math.round(value.attemptCount)),
    passedCount: Math.max(0, Math.round(value.passedCount)),
    failedCount: Math.max(0, Math.round(value.failedCount)),
    totalSeconds: Math.max(0, Math.round(value.totalSeconds ?? 0))
  };
}
function tacticsLifetimeFromMemberStats(stats) {
  if (!stats) return null;
  if (stats.attemptCount === void 0 && stats.passedCount === void 0) {
    return null;
  }
  const attemptCount = Number(stats.attemptCount ?? 0);
  const passedCount = Number(stats.passedCount ?? 0);
  const failedCount = Number(stats.failedCount ?? 0);
  const totalSeconds = Number(stats.totalSeconds ?? 0);
  if (![attemptCount, passedCount, failedCount, totalSeconds].every((n) => Number.isFinite(n))) return null;
  return clampCounts({ attemptCount, passedCount, failedCount, totalSeconds });
}
function preferRicherChessComDayStats(a, b) {
  if (b.count > a.count) return b;
  if (a.count > b.count) return a;
  if (b.passed + b.failed > a.passed + a.failed) return b;
  return a;
}

// lib/chesscomPuzzleDailyChart.ts
import { fetchChessComUpstream as fetchChessComUpstream2 } from "../../lib/chesscomUpstreamFetch.mjs";
async function fetchChessComPuzzleDailyChart(username, opts) {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return {};
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(trimmed)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream2(
      `https://www.chess.com/callback/tactics/stats/${encodeURIComponent(trimmed)}/chart`,
      {
        headers: {
          Accept: "application/json",
          Referer: profileUrl
        }
      },
      opts?.timeoutMs ?? 12e3
    );
    if (!upstream.ok) return {};
    const data = await upstream.json();
    const out = {};
    for (const row of data.dailyStats ?? []) {
      const ts = Number(row.timestamp);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      const passed = Math.max(0, Math.round(Number(row.totalPassed) || 0));
      const failed = Math.max(0, Math.round(Number(row.totalFailed) || 0));
      const count = passed + failed;
      if (count <= 0 && !(Number(row.totalTime) > 0)) continue;
      const day = istanbulDayKey(new Date(ts));
      const next = {
        count,
        passed,
        failed,
        totalTimeSeconds: Math.max(0, Math.round(Number(row.totalTime) || 0)),
        dayCloseRating: row.dayCloseRating == null ? null : Number(row.dayCloseRating),
        timestamp: ts
      };
      const prev = out[day];
      if (!prev || next.count > prev.count) out[day] = next;
    }
    return out;
  } catch {
    return {};
  }
}
function chessComPuzzleStatsFromDailyChart(chartByDay, dayIso) {
  const row = chartByDay[dayIso.slice(0, 10)];
  if (!row) return { count: 0, passed: 0, failed: 0 };
  return { count: row.count, passed: row.passed, failed: row.failed };
}

// services/chessPlatformService.ts
var CHESSCOM_MONTH_GAMES_CACHE_TTL_MS = 10 * 60 * 1e3;
var LICHESS_ACTIVITY_CACHE_TTL_MS = 15 * 60 * 1e3;
var LICHESS_ACTIVITY_RATE_LIMIT_MS = 10 * 60 * 1e3;
var LICHESS_USER_CACHE_TTL_MS = 45 * 60 * 1e3;
var LICHESS_MAX_BACKOFF_MS = 5 * 6e4;
var lichessRequestChain = Promise.resolve();
var CHESSCOM_BUNDLE_CACHE_TTL_MS = 5 * 60 * 1e3;

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

// lib/leaderboardUtils.ts
function parseLichessActivityPuzzles(row) {
  const puzzles = row.puzzles;
  if (!puzzles) return { total: 0, passed: 0, failed: 0 };
  const passed = Math.max(0, puzzles.score?.win ?? 0);
  const failed = Math.max(0, puzzles.score?.loss ?? 0);
  if (passed > 0 || failed > 0) {
    return { total: passed + failed, passed, failed };
  }
  const legacyCount = typeof puzzles.count === "number" ? puzzles.count : 0;
  if (legacyCount <= 0) return { total: 0, passed: 0, failed: 0 };
  return { total: legacyCount, passed: legacyCount, failed: 0 };
}

// lib/platformWeekStatsDerive.ts
function chessComGameInvolvesUser2(game, username) {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  const w = game.white?.username?.toLowerCase() ?? "";
  const b = game.black?.username?.toLowerCase() ?? "";
  return w === u || b === u;
}
function lichessGamesForDayFromActivity(activities, day) {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;
    const games = row.games;
    if (!games) continue;
    let total = 0;
    for (const mode of Object.values(games)) {
      if (!mode || typeof mode !== "object") continue;
      total += (mode.win || 0) + (mode.loss || 0) + (mode.draw || 0);
    }
    return total;
  }
  return 0;
}
function lichessPuzzleStatsForDayFromActivity(activities, day) {
  const target = day.slice(0, 10);
  for (const row of activities) {
    if (!row.interval?.start) continue;
    if (!timestampMatchesDay(row.interval.start, target)) continue;
    const { total, passed, failed } = parseLichessActivityPuzzles(row);
    if (total > 0) return { count: total, passed, failed };
  }
  return { count: 0, passed: 0, failed: 0 };
}
function puzzleAttemptOnDay(isoDate, day) {
  if (!isoDate) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    const target = day.slice(0, 10);
    return timestampMatchesDay(ms, target) || istanbulDayKey(new Date(ms)) === target;
  } catch {
    return false;
  }
}
function chessComPuzzleStatsForDay(rated, day) {
  const target = day.slice(0, 10);
  const ratedToday = rated.filter((a) => puzzleAttemptOnDay(a.date, target));
  const passed = ratedToday.filter((a) => a.passed).length;
  const failed = ratedToday.filter((a) => !a.passed).length;
  return { count: ratedToday.length, passed, failed };
}
function chessComGamesForDay(monthGames, username, day) {
  const trimmed = username.trim().toLowerCase();
  const target = day.slice(0, 10);
  return monthGames.filter(
    (g) => chessComGameInvolvesUser2(g, trimmed) && g.end_time && (istanbulDayKey(new Date(g.end_time * 1e3)) === target || localDayKeyFromMs(g.end_time * 1e3) === target)
  ).length;
}
function buildPlatformDayStats(lichess, chess, activityTimeSeconds) {
  const payload = {
    games: lichess.games + chess.games,
    puzzleSolved: lichess.puzzles.count + chess.puzzles.count,
    puzzlePassed: lichess.puzzles.passed + chess.puzzles.passed,
    puzzleFailed: lichess.puzzles.failed + chess.puzzles.failed,
    lichessGames: lichess.games,
    lichessPuzzles: lichess.puzzles.count,
    lichessPuzzlePassed: lichess.puzzles.passed,
    lichessPuzzleFailed: lichess.puzzles.failed,
    chessComGames: chess.games,
    chessComPuzzles: chess.puzzles.count,
    chessComPuzzlePassed: chess.puzzles.passed,
    chessComPuzzleFailed: chess.puzzles.failed,
    lichessError: lichess.error,
    chessComError: chess.error
  };
  if (activityTimeSeconds != null && activityTimeSeconds > 0) {
    payload.activityTimeSeconds = Math.round(activityTimeSeconds);
  }
  return payload;
}
function uniqueYearMonths(days) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const day of days) {
    const [year, month] = day.slice(0, 10).split("-");
    if (!year || !month) continue;
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ year, month });
  }
  return out;
}

// lib/platformActivityTime.ts
function puzzleAttemptOnDay2(isoDate, day) {
  if (!isoDate?.trim()) return false;
  try {
    const ms = new Date(isoDate).getTime();
    if (!Number.isFinite(ms)) return false;
    const target = day.slice(0, 10);
    return timestampMatchesDay(ms, target) || istanbulDayKey(new Date(ms)) === target;
  } catch {
    return false;
  }
}
function chessComPuzzleTimeSecondsForDay(attempts, dayIso) {
  const target = dayIso.slice(0, 10);
  return attempts.filter((a) => puzzleAttemptOnDay2(a.date, target)).reduce((sum, a) => sum + Math.max(0, a.myTimeSec ?? 0), 0);
}
function chessComPuzzleTimeEstimateForDay(attempts, dayIso, dayAttemptCount) {
  if (dayAttemptCount <= 0) return 0;
  const target = dayIso.slice(0, 10);
  const today = attempts.filter((a) => puzzleAttemptOnDay2(a.date, target));
  const listTime = today.reduce((sum, a) => sum + Math.max(0, a.myTimeSec ?? 0), 0);
  if (today.length === 0) {
    return Math.round(dayAttemptCount * 45);
  }
  const avgSec = today.reduce((sum, a) => {
    if ((a.myTimeSec ?? 0) > 0) return sum + a.myTimeSec;
    if ((a.avgTimeSec ?? 0) > 0) return sum + a.avgTimeSec;
    return sum + 45;
  }, 0) / today.length;
  if (today.length >= dayAttemptCount) {
    return Math.round(Math.max(listTime, dayAttemptCount * avgSec));
  }
  return Math.round(Math.max(listTime, dayAttemptCount * avgSec));
}
function computeChessComActivityTimeSeconds(username, dayIso, ratedAttempts, monthGames, _lifetime, dayPuzzleAttemptCount = 0) {
  const games = chessComGamesTimeSecondsForDay(monthGames, username, dayIso);
  const listPuzzle = chessComPuzzleTimeSecondsForDay(ratedAttempts, dayIso);
  const estimatedPuzzle = dayPuzzleAttemptCount > 0 ? chessComPuzzleTimeEstimateForDay(ratedAttempts, dayIso, dayPuzzleAttemptCount) : 0;
  const puzzleTime = Math.max(listPuzzle, estimatedPuzzle);
  return games + puzzleTime;
}

// lib/lichessDayGamesFetch.ts
import { lichessProxyRequest } from "../../lib/lichessProxyThrottle.mjs";
function parseNdjsonGames(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((g) => g != null);
}
function lichessGameTimestamp(game) {
  const createdAt = game.createdAt ?? game.lastMoveAt;
  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") {
    const ms = new Date(createdAt).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}
function lichessGameInvolvesUser(game, username) {
  const want = username.trim().toLowerCase();
  if (!want) return false;
  const w = game.players?.white?.user?.id ?? game.players?.white?.user?.name;
  const b = game.players?.black?.user?.id ?? game.players?.black?.user?.name;
  const ws = w != null ? String(w).toLowerCase() : "";
  const bs = b != null ? String(b).toLowerCase() : "";
  return ws === want || bs === want;
}
async function fetchLichessGamesTimeSecondsForDay(username, dayIso, env) {
  const trimmed = username.trim();
  if (!trimmed) return 0;
  const target = dayIso.slice(0, 10);
  const [y, m, d] = target.split("-").map(Number);
  if (!y || !m || !d) return 0;
  const since = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const until = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  try {
    const params = new URLSearchParams();
    params.set("max", "100");
    params.set("moves", "0");
    params.set("since", String(since));
    params.set("until", String(until));
    const upstream = await lichessProxyRequest(
      `games/user/${trimmed}`,
      params,
      "application/x-ndjson",
      env
    );
    if (upstream.status < 200 || upstream.status >= 300) return 0;
    const games = parseNdjsonGames(upstream.body).filter((g) => {
      const ts = lichessGameTimestamp(g);
      return lichessGameInvolvesUser(g, trimmed) && ts > 0 && timestampMatchesDay(ts, target);
    });
    return games.reduce((sum, g) => sum + lichessGameDurationSeconds(g), 0);
  } catch {
    return 0;
  }
}

// lib/chesscomTacticsLifetimeStore.ts
import { createClient } from "@supabase/supabase-js";
var TABLE = "chess_com_tactics_lifetime";
function supabaseFromEnv(env = process.env) {
  const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim();
  const key = String(env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function loadTacticsLifetimeSnapshots(usernames, days, client) {
  const out = {};
  const users = [...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))];
  const isoDays = [...new Set(days.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (users.length === 0 || isoDays.length === 0) return out;
  const sb = client ?? supabaseFromEnv();
  if (!sb) return out;
  try {
    const { data, error } = await sb.from(TABLE).select("username, day, attempt_count, passed_count, failed_count, total_seconds").in("username", users).in("day", isoDays);
    if (error) {
      console.warn("[tactics-lifetime] load:", error.message);
      return out;
    }
    for (const row of data ?? []) {
      const user = String(row.username).toLowerCase();
      const day = String(row.day).slice(0, 10);
      (out[user] ??= {})[day] = {
        attemptCount: Number(row.attempt_count) || 0,
        passedCount: Number(row.passed_count) || 0,
        failedCount: Number(row.failed_count) || 0,
        totalSeconds: Number(row.total_seconds) || 0
      };
    }
  } catch (e) {
    console.warn("[tactics-lifetime] load failed:", e);
  }
  return out;
}
async function saveTacticsLifetimeSnapshots(rows, client) {
  if (rows.length === 0) return;
  const sb = client ?? supabaseFromEnv();
  if (!sb) return;
  const payload = rows.map((r) => ({
    username: r.username.trim().toLowerCase(),
    day: r.day.slice(0, 10),
    attempt_count: Math.max(0, Math.round(r.counts.attemptCount)),
    passed_count: Math.max(0, Math.round(r.counts.passedCount)),
    failed_count: Math.max(0, Math.round(r.counts.failedCount)),
    total_seconds: Math.max(0, Math.round(r.counts.totalSeconds ?? 0)),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  })).filter((r) => r.username && r.day);
  if (payload.length === 0) return;
  try {
    const { error } = await sb.from(TABLE).upsert(payload, { onConflict: "username,day" });
    if (error) console.warn("[tactics-lifetime] save:", error.message);
  } catch (e) {
    console.warn("[tactics-lifetime] save failed:", e);
  }
}
function dayPuzzleStatsFromLifetimeDelta(opening, closing) {
  if (!opening || !closing) return { count: 0, passed: 0, failed: 0 };
  const passed = Math.max(0, closing.passedCount - opening.passedCount);
  const failed = Math.max(0, closing.failedCount - opening.failedCount);
  const count = Math.max(
    Math.max(0, closing.attemptCount - opening.attemptCount),
    passed + failed
  );
  if (count > MAX_PLAUSIBLE_DAILY_PUZZLES || passed > MAX_PLAUSIBLE_DAILY_PUZZLES) {
    return { count: 0, passed: 0, failed: 0 };
  }
  if (opening.attemptCount === 0 && closing.attemptCount > MAX_PLAUSIBLE_DAILY_PUZZLES) {
    return { count: 0, passed: 0, failed: 0 };
  }
  return { count, passed, failed };
}
function enrichChessComPuzzlesWithLifetime(listStats, opening, closing) {
  return preferRicherChessComDayStats(
    listStats,
    dayPuzzleStatsFromLifetimeDelta(opening, closing)
  );
}

// lib/api-handlers/platform-week-stats.ts
var config = { maxDuration: 60 };
var LICHESS_USER_RE = /^[A-Za-z0-9_-]{1,30}$/;
var CHESSCOM_USER_RE = /^[a-z0-9_-]{1,25}$/i;
var CHESSCOM_FETCH_TIMEOUT_MS = 1e4;
function normalizeLichess(username) {
  const trimmed = username?.trim() ?? "";
  return LICHESS_USER_RE.test(trimmed) ? trimmed : "";
}
function normalizeChessCom(username) {
  const trimmed = username?.trim().toLowerCase() ?? "";
  return CHESSCOM_USER_RE.test(trimmed) ? trimmed : "";
}
function parseBody(req) {
  const raw = req.body;
  const body = typeof raw === "string" ? JSON.parse(raw) : raw;
  const students = Array.isArray(body?.students) ? body.students : [];
  const days = Array.isArray(body?.days) ? body.days.map((d) => String(d).slice(0, 10)).filter(Boolean) : [];
  return { students, days };
}
var LICHESS_ACTIVITY_TIMEOUT_MS = 8e3;
var LICHESS_BATCH_BUDGET_MS = 4e4;
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      }
    );
  });
}
async function fetchLichessActivity(username) {
  const run = async () => {
    const qs = new URLSearchParams();
    qs.set("soft", "1");
    const upstream = await lichessProxyRequest2(`user/${username}/activity`, qs, "application/json", process.env);
    if (upstream.rateLimited || upstream.status === 429 || upstream.status === 504) {
      return { rows: [], unavailable: true };
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return { rows: [], unavailable: true };
    }
    const data = JSON.parse(upstream.body);
    return {
      rows: Array.isArray(data) ? data : [],
      unavailable: false
    };
  };
  return withTimeout(
    run().catch(() => ({ rows: [], unavailable: true })),
    LICHESS_ACTIVITY_TIMEOUT_MS,
    { rows: [], unavailable: true }
  );
}
async function fetchChessComMemberTacticsLifetime(username) {
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream3(
      `https://www.chess.com/callback/member/stats/puzzles/${encodeURIComponent(username)}?type=rated`,
      { headers: { Accept: "application/json", Referer: profileUrl } },
      CHESSCOM_FETCH_TIMEOUT_MS
    );
    if (!upstream.ok) return null;
    const data = await upstream.json();
    return tacticsLifetimeFromMemberStats(parseChessComTacticsLifetimeFromMemberPayload(data));
  } catch {
    return null;
  }
}
async function fetchChessComPuzzlesRated(username) {
  const profileUrl = `https://www.chess.com/member/${encodeURIComponent(username)}/stats/puzzles`;
  try {
    const upstream = await fetchChessComUpstream3(
      `https://www.chess.com/callback/stats/tactics2/new/puzzles/${encodeURIComponent(username)}`,
      { headers: { Accept: "application/json", Referer: profileUrl } },
      CHESSCOM_FETCH_TIMEOUT_MS
    );
    if (!upstream.ok) {
      return {
        attempts: [],
        lifetimeFromBundle: null,
        failed: true
      };
    }
    const data = await upstream.json();
    return {
      attempts: parseChessComTactics2Puzzles(data, "rated"),
      lifetimeFromBundle: tacticsLifetimeFromMemberStats(parseChessComTacticsLifetimeFromTactics2Bundle(data)),
      failed: false
    };
  } catch {
    return {
      attempts: [],
      lifetimeFromBundle: null,
      failed: true
    };
  }
}
async function loadChessComUserData(username, months) {
  const monthFetches = months.map(async ({ year, month }) => {
    const key = `${username}:${year}-${month.padStart(2, "0")}`;
    try {
      const result = await fetchChessComMonthGames(username, year, month);
      return { key, games: result.games ?? [], failed: false };
    } catch {
      return { key, games: [], failed: true };
    }
  });
  const [ratedBundle, lifetimeMember, dailyChart, ...monthResults] = await Promise.all([
    fetchChessComPuzzlesRated(username),
    fetchChessComMemberTacticsLifetime(username),
    fetchChessComPuzzleDailyChart(username),
    ...monthFetches
  ]);
  const lifetime = lifetimeMember ?? ratedBundle.lifetimeFromBundle;
  const monthGames = /* @__PURE__ */ new Map();
  let monthFetchFailed = months.length > 0;
  for (const row of monthResults) {
    monthGames.set(row.key, row.games);
    if (!row.failed) monthFetchFailed = false;
  }
  const unavailable = ratedBundle.failed && monthFetchFailed && !lifetimeMember;
  return { rated: ratedBundle.attempts, lifetime, dailyChart, monthGames, unavailable };
}
async function loadActivityPuzzleEnrichment(studentIds, days) {
  const out = {};
  const sb = supabaseFromEnv();
  if (!sb) return out;
  const ids = [...new Set(studentIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const isoDays = [...new Set(days.map((d) => d.slice(0, 10)).filter(Boolean))];
  if (ids.length === 0 || isoDays.length === 0) return out;
  try {
    const { data, error } = await sb.from("chess_platform_day_activity").select("student_id, day, records").in("student_id", ids).in("day", isoDays);
    if (error || !data) return out;
    for (const row of data) {
      const sid = String(row.student_id);
      const day = String(row.day).slice(0, 10);
      const records = row.records;
      const cc = Array.isArray(records?.chessComPuzzles) ? records.chessComPuzzles : [];
      const li = Array.isArray(records?.lichessPuzzles) ? records.lichessPuzzles : [];
      const ccPassed = cc.filter((a) => a.passed).length;
      const liPassed = li.filter((a) => a.win).length;
      (out[sid] ??= {})[day] = {
        chessCom: { count: cc.length, passed: ccPassed, failed: cc.length - ccPassed },
        lichess: { count: li.length, passed: liPassed, failed: li.length - liPassed }
      };
    }
  } catch {
  }
  return out;
}
async function computePlatformWeekStats(students, days) {
  const uniqueDays = [...new Set(days.map((d) => d.slice(0, 10)))].sort();
  const months = uniqueYearMonths(uniqueDays);
  const lichessActivityByUser = /* @__PURE__ */ new Map();
  const lichessUnavailableUsers = /* @__PURE__ */ new Set();
  const chessComUnavailableUsers = /* @__PURE__ */ new Set();
  const chessPuzzlesByUser = /* @__PURE__ */ new Map();
  const chessLifetimeByUser = /* @__PURE__ */ new Map();
  const chessDailyChartByUser = /* @__PURE__ */ new Map();
  const chessMonthGamesByUserMonth = /* @__PURE__ */ new Map();
  const lichessUsers = [...new Set(students.map((s) => normalizeLichess(s.lichessUsername)).filter(Boolean))];
  const chessUsers = [...new Set(students.map((s) => normalizeChessCom(s.chessComUsername)).filter(Boolean))];
  const today = istanbulDayKey();
  const yesterday = shiftIstanbulDayKey(today, -1);
  const studentIds = students.map((s) => String(s.id ?? "").trim()).filter(Boolean);
  const [activityEnrichment, lifetimeSnaps] = await Promise.all([
    withTimeout(loadActivityPuzzleEnrichment(studentIds, uniqueDays), 4e3, {}),
    withTimeout(
      loadTacticsLifetimeSnapshots(chessUsers, [yesterday, ...uniqueDays.filter((d) => d !== yesterday)]),
      4e3,
      {}
    )
  ]);
  await Promise.all([
    (async () => {
      const started = Date.now();
      for (const username of lichessUsers) {
        if (Date.now() - started > LICHESS_BATCH_BUDGET_MS) {
          if (!lichessActivityByUser.has(username)) {
            lichessActivityByUser.set(username, []);
            lichessUnavailableUsers.add(username);
          }
          continue;
        }
        const fetched = await fetchLichessActivity(username);
        lichessActivityByUser.set(username, fetched.rows);
        if (fetched.unavailable) lichessUnavailableUsers.add(username);
      }
    })(),
    Promise.all(
      chessUsers.map(async (username) => {
        const loaded = await loadChessComUserData(username, months);
        chessPuzzlesByUser.set(username, loaded.rated);
        if (loaded.lifetime) chessLifetimeByUser.set(username, loaded.lifetime);
        if (loaded.dailyChart) chessDailyChartByUser.set(username, loaded.dailyChart);
        if (loaded.unavailable) chessComUnavailableUsers.add(username);
        for (const [key, games] of loaded.monthGames.entries()) {
          chessMonthGamesByUserMonth.set(key, games);
        }
      })
    )
  ]);
  const lifetimeToSave = [];
  for (const [username, lifetime] of chessLifetimeByUser.entries()) {
    if (uniqueDays.includes(today)) {
      lifetimeToSave.push({ username, day: today, counts: lifetime });
    }
  }
  const activityUpserts = [];
  const stats = {};
  const skipLichessGameTimeFetch = students.length > 6;
  for (const student of students) {
    const sid = String(student.id ?? "").trim();
    if (!sid) continue;
    const lichessUser = normalizeLichess(student.lichessUsername);
    const chessUser = normalizeChessCom(student.chessComUsername);
    const activities = lichessUser ? lichessActivityByUser.get(lichessUser) ?? [] : [];
    const ratedPuzzles = chessUser ? chessPuzzlesByUser.get(chessUser) ?? [] : [];
    const lifetime = chessUser ? chessLifetimeByUser.get(chessUser) : void 0;
    stats[sid] = {};
    for (const day of uniqueDays) {
      const lichessGames = lichessUser ? lichessGamesForDayFromActivity(activities, day) : 0;
      let lichessPuzzles = lichessUser ? lichessPuzzleStatsForDayFromActivity(activities, day) : { count: 0, passed: 0, failed: 0 };
      let chessGames = 0;
      let chessPuzzles = { count: 0, passed: 0, failed: 0 };
      let activityTimeSeconds = 0;
      if (chessUser) {
        const [year, month] = day.split("-");
        const monthKey = `${chessUser}:${year}-${month}`;
        const monthGames = chessMonthGamesByUserMonth.get(monthKey) ?? [];
        chessGames = chessComGamesForDay(monthGames, chessUser, day);
        chessPuzzles = chessComPuzzleStatsForDay(ratedPuzzles, day);
        const chartByDay = chessDailyChartByUser.get(chessUser) ?? {};
        chessPuzzles = preferRicherChessComDayStats(
          chessPuzzles,
          chessComPuzzleStatsFromDailyChart(chartByDay, day)
        );
        const dayRated = ratedPuzzles.filter((a) => {
          try {
            const ms = new Date(a.date).getTime();
            if (!Number.isFinite(ms)) return false;
            return istanbulDayKey(new Date(ms)) === day;
          } catch {
            return false;
          }
        });
        if (dayRated.length > 0) {
          activityUpserts.push({ student_id: sid, day, chessComPuzzles: dayRated });
        }
        const fromActivity = activityEnrichment[sid]?.[day]?.chessCom;
        if (fromActivity && fromActivity.count > 0) {
          chessPuzzles = preferRicherChessComDayStats(chessPuzzles, fromActivity);
        }
        if (day === today && lifetime) {
          const opening = lifetimeSnaps[chessUser]?.[yesterday];
          chessPuzzles = enrichChessComPuzzlesWithLifetime(chessPuzzles, opening, lifetime);
        }
        const chartTime = chartByDay[day]?.totalTimeSeconds ?? 0;
        const computedTime = computeChessComActivityTimeSeconds(
          chessUser,
          day,
          ratedPuzzles,
          monthGames,
          null,
          chessPuzzles.count
        );
        const gamesOnlyTime = computeChessComActivityTimeSeconds(
          chessUser,
          day,
          [],
          monthGames,
          null,
          0
        );
        activityTimeSeconds += Math.max(computedTime, gamesOnlyTime + chartTime);
      }
      const fromLiActivity = activityEnrichment[sid]?.[day]?.lichess;
      if (fromLiActivity && fromLiActivity.count > 0) {
        lichessPuzzles = preferRicherChessComDayStats(lichessPuzzles, fromLiActivity);
      }
      if (lichessUser && lichessGames > 0) {
        if (skipLichessGameTimeFetch) {
          activityTimeSeconds += lichessGames * 480;
        } else {
          activityTimeSeconds += await fetchLichessGamesTimeSecondsForDay(lichessUser, day, process.env);
        }
      }
      if (lichessPuzzles.count > 0) {
        activityTimeSeconds += lichessPuzzles.count * 45;
      }
      stats[sid][day] = buildPlatformDayStats(
        {
          games: lichessGames,
          puzzles: lichessPuzzles,
          // Boş aktivite ≠ hata; yalnızca rate-limit / timeout / HTTP hatasında işaretle
          // ki merge önceki doğru Lichess sayılarını korusun.
          error: lichessUser ? lichessUnavailableUsers.has(lichessUser) : void 0
        },
        {
          games: chessGames,
          puzzles: chessPuzzles,
          // Boş Chess.com günü (0 maç / 0 bulmaca) hata sayılmaz.
          error: chessUser ? chessComUnavailableUsers.has(chessUser) : void 0
        },
        activityTimeSeconds
      );
    }
  }
  if (lifetimeToSave.length > 0) {
    await saveTacticsLifetimeSnapshots(lifetimeToSave);
  }
  if (activityUpserts.length > 0) {
    const sb = supabaseFromEnv();
    if (sb) {
      for (const row of activityUpserts) {
        try {
          const { data: existing } = await sb.from("chess_platform_day_activity").select("records").eq("student_id", row.student_id).eq("day", row.day).maybeSingle();
          const prevRecords = existing?.records;
          const prevCc = Array.isArray(prevRecords?.chessComPuzzles) ? prevRecords.chessComPuzzles : [];
          const prevLi = Array.isArray(prevRecords?.lichessPuzzles) ? prevRecords.lichessPuzzles : [];
          const map = /* @__PURE__ */ new Map();
          for (const p of prevCc) {
            if (p?.id != null) map.set(p.id, p);
          }
          for (const p of row.chessComPuzzles) {
            if (p?.id != null) map.set(p.id, p);
          }
          const merged = Array.from(map.values());
          if (merged.length === 0 && prevLi.length === 0) continue;
          await sb.from("chess_platform_day_activity").upsert({
            student_id: row.student_id,
            day: row.day,
            records: { chessComPuzzles: merged, lichessPuzzles: prevLi },
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }, { onConflict: "student_id,day" });
        } catch (e) {
          console.warn("[platform-week-stats] activity upsert:", e);
        }
      }
    }
  }
  return { stats, days: uniqueDays };
}
async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  let students = [];
  let days = [];
  try {
    ({ students, days } = parseBody(req));
  } catch {
    res.status(400).json({ error: "Ge\xE7ersiz istek g\xF6vdesi" });
    return;
  }
  if (students.length === 0 || days.length === 0) {
    res.status(400).json({ error: "students ve days gerekli" });
    return;
  }
  if (students.length > 80) {
    res.status(400).json({ error: "En fazla 80 \xF6\u011Frenci" });
    return;
  }
  try {
    const result = await computePlatformWeekStats(students, days);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(result);
  } catch (err) {
    console.error("[platform-week-stats] handler error:", err);
    res.status(500).json({
      error: "Platform verisi hesaplanamad\u0131",
      stats: {},
      days: [...new Set(days.map((d) => String(d).slice(0, 10)))]
    });
  }
}
export {
  computePlatformWeekStats,
  config,
  handler as default
};
