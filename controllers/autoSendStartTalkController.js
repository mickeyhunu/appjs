const db = require('../config/db');

function taskLog(req, taskName, message, extra) {
  const requestId = `${new Date().toISOString()}`;
  if (extra !== undefined) {
    console.log(`[작업로그][${requestId}][${taskName}] ${message}`, extra);
    return;
  }
  console.log(`[작업로그][${requestId}][${taskName}] ${message}`);
}

// 한글 요일 표기용 상수(보드 헤더 생성 시 사용)
const KOREAN_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// 문자열(예: "10개", "9.5ㄲ")에서 숫자만 추출해 통일된 숫자값으로 변환
function normalizeCountText(value) {
  const text = String(value || '').trim();
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function extractLineCount(line, isJm) {
  const baseCount = normalizeCountText(line);
  if (!Number.isFinite(baseCount) || baseCount <= 0) return null;
  const jmBonus = isJm || String(line || '').includes('ㅈㅁ') ? 0.1 : 0;
  return baseCount + jmBonus;
}

// 세션 배열의 종료 카운트를 모두 합산해 총 갯수 계산
function calcTotalValue(board) {
  let total = 0;
  let found = false;

  for (const session of board.sessions || []) {
    const parsed = extractLineCount(session.endCount, session.isJm === true);
    if (parsed === null) continue;
    total += parsed;
    found = true;
  }

  if (!found) return null;
  return total;
}

// 총 갯수 출력 포맷(정수면 정수, 소수면 소수 첫째 자리)
function formatTotalParts(total) {
  if (total === null || total === undefined) return '';
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

// E 보드 여부 판별(값이 명시적으로 false 인 경우만 일반 보드)
function isEBoard(board) {
  return board.isE !== false;
}

// E 보드면 "E" 접두어를 붙임
function getEPrefix(board) {
  return isEBoard(board) ? 'E' : '';
}

// 총 갯수 문자열 생성
function calcTotal(board) {
  const totalValue = calcTotalValue(board);
  if (totalValue !== null) {
    return `${getEPrefix(board)}${formatTotalParts(totalValue)}개`;
  }
  return `${getEPrefix(board)}${board.totalCount}개`;
}

// 총 금액 계산(E 보드/일반 보드 단가 분기)
function calcAmount(board) {
  const parts = calcTotalValue(board);
  if (parts === null) return `${Math.round(board.totalCount * 9.9)}만원`;

  const tc = isEBoard(board) ? 10 : 9;
  const amount = (Math.floor(parts) * tc) + Math.round((parts % 1) * 10) - 1;
  return amount < 0 ? '0만원' : `${amount}만원`;
}

function parseDayKey(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))) {
    return null;
  }
  return dayKey;
}


function parseSessionsPayload(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return { sessions: parsed, isE: true };
    }

    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      isE: parsed.isE !== false
    };
  } catch (error) {
    return { sessions: [], isE: true };
  }
}

function findRoomAndManager(text) {
  const m = String(text || '').match(/^(V\d+|\d{2,3})T\s+(.+?)\s+([\d.]+ㄲ)(?:\s+ㅈㅁ)?$/);
  if (!m) return null;
  return { roomNo: m[1], roomManagerName: m[2], endCount: m[3] };
}

async function getOrCreateBoard(storeName, workerName, dayKey, targetRoomName) {
  // 현재 날짜 보드 조회: 있으면 바로 반환
  const [rows] = await db.execute(
    `SELECT storeName, workerName, dayKey, targetRoomName, isE, totalCount, sessionsJson
     FROM AUTO_TALK
     WHERE storeName = ? AND workerName = ? AND dayKey = ? AND targetRoomName = ?`,
    [storeName, workerName, dayKey, targetRoomName]
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      storeName: row.storeName,
      workerName: row.workerName,
      dayKey: row.dayKey,
      targetRoomName: String(row.targetRoomName || '').trim(),
      isE: row.isE === 1,
      totalCount: Number(row.totalCount || 0),
      sessions: parseSessionsPayload(row.sessionsJson).sessions,
    };
  }

  // 보드가 없으면 isE 기본값(0/false)으로 신규 보드 생성
  const isE = false;
  const newBoard = { storeName, workerName, dayKey, targetRoomName: '', isE, totalCount: 0, sessions: [] };
  await saveBoard(newBoard);
  return newBoard;
}

async function saveBoard(board) {
  await db.execute(
    `INSERT INTO AUTO_TALK (storeName, workerName, dayKey, targetRoomName, isE, totalCount, sessionsJson)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      targetRoomName = VALUES(targetRoomName),
      isE = VALUES(isE),
      totalCount = VALUES(totalCount),
      sessionsJson = VALUES(sessionsJson)`,
    [board.storeName, board.workerName, board.dayKey, board.targetRoomName || '', board.isE === true ? 1 : 0, board.totalCount, JSON.stringify(board.sessions || [])]
  );
}

function formatHeader(workerName, dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAYS[date.getDay()];
  return `💟 ${workerName} 💟 ${month}월 ${day}일 ${weekday} 💟`;
}

function calculateTime(hours, minutes, offset) {
  const time = new Date();
  time.setHours(hours);
  time.setMinutes(minutes + offset);
  time.setSeconds(0);
  time.setMilliseconds(0);
  return time;
}

function formatTime(time) {
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}

function formatMinute(time) {
  return `${String(time.getMinutes()).padStart(2, '0')}`;
}

function buildLatestDetail(latestOpen) {
  const match = String(latestOpen.startAt || '').match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return `🚪 방번호 ➜ ${latestOpen.roomNo}T ${latestOpen.roomManagerName}\n⏰ 스타트 ➜ ${latestOpen.startAt}`;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const startTime = calculateTime(hours, minutes, 0);
  const halfTeaTime = calculateTime(hours, minutes, 11);
  const fullTeaTime = calculateTime(hours, minutes, 31);
  const finishTime = calculateTime(hours, minutes, 60);

  return `🚪 방번호 ➜ ${latestOpen.roomNo}T ${latestOpen.roomManagerName}\n⏰ 스타트 ➜ ${formatTime(startTime)}\n⏰ 반 티 ➜ ${formatMinute(halfTeaTime)}분\n⏰ 완 티 ➜ ${formatMinute(fullTeaTime)}분\n🏁 만 시 ➜ ${formatMinute(finishTime)}분`;
}

function formatBoardText(board) {
  const rows = board.sessions.map((session, i) => {
    const no = `${i + 1}️⃣`;
    if (session.status === 'START') {
      return `${no} ${session.roomNo}T ${session.roomManagerName} ${session.startAt}`;
    }
    const jmSuffix = session.isJm === true ? ' ㅈㅁ' : '';
    return `${no} ${session.roomNo}T ${session.roomManagerName} ${session.endCount}${jmSuffix}`;
  });

  const latestOpen = [...board.sessions].reverse().find((s) => s.status === 'START') || null;
  const detail = latestOpen ? buildLatestDetail(latestOpen) : '\n';

  return [
    formatHeader(board.workerName, board.dayKey),
    '➖➖➖➖➖➖➖➖➖➖➖',
    rows.join('\n'),
    '➖➖➖➖➖➖➖➖➖➖➖',
    detail,
    '➖➖➖➖➖➖➖➖➖➖➖',
    `총 갯수 ㅡ ${calcTotal(board)}`,
    `총 금액 ㅡ ${calcAmount(board)}`
  ].join('\n');
}

// =========================
// API 1) saveChoiceEvent
// =========================
async function saveChoiceEvent(req, res) {
  // [흐름 요약]
  // 1) 요청값 검증
  // 2) 보드 조회/생성
  // 3) START/END 이벤트에 따라 sessions 갱신
  // 4) 저장 후 응답
  const payload = req.body || {};
  const roomManagerName = String(payload.roomManagerName || '').trim();
  const targetRoomName = String(payload.targetRoomName || '').trim();

  const eventType = String(payload.eventType || '').trim().toUpperCase();

  const required = ['storeName', 'workerName', 'roomNo', 'dayKey'];
  const missing = required.filter((field) => !String(payload[field] || '').trim());
  if (!roomManagerName) missing.push('roomManagerName');

  if (missing.length) {
    return res.status(400).json({ ok: false, error: `필수값 누락: ${missing.join(', ')}` });
  }

  const dayKey = parseDayKey(payload.dayKey);
  if (!dayKey) {
    return res.status(400).json({ ok: false, error: 'dayKey 형식 오류(YYYY-MM-DD)' });
  }

  try {
    taskLog(req, 'saveChoiceEvent', '시작', {
      storeName: payload.storeName,
      workerName: payload.workerName,
      roomNo: payload.roomNo,
      eventType,
      dayKey
    });

    const board = await getOrCreateBoard(payload.storeName, payload.workerName, dayKey);
    taskLog(req, 'saveChoiceEvent', '보드 조회 완료', { sessionCount: board.sessions.length, totalCount: board.totalCount });
    board.targetRoomName = targetRoomName || board.roomName || '';

    const now = new Date();
    const startAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (eventType === 'START') {
      board.sessions.push({
        roomNo: payload.roomNo,
        roomManagerName: roomManagerName,
        targetRoomName: targetRoomName,
        isJm: payload.isJm === true,
        rawMessage: String(payload.rawMessage || ''),
        startAt,
        endCount: '',
        status: 'START'
      });
    } else if (eventType === 'END') {
      const countValue = normalizeCountText(payload.endCount);
      board.totalCount += countValue;

      const lastOpen = [...board.sessions].reverse().find((s) => s.status === 'START' && s.roomNo === payload.roomNo);
      if (lastOpen) {
        lastOpen.roomNo = payload.roomNo;
        lastOpen.roomManagerName = roomManagerName;
        lastOpen.targetRoomName = targetRoomName;
        lastOpen.isJm = payload.isJm === true;
        lastOpen.rawMessage = String(payload.rawMessage || '');
        lastOpen.endCount = payload.endCount || '';
        lastOpen.status = 'END';
      } else {
        board.sessions.push({
          roomNo: payload.roomNo,
          roomManagerName: roomManagerName,
          targetRoomName: targetRoomName,
          isJm: payload.isJm === true,
          rawMessage: String(payload.rawMessage || ''),
          startAt: '',
          endCount: payload.endCount || '',
          status: 'END'
        });
      }
    } else {
      return res.status(400).json({ ok: false, error: `지원하지 않는 eventType: ${eventType}` });
    }

    await saveBoard(board);
    taskLog(req, 'saveChoiceEvent', '보드 저장 완료', { sessionCount: board.sessions.length, totalCount: board.totalCount });
    return res.json({ ok: true });
  } catch (error) {
    taskLog(req, 'saveChoiceEvent', '실패', { error: error.message });
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// =========================
// API 2) renderChoiceBoard
// =========================
async function renderChoiceBoard(req, res) {
  const storeName = String(req.query.storeName || '').trim();
  const workerName = String(req.query.workerName || '').trim();
  const dayKey = parseDayKey(req.query.dayKey);
  const targetRoomName = String(req.query.targetRoomName || '').trim();

  if (!storeName || !workerName || !dayKey|| !targetRoomName ) {
    return res.status(400).json({ ok: false, error: 'storeName/workerName/dayKey/targetRoomName 필요' });
  }

  try {
    taskLog(req, 'renderChoiceBoard', '시작', { storeName, targetRoomName, workerName, dayKey });
    const board = await getOrCreateBoard(storeName, workerName, dayKey);
    if (board.targetRoomName && board.targetRoomName !== targetRoomName) {
      return res.status(404).json({ ok: false, error: `요청 보드와 저장 보드 불일치: ${targetRoomName}` });
    }
    taskLog(req, 'renderChoiceBoard', '성공', { sessionCount: board.sessions.length, totalCount: board.totalCount });
    return res.json({ ok: true, boardText: formatBoardText(board) });
  } catch (error) {
    taskLog(req, 'renderChoiceBoard', '실패', { error: error.message });
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// =========================
// API 3) saveManualBoard
// =========================
async function saveManualBoard(req, res) {
  const payload = req.body || {};
  const storeName = String(payload.storeName || '').trim();
  const workerName = String(payload.workerName || '').trim();
  const targetRoomName = String(payload.targetRoomName || '').trim();
  const dayKey = parseDayKey(payload.dayKey);
  const boardLines = Array.isArray(payload.boardLines) ? payload.boardLines : null;

  if (!storeName || !workerName || !targetRoomName || !dayKey || !boardLines) {
    return res.status(400).json({ ok: false, error: 'storeName/workerName/targetRoomName/dayKey/boardLines 필요' });
  }

  try {
    taskLog(req, 'saveManualBoard', '시작', { targetRoomName, dayKey, lines: boardLines.length });
    const [rows] = await db.execute(
      `SELECT storeName, workerName, dayKey, targetRoomName, isE, totalCount, sessionsJson
       FROM AUTO_TALK
       WHERE storeName = ? AND workerName = ? AND dayKey = ?`,
      [storeName, workerName, dayKey]
    );

    let board = null;
    for (const row of rows) {
      const parsed = parseSessionsPayload(row.sessionsJson);
      board = {
        storeName: row.storeName,
        workerName: row.workerName,
        dayKey: row.dayKey,
        roomName: String(row.targetRoomName || '').trim(),
        totalCount: Number(row.totalCount || 0),
        sessions: parsed.sessions,
        isE: row.isE === 1
      };
      break;
    }

    if (!board) {
      return res.status(404).json({ ok: false, error: `연결된 보드 없음: targetRoomName=${targetRoomName}` });
    }

    const nextSessions = [];
    let totalCount = 0;

    for (const line of boardLines) {
      const text = String((line && line.text) || '').trim();
      const parsed = findRoomAndManager(text);
      if (!parsed) continue;

      totalCount += normalizeCountText(parsed.endCount);
      nextSessions.push({
        roomNo: parsed.roomNo,
        roomManagerName: parsed.roomManagerName,
        targetRoomName: targetRoomName,
        isJm: text.includes('ㅈㅁ'),
        rawMessage: '[manual]',
        startAt: '',
        endCount: parsed.endCount,
        status: 'END'
      });
    }

    board.roomName = targetRoomName;
    board.sessions = nextSessions;
    board.totalCount = totalCount;
    board.isE = payload.isE === true;

    await saveBoard(board);
    taskLog(req, 'saveManualBoard', '보드 저장 완료', { sessionCount: board.sessions.length, totalCount: board.totalCount });
    return res.json({ ok: true });
  } catch (error) {
    taskLog(req, 'saveManualBoard', '실패', { error: error.message });
    return res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = {
  saveChoiceEvent,
  renderChoiceBoard,
  saveManualBoard
};
