/** Antrenman bildirimi — saf yardımcılar (sunucu + istemci uyumlu) */

export function todayDayKey(ref = new Date()) {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function istanbulNowParts(ref = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(ref);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return {
    dayKey: day,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dateLabel: new Date(`${day}T12:00:00`).toLocaleDateString('tr-TR'),
    timeLabel: `${get('hour')}:${get('minute')}`,
  };
}

export function weekdayKeyFromIso(isoDate) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

export function timestampMatchesDay(ms, target) {
  const day = target.slice(0, 10);
  const local = todayDayKey(new Date(ms));
  const utc = new Date(ms).toISOString().slice(0, 10);
  return local === day || utc === day;
}

function normalizeGroup(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isHomeworkAssignedToStudent(hw, studentId, studentGroup) {
  const to = hw.assignedTo || hw.assigned_to || [];
  const list = Array.isArray(to) ? to : [];
  const studentIdStr = String(studentId).trim();
  const studentGroupNorm = normalizeGroup(studentGroup);
  const excludedIds = new Set(
    list
      .filter((a) => String(a).startsWith('exclude:'))
      .map((a) => String(a).replace(/^exclude:\s*/i, '').trim())
      .filter(Boolean),
  );
  if (excludedIds.has(studentIdStr)) return false;
  for (const a of list) {
    const s = String(a);
    if (s.startsWith('group:')) {
      const hwGroup = s.replace(/^group:\s*/i, '').trim();
      if (normalizeGroup(hwGroup) === studentGroupNorm) return true;
      if (hwGroup === String(studentGroup ?? '').trim()) return true;
    } else if (!s.startsWith('exclude:') && s.trim() === studentIdStr) {
      return true;
    }
  }
  const groupName = hw.groupName ?? hw.group_name;
  if (groupName && normalizeGroup(groupName) === studentGroupNorm) return true;
  return false;
}

export function studentDailyTargetHasGoals(target, hwDefaults = {}) {
  if ((hwDefaults.dailyGameTarget ?? hwDefaults.daily_game_target ?? 0) > 0) return true;
  if ((hwDefaults.dailyPuzzleTarget ?? hwDefaults.daily_puzzle_target ?? 0) > 0) return true;
  if (!target) return false;
  if ((target.dailyGameTarget ?? target.daily_game_target ?? 0) > 0) return true;
  if ((target.dailyPuzzleTarget ?? target.daily_puzzle_target ?? 0) > 0) return true;
  const schedule = target.weeklySchedule ?? target.weekly_schedule;
  if (!schedule || typeof schedule !== 'object') return false;
  return Object.values(schedule).some(
    (day) => (day?.dailyGameTarget ?? day?.daily_game_target ?? 0) > 0
      || (day?.dailyPuzzleTarget ?? day?.daily_puzzle_target ?? 0) > 0,
  );
}

export function homeworkHasPlatformGoals(hw) {
  if (studentDailyTargetHasGoals(undefined, hw)) return true;
  const targets = hw.studentDailyTargets ?? hw.student_daily_targets;
  if (!targets || typeof targets !== 'object') return false;
  return Object.values(targets).some((t) => studentDailyTargetHasGoals(t));
}

export function isPlatformHomework(hw) {
  const puzzles = hw.puzzles ?? [];
  if (Array.isArray(puzzles) && puzzles.length > 0) return false;
  return homeworkHasPlatformGoals(hw);
}

export function resolveDayTargets(draft, hw, weekday) {
  const schedule = draft?.weeklySchedule ?? draft?.weekly_schedule;
  const dayData = schedule?.[weekday] ?? schedule?.[String(weekday)];
  return {
    gameTarget: Math.max(
      0,
      dayData?.dailyGameTarget ?? dayData?.daily_game_target
        ?? draft?.dailyGameTarget ?? draft?.daily_game_target
        ?? hw.dailyGameTarget ?? hw.daily_game_target ?? 0,
    ),
    puzzleTarget: Math.max(
      0,
      dayData?.dailyPuzzleTarget ?? dayData?.daily_puzzle_target
        ?? draft?.dailyPuzzleTarget ?? draft?.daily_puzzle_target
        ?? hw.dailyPuzzleTarget ?? hw.daily_puzzle_target ?? 0,
    ),
    minAccuracy: Math.max(
      0,
      Math.min(
        100,
        dayData?.minPuzzleAccuracyPct ?? dayData?.min_puzzle_accuracy_pct
          ?? draft?.minPuzzleAccuracyPct ?? draft?.min_puzzle_accuracy_pct
          ?? hw.minPuzzleAccuracyPct ?? hw.min_puzzle_accuracy_pct ?? 60,
      ),
    ),
  };
}

export function minCorrectRequiredForPuzzleGoal(puzzleTarget, minAccuracy) {
  if (puzzleTarget <= 0) return 0;
  if (minAccuracy <= 0) return 0;
  return Math.ceil(puzzleTarget * minAccuracy / 100);
}

export function evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed) {
  if (puzzleTarget <= 0) return true;
  if (puzzleSolved < puzzleTarget) return false;
  const minCorrect = minCorrectRequiredForPuzzleGoal(puzzleTarget, minAccuracy);
  if (minCorrect <= 0) return true;
  return puzzlePassed >= minCorrect;
}

export function evaluatePlatformDailyGoals(gameTarget, puzzleTarget, minAccuracy, games, puzzleSolved, puzzlePassed) {
  const puzzleAccuracy = puzzleSolved > 0 ? (puzzlePassed / puzzleSolved) * 100 : 0;
  const gamesMet = gameTarget <= 0 || games >= gameTarget;
  const puzzlesMet = evaluatePuzzleGoalMet(puzzleTarget, minAccuracy, puzzleSolved, puzzlePassed);
  const hasTargets = gameTarget > 0 || puzzleTarget > 0;
  return {
    gamesMet,
    puzzlesMet,
    done: hasTargets && gamesMet && puzzlesMet,
    puzzleAccuracy,
  };
}

export function evaluatePlatformDayGoalsFromStats(gameTarget, puzzleTarget, minAccuracy, platform) {
  const games = platform?.games ?? 0;
  const puzzleSolved = platform?.puzzleSolved ?? 0;
  const puzzlePassed = platform?.puzzlePassed ?? 0;
  const base = evaluatePlatformDailyGoals(gameTarget, puzzleTarget, minAccuracy, games, puzzleSolved, puzzlePassed);
  return { ...base, puzzleSolved, puzzlePassed, games };
}

/** Öğrencinin belirli gün için atanmış platform antrenman hedefi */
export function getStudentTrainingForDay(student, homeworks, dayIso) {
  const weekday = weekdayKeyFromIso(dayIso);
  let best = null;
  for (const hw of homeworks) {
    if (!isPlatformHomework(hw)) continue;
    if (!isHomeworkAssignedToStudent(hw, student.id, student.group)) continue;
    const targets = hw.studentDailyTargets ?? hw.student_daily_targets ?? {};
    const studentTarget = targets[student.id];
    const { gameTarget, puzzleTarget, minAccuracy } = resolveDayTargets(studentTarget, hw, weekday);
    if (gameTarget <= 0 && puzzleTarget <= 0) continue;
    best = {
      homework: hw,
      homeworkTitle: hw.title ?? 'Antrenman',
      gameTarget,
      puzzleTarget,
      minAccuracy,
    };
  }
  return best;
}

export function parentPhonesForStudent(student) {
  const raw = [
    student.fatherPhone ?? student.father_phone,
    student.motherPhone ?? student.mother_phone,
    student.parentPhone ?? student.parent_phone,
    ...(Array.isArray(student.contactNumbers ?? student.contact_numbers)
      ? (student.contactNumbers ?? student.contact_numbers)
      : []),
  ];
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    const trimmed = String(p ?? '').trim();
    if (!trimmed) continue;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 10) continue;
    const key = digits.slice(-10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function renderTemplate(body, vars) {
  return String(body).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function buildTrainingTemplateVars(student, training, evalResult, dayIso) {
  const tr = istanbulNowParts();
  return {
    ogrenci_adi: student.name ?? '',
    veli_adi: student.parentName ?? student.parent_name ?? student.fatherName ?? student.father_name ?? 'Veli',
    kulup_adi: student.branchOffice ?? student.branch_office ?? student.branch ?? 'Kulüp',
    grup: student.group ?? '',
    tarih: new Date(`${dayIso}T12:00:00`).toLocaleDateString('tr-TR'),
    saat: tr.timeLabel,
    antrenman_adi: training.homeworkTitle,
    mac_hedef: String(training.gameTarget),
    bulmaca_hedef: String(training.puzzleTarget),
    mac_sayisi: String(evalResult.games ?? 0),
    bulmaca_sayisi: String(evalResult.puzzleSolved ?? 0),
    durum: evalResult.done ? 'Tamamlandı' : 'Eksik',
  };
}

export function dbRowToStudent(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    group: row.group_name ?? row.group ?? '',
    branch: row.branch ?? '',
    branchOffice: row.branch_office ?? row.branchOffice ?? '',
    parentName: row.parent_name ?? row.parentName ?? '',
    parentPhone: row.parent_phone ?? row.parentPhone ?? '',
    fatherName: row.father_name ?? row.fatherName ?? '',
    fatherPhone: row.father_phone ?? row.fatherPhone ?? '',
    motherName: row.mother_name ?? row.motherName ?? '',
    motherPhone: row.mother_phone ?? row.motherPhone ?? '',
    contactNumbers: row.contact_numbers ?? row.contactNumbers ?? [],
    lichessUsername: row.lichess_username ?? row.lichessUsername ?? '',
    chessComUsername: row.chess_com_username ?? row.chessComUsername ?? '',
  };
}

export function dbRowToHomework(row) {
  if (!row || typeof row !== 'object') return null;
  let puzzles = row.puzzles;
  if (typeof puzzles === 'string') {
    try { puzzles = JSON.parse(puzzles); } catch { puzzles = []; }
  }
  let assignedTo = row.assigned_to ?? row.assignedTo ?? row.assignedto;
  if (typeof assignedTo === 'string') {
    try { assignedTo = JSON.parse(assignedTo); } catch { assignedTo = []; }
  }
  let studentDailyTargets = row.student_daily_targets ?? row.studentDailyTargets;
  if (typeof studentDailyTargets === 'string') {
    try { studentDailyTargets = JSON.parse(studentDailyTargets); } catch { studentDailyTargets = {}; }
  }
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    puzzles: Array.isArray(puzzles) ? puzzles : [],
    assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
    groupName: row.group_name ?? row.groupName ?? '',
    dailyGameTarget: row.daily_game_target ?? row.dailyGameTarget ?? 0,
    dailyPuzzleTarget: row.daily_puzzle_target ?? row.dailyPuzzleTarget ?? 0,
    minPuzzleAccuracyPct: row.min_puzzle_accuracy_pct ?? row.minPuzzleAccuracyPct ?? 60,
    studentDailyTargets: studentDailyTargets && typeof studentDailyTargets === 'object' ? studentDailyTargets : {},
  };
}
