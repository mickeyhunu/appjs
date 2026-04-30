const db = require('../config/db');

const KOREAN_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
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

function formatTotalParts(total) {
  if (total === null || total === undefined) return '';
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}

function isEBoard(board) {
  return board.isE !== false;
}

function getEPrefix(board) {
  return isEBoard(board) ? 'E' : '';
}

function calcTotal(board) {
  const totalValue = calcTotalValue(board);
  if (totalValue !== null) {
    return `${getEPrefix(board)}${formatTotalParts(totalValue)}개`;
  }
  return `${getEPrefix(board)}${board.totalCount}개`;
}

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
  const parsed = JSON.parse(raw || '[]');
  if (Array.isArray(parsed)) {
    return { sessions: parsed, isE: true };
  }

  return {
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    isE: parsed.isE !== false
  };
}

function findRoomAndManager(text) {
  const m = String(text || '').match(/^(V\d+|\d{2,3})T\s+(.+?)\s+([\d.]+ㄲ)(?:\s+ㅈㅁ)?$/);
  if (!m) return null;
  return { roomNo: m[1], managerName: m[2], endCount: m[3] };
}

async function saveManualBoard(req, res) {
  const payload = req.body || {};
  const roomName = String(payload.roomName || '').trim();
  const dayKey = parseDayKey(payload.dayKey);
  const boardLines = Array.isArray(payload.boardLines) ? payload.boardLines : null;

  if (!roomName || !dayKey || !boardLines) {
    return res.status(400).json({ ok: false, error: 'roomName/dayKey/boardLines 필요' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT storeName, workerName, dayKey, roomName, totalCount, sessionsJson
       FROM AUTO_TALK
       WHERE dayKey = ?`,
      [dayKey]
    );

    let board = null;
    for (const row of rows) {
      const parsed = parseSessionsPayload(row.sessionsJson);
      if (parsed.sessions.some((s) => String(s.roomName || '').trim() === roomName)) {
        board = {
          storeName: row.storeName,
          workerName: row.workerName,
          dayKey: row.dayKey,
          roomNo: String(row.roomName || '').trim(),
          totalCount: Number(row.totalCount || 0),
          sessions: parsed.sessions,
          isE: parsed.isE
        };
        break;
      }
    }

    if (!board) {
      return res.status(404).json({ ok: false, error: `연결된 보드 없음: roomName=${roomName}` });
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
        managerName: parsed.managerName,
        roomName,
        isJm: text.includes('ㅈㅁ'),
        rawMessage: '[manual]',
        startAt: '',
        endCount: parsed.endCount,
        status: 'END'
      });
    }

    board.sessions = nextSessions;
    board.totalCount = totalCount;
    board.isE = payload.isE !== false;

    await saveBoard(board);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
async function getOrCreateBoard(storeName, workerName, dayKey) {
  const [rows] = await db.execute(
    `SELECT storeName, workerName, dayKey, roomName, totalCount, sessionsJson
     FROM AUTO_TALK
     WHERE storeName = ? AND workerName = ? AND dayKey = ?`,
    [storeName, workerName, dayKey]
  );

  if (rows.length > 0) {
    const row = rows[0];
    return {
      storeName: row.storeName,
      workerName: row.workerName,
      dayKey: row.dayKey,
      roomNo: String(row.roomName || '').trim(),
      totalCount: Number(row.totalCount || 0),
      ...parseSessionsPayload(row.sessionsJson)
    };
  }

  const newBoard = { storeName, workerName, dayKey, roomNo: '', totalCount: 0, sessions: [], isE: true };
  await saveBoard(newBoard);
  return newBoard;
}

async function saveBoard(board) {
  await db.execute(
    `INSERT INTO AUTO_TALK (storeName, workerName, dayKey, roomName, totalCount, sessionsJson)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      roomName = VALUES(roomName),
      totalCount = VALUES(totalCount),
      sessionsJson = VALUES(sessionsJson)`,
    [board.storeName, board.workerName, board.dayKey, board.roomNo || '', board.totalCount, JSON.stringify({ sessions: board.sessions, isE: board.isE !== false })]
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
    return `\n🚪 방번호 ➜ ${latestOpen.roomNo}T ${latestOpen.managerName}\n⏰ 스타트 ➜ ${latestOpen.startAt}\n`;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const startTime = calculateTime(hours, minutes, 0);
  const halfTeaTime = calculateTime(hours, minutes, 32);
  const fullTeaTime = calculateTime(hours, minutes, 52);
  const finishTime = calculateTime(hours, minutes, 81);

  return `\n🚪 방번호 ➜ ${latestOpen.roomNo}T ${latestOpen.managerName}\n⏰ 스타트 ➜ ${formatTime(startTime)}\n⏰ 반 티 ➜ ${formatMinute(halfTeaTime)}분\n⏰ 완 티 ➜ ${formatMinute(fullTeaTime)}분\n🏁 만 시 ➜ ${formatMinute(finishTime)}분\n`;
}

function formatBoardText(board) {
  const rows = board.sessions.map((session, i) => {
    const no = `${i + 1}️⃣`;
    if (session.status === 'START') {
      return `${no} ${session.roomNo}T ${session.managerName} ${session.startAt}`;
    }
    const jmSuffix = session.isJm === true ? ' ㅈㅁ' : '';
    return `${no} ${session.roomNo}T ${session.managerName} ${session.endCount}${jmSuffix}`;
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

async function saveChoiceEvent(req, res) {
  const payload = req.body || {};
  const managerName = String(payload.roomManagerName || payload.managerName || '').trim();
  const roomName = String(payload.roomName || '').trim();

  const eventType = String(payload.eventType || payload.status || '').trim().toUpperCase();

  const required = ['storeName', 'workerName', 'roomNo', 'dayKey'];
  const missing = required.filter((field) => !String(payload[field] || '').trim());
  if (!managerName) missing.push('roomManagerName');

  if (missing.length) {
    return res.status(400).json({ ok: false, error: `필수값 누락: ${missing.join(', ')}` });
  }

  const dayKey = parseDayKey(payload.dayKey);
  if (!dayKey) {
    return res.status(400).json({ ok: false, error: 'dayKey 형식 오류(YYYY-MM-DD)' });
  }

  try {
    const board = await getOrCreateBoard(payload.storeName, payload.workerName, dayKey);
    board.roomNo = String(payload.roomNo || board.roomNo || '').trim();

    const now = new Date();
    const startAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (eventType === 'START') {
      board.sessions.push({
        roomNo: payload.roomNo,
        managerName,
        roomName,
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
        lastOpen.managerName = managerName;
        lastOpen.roomName = roomName;
        lastOpen.isJm = payload.isJm === true;
        lastOpen.rawMessage = String(payload.rawMessage || '');
        lastOpen.endCount = payload.endCount || '';
        lastOpen.status = 'END';
      } else {
        board.sessions.push({
          roomNo: payload.roomNo,
          managerName,
          roomName,
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
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

async function renderChoiceBoard(req, res) {
  const storeName = String(req.query.storeName || '').trim();
  const workerName = String(req.query.workerName || '').trim();
  const dayKey = parseDayKey(req.query.dayKey);

  if (!storeName || !workerName || !dayKey) {
    return res.status(400).json({ ok: false, error: 'storeName/workerName/dayKey 필요' });
  }

  try {
    const board = await getOrCreateBoard(storeName, workerName, dayKey);
    return res.json({ ok: true, boardText: formatBoardText(board) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = {
  saveChoiceEvent,
  renderChoiceBoard,
  saveManualBoard
};
