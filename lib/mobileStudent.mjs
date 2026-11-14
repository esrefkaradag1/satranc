/**
 * Öğrenci / veli mobil paneli: web menülerinin okuduğu tablolar.
 */
import { insertSiteMessage } from './siteMessagesDb.mjs';
import { dbRowToStudent, getSupabase, studentForClientResponse } from './studentParentAuth.mjs';

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function assignedList(row) {
  const raw = row.assignedTo ?? row.assignedto ?? row.assigned_to;
  return Array.isArray(raw) ? raw.map((item) => text(item)).filter(Boolean) : [];
}

function normalizeGroup(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function homeworkAssigned(row, studentId, group) {
  const to = assignedList(row);
  const excluded = new Set(
    to.filter((item) => item.toLowerCase().startsWith('exclude:')).map((item) => item.replace(/^exclude:\s*/i, '')),
  );
  if (excluded.has(studentId)) return false;
  const groupNorm = normalizeGroup(group);
  for (const item of to) {
    if (item.toLowerCase().startsWith('exclude:')) continue;
    if (item.toLowerCase().startsWith('group:')) {
      const name = item.replace(/^group:\s*/i, '');
      if (normalizeGroup(name) === groupNorm) return true;
    } else if (item === studentId) {
      return true;
    }
  }
  return false;
}

async function rows(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

function dayName(slot) {
  const label = text(slot?.dayLabel || slot?.day);
  if (label) return label;
  const index = Number(slot?.dayOfWeek);
  return WEEKDAYS[index] || 'Gün';
}

function profileOf(student) {
  const safe = studentForClientResponse(student);
  return {
    id: text(safe.id),
    name: text(safe.name) || 'Öğrenci',
    studentNo: safe.studentNo ?? null,
    tcNo: text(safe.tcNo),
    birthDate: text(safe.birthDate),
    branchOffice: text(safe.branchOffice || safe.branch),
    branch: text(safe.branch),
    group: text(safe.group || safe.groupName),
    level: text(safe.level),
    school: text(safe.school),
    status: text(safe.status) || 'active',
    elo: Number(safe.elo) || 0,
    ukd: Number(safe.ukd) || 0,
    fideId: text(safe.fideId),
    lichessUsername: text(safe.lichessUsername),
    chessComUsername: text(safe.chessComUsername),
    paymentStatus: text(safe.paymentStatus),
    registrationType: text(safe.registrationType),
    isScholarship: Boolean(safe.isScholarshipStudent),
    registrationDate: text(safe.registrationDate),
    fatherName: text(safe.fatherName || safe.parentName),
    fatherPhone: text(safe.fatherPhone || safe.parentPhone),
    motherName: text(safe.motherName),
    motherPhone: text(safe.motherPhone),
    photoUrl: text(safe.photoUrl),
  };
}

function duesLabel(profile) {
  if (profile.status === 'inactive') return 'Dondu';
  if (profile.isScholarship) return 'Burslu';
  if (profile.registrationType === 'package') return 'Özel Ders Paketi';
  if (profile.paymentStatus === 'Paid') return 'Ödendi';
  if (profile.paymentStatus === 'Partial') return 'Kısmi';
  return 'Borç';
}

export async function mobileStudentHandler(body, env) {
  const action = text(body?.action);
  const studentId = text(body?.studentId);
  const role = text(body?.role) || 'student';
  if (!studentId) return { status: 400, body: { error: 'Öğrenci kaydı gerekli' } };
  if (role !== 'student' && role !== 'parent') {
    return { status: 400, body: { error: 'Bu menüler öğrenci ve veli hesabına açık' } };
  }
  const sb = await getSupabase(env);
  if (!sb) return { status: 503, body: { error: 'Supabase yapılandırması eksik' } };

  const { data: studentRow, error: studentError } = await sb.from('students').select('*').eq('id', studentId).maybeSingle();
  if (studentError) return { status: 500, body: { error: studentError.message } };
  if (!studentRow) return { status: 404, body: { error: 'Öğrenci kaydı bulunamadı' } };
  const student = dbRowToStudent(studentRow);
  const profile = profileOf(student);

  if (action === 'send-message') {
    const messageText = text(body?.text).slice(0, 2000);
    if (!messageText) return { status: 400, body: { error: 'Mesaj boş olamaz' } };
    const kind = role === 'parent' ? 'parent' : 'student';
    const result = await insertSiteMessage(sb, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: `${kind}:${studentId}`,
      kind,
      targetStudentId: studentId,
      senderRole: role,
      senderName: profile.name,
      text: messageText,
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) return { status: result.missingTable ? 503 : 500, body: { error: result.error || 'Mesaj gönderilemedi' } };
    return { status: 200, body: { ok: true } };
  }

  const group = profile.group;
  const [
    lessonRows,
    groupRows,
    attendanceRows,
    transactionRows,
    homeworkRows,
    attemptRows,
    studyRows,
    puzzleRows,
    roomRows,
    galleryRows,
    messageRows,
    notificationRows,
    analysisRows,
    tournamentRows,
    peerRows,
  ] = await Promise.all([
    rows(sb.from('lessons').select('*').limit(400)),
    rows(sb.from('training_groups').select('*').limit(200)),
    rows(sb.from('attendance_records').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(80)),
    rows(sb.from('transactions').select('*').eq('student_id', studentId).order('date', { ascending: false }).limit(80)),
    rows(sb.from('homeworks').select('*').limit(200)),
    rows(sb.from('homework_attempts').select('id,homework_id,puzzle_id,correct,student_id').eq('student_id', studentId).limit(500)),
    rows(sb.from('chess_studies').select('id,title,emoji,description,chapters,member_ids').limit(200)),
    rows(sb.from('puzzles').select('id,title,difficulty,points,category,theme').limit(40)),
    rows(sb.from('live_lesson_state').select('id,room_name,updated_at').order('updated_at', { ascending: false }).limit(20)),
    rows(sb.from('gallery').select('id,url,title,date,student_id,group_name').order('date', { ascending: false }).limit(80)),
    rows(sb.from('site_messages').select('*').order('created_at', { ascending: false }).limit(160)),
    rows(
      sb.from('parent_panel_notifications')
        .select('id,student_id,event,title,body,read_at,created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(80),
    ),
    rows(sb.from('performance_analyses').select('*').eq('student_id', studentId).limit(20)),
    rows(sb.from('tournaments').select('id,name,format,start_at,time_control,duration_minutes,description,participant_ids,standings').limit(80)),
    rows(sb.from('students').select('id,name,elo,ukd,group_name,status,level').limit(400)),
  ]);

  const schedule = [];
  const groupNorm = normalizeGroup(group);
  for (const groupRow of groupRows) {
    const name = text(groupRow.name);
    if (groupNorm && normalizeGroup(name) !== groupNorm) continue;
    const slots = Array.isArray(groupRow.lesson_slots) ? groupRow.lesson_slots : Array.isArray(groupRow.lessonSlots) ? groupRow.lessonSlots : [];
    for (const slot of slots) {
      if (!text(slot?.startTime || slot?.start_time)) continue;
      schedule.push({
        id: `group-${groupRow.id}-${schedule.length}`,
        day: dayName(slot),
        startTime: text(slot.startTime || slot.start_time),
        endTime: text(slot.endTime || slot.end_time),
        topic: text(slot.topic) || name || 'Grup dersi',
        group: name,
      });
    }
  }
  for (const lesson of lessonRows) {
    const lessonStudent = text(lesson.student_id || lesson.studentId);
    const lessonGroup = normalizeGroup(lesson.group_name || lesson.group);
    if (lessonStudent !== studentId && (!groupNorm || lessonGroup !== groupNorm)) continue;
    schedule.push({
      id: text(lesson.id) || `lesson-${schedule.length}`,
      day: text(lesson.day) || 'Gün',
      startTime: text(lesson.start_time || lesson.startTime),
      endTime: text(lesson.end_time || lesson.endTime),
      topic: text(lesson.topic) || 'Ders',
      group: text(lesson.group_name || lesson.group),
    });
  }

  const attendance = attendanceRows.map((row) => ({
    id: text(row.id),
    date: text(row.date).slice(0, 10),
    status: text(row.status) || 'absent',
    teacherName: text(row.teacher_name || row.teacherName),
    summary: text(row.lesson_summary || row.lessonSummary),
    sessionTime: text(row.session_time || row.sessionTime),
  }));

  const payments = transactionRows
    .filter((row) => text(row.type) !== 'expense')
    .map((row) => ({
      id: text(row.id),
      date: text(row.date).slice(0, 10),
      amount: Number(row.amount) || 0,
      category: text(row.category),
      description: text(row.description || row.lesson_package_name),
      lessonCount: row.lesson_count != null ? Number(row.lesson_count) : null,
    }));
  const privateRow = payments.find((row) => row.category === 'Özel Ders');
  const privateLesson = privateRow
    ? {
        packageName: privateRow.description || 'Özel Ders Paketi',
        lessonCount: privateRow.lessonCount,
        amount: privateRow.amount,
        date: privateRow.date,
      }
    : null;

  const solvedByHomework = new Map();
  for (const attempt of attemptRows) {
    if (!attempt.correct) continue;
    const homeworkId = text(attempt.homework_id || attempt.homeworkId);
    const puzzleId = text(attempt.puzzle_id || attempt.puzzleId);
    if (!homeworkId || !puzzleId) continue;
    if (!solvedByHomework.has(homeworkId)) solvedByHomework.set(homeworkId, new Set());
    solvedByHomework.get(homeworkId).add(puzzleId);
  }
  const homeworks = homeworkRows
    .filter((row) => homeworkAssigned(row, studentId, group))
    .map((row) => {
      const puzzles = Array.isArray(row.puzzles) ? row.puzzles.map((id) => text(id)).filter(Boolean) : [];
      const solved = solvedByHomework.get(text(row.id))?.size ?? 0;
      return {
        id: text(row.id),
        title: text(row.title) || 'Ödev',
        dueDate: text(row.dueDate || row.duedate).slice(0, 10),
        puzzleCount: puzzles.length,
        solved,
        done: puzzles.length > 0 ? solved >= puzzles.length : false,
      };
    });

  const studies = studyRows
    .filter((row) => Array.isArray(row.member_ids) && row.member_ids.map((id) => text(id)).includes(studentId))
    .map((row) => ({
      id: text(row.id),
      title: text(row.title) || 'Çalışma',
      emoji: text(row.emoji) || '♟',
      description: text(row.description),
      chapters: (Array.isArray(row.chapters) ? row.chapters : []).map((chapter, index) => ({
        id: text(chapter?.id) || `${row.id}-${index}`,
        title: text(chapter?.title || chapter?.name) || `Bölüm ${index + 1}`,
        orientation: text(chapter?.orientation),
      })),
    }));

  const messages = messageRows
    .filter((row) => {
      const target = text(row.target_student_id);
      const conversation = text(row.conversation_id);
      const targetGroup = normalizeGroup(row.target_group);
      return target === studentId
        || conversation === `student:${studentId}`
        || conversation === `parent:${studentId}`
        || (groupNorm && targetGroup === groupNorm);
    })
    .map((row) => ({
      id: text(row.id),
      senderName: text(row.sender_name) || 'Kullanıcı',
      senderRole: text(row.sender_role),
      text: text(row.text),
      createdAt: text(row.created_at),
    }))
    .reverse();

  const notifications = notificationRows.map((row) => ({
    id: text(row.id),
    title: text(row.title) || 'Bildirim',
    body: text(row.body),
    read: Boolean(row.read_at),
    createdAt: text(row.created_at),
  }));

  const analyses = analysisRows.map((row) => ({
    id: text(row.id),
    date: text(row.analysis_date || row.analysisDate).slice(0, 10),
    technical: row.technical_skills ?? row.technicalSkills ?? null,
    tactical: row.tactical_understanding ?? row.tacticalUnderstanding ?? null,
    notes: text(row.technical_notes || row.tactical_notes || row.mental_notes),
  }));

  const tournaments = tournamentRows
    .filter((row) => Array.isArray(row.participant_ids) && row.participant_ids.map((id) => text(id)).includes(studentId))
    .map((row) => {
      const standing = row.standings && typeof row.standings === 'object' ? row.standings[studentId] : null;
      return {
        id: text(row.id),
        name: text(row.name) || 'Turnuva',
        format: text(row.format),
        startAt: text(row.start_at),
        timeControl: text(row.time_control),
        points: standing?.points ?? null,
      };
    });

  const gallery = galleryRows
    .filter((row) => !text(row.student_id) || text(row.student_id) === studentId)
    .map((row) => ({
      id: text(row.id),
      title: text(row.title) || 'Görsel',
      url: text(row.url),
      date: text(row.date).slice(0, 10),
    }));

  const peers = peerRows
    .filter((row) => text(row.status) !== 'inactive')
    .filter((row) => !groupNorm || normalizeGroup(row.group_name) === groupNorm)
    .map((row) => ({
      id: text(row.id),
      name: text(row.name) || 'Öğrenci',
      elo: Number(row.elo) || 0,
      ukd: Number(row.ukd) || 0,
      level: text(row.level),
    }))
    .sort((a, b) => (b.ukd || b.elo) - (a.ukd || a.elo))
    .slice(0, 40);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const present30 = attendance.filter((row) => row.date >= since && (row.status === 'present' || row.status === 'var')).length;
  const pendingHomework = homeworks.filter((row) => !row.done).length;

  return {
    status: 200,
    body: {
      profile,
      summary: {
        duesLabel: duesLabel(profile),
        attendanceCount: attendance.length,
        attendanceRate: `${Math.round((present30 / 8) * 100)}%`,
        pendingHomework,
        studyCount: studies.length,
        unread: notifications.filter((row) => !row.read).length,
      },
      schedule,
      attendance,
      payments,
      privateLesson,
      homeworks,
      studies,
      puzzles: puzzleRows.map((row) => ({
        id: text(row.id),
        title: text(row.title) || 'Bulmaca',
        difficulty: text(row.difficulty),
        points: Number(row.points) || 0,
        category: text(row.category || row.theme),
      })),
      liveRooms: roomRows.map((row) => ({
        id: text(row.id),
        name: text(row.room_name) || 'Canlı ders',
        updatedAt: text(row.updated_at),
      })),
      gallery,
      messages,
      notifications,
      analyses,
      tournaments,
      leaderboard: peers,
    },
  };
}
