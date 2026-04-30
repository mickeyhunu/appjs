const db = require('../config/db');

const KOREAN_WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
function normalizeCountText(value) {
  const text = String(value || '').trim();
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function parseDayKey(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))) {
    return null;
  }
  return dayKey;
}

async function getOrCreateBoard(storeName, workerName, dayKey) {
  const [rows] = await db.execute(
    `SELECT storeName, workerName, dayKey, totalCount, sessionsJson
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
      totalCount: Number(row.totalCount || 0),
      sessions: JSON.parse(row.sessionsJson || '[]')
    };
  }

  const newBoard = { storeName, workerName, dayKey, totalCount: 0, sessions: [] };
  await saveBoard(newBoard);
  return newBoard;
}

async function saveBoard(board) {
  await db.execute(
    `INSERT INTO AUTO_TALK (storeName, workerName, dayKey, totalCount, sessionsJson)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      totalCount = VALUES(totalCount),
      sessionsJson = VALUES(sessionsJson)`,
    [board.storeName, board.workerName, board.dayKey, board.totalCount, JSON.stringify(board.sessions)]
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
    return `${no} ${session.roomNo}T ${session.managerName} ${session.endCount}`;
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
    `총 갯수 ㅡ E${board.totalCount}개`,
    `총 금액 ㅡ ${Math.round(board.totalCount * 9.9)}만원`
  ].join('\n');
}

async function saveChoiceEvent(req, res) {
  const payload = req.body || {};
  const managerName = String(payload.roomManagerName || payload.managerName || '').trim();
  const roomName = String(payload.roomName || '').trim();

  const required = ['storeName', 'workerName', 'roomNo', 'eventType', 'dayKey'];
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

    const now = new Date();
    const startAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (payload.eventType === 'START') {
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
    } else if (payload.eventType === 'END') {
      const countValue = normalizeCountText(payload.endCount);
      board.totalCount += countValue;

      const lastOpen = [...board.sessions].reverse().find((s) => s.status === 'START' && s.roomNo === payload.roomNo);
      if (lastOpen) {
        lastOpen.status = 'END';
        lastOpen.endCount = payload.endCount || '';
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
      return res.status(400).json({ ok: false, error: `지원하지 않는 eventType: ${payload.eventType}` });
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
  renderChoiceBoard
};
