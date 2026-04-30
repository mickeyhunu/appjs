const db = require('../config/db');

const STATUS_RUNNING = 'RUNNING';
const STATUS_STOPPED = 'STOPPED';

function toPositiveInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function isValidJobId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}


function normalizeDateTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return null;

  const parsed = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;

  return text;
}

exports.getDueJobs = async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      `SELECT jobId, storeNo, targetRoomName, intervalMinutes, nextSendAt
       FROM AUTO_SEND_TEAMTALK
       WHERE status = ?
         AND isRunning = 0
         AND nextSendAt <= NOW()
       ORDER BY nextSendAt ASC
       LIMIT 100
       FOR UPDATE`,
      [STATUS_RUNNING]
    );

    if (rows.length > 0) {
      const ids = rows.map((row) => row.jobId);
      const placeholders = ids.map(() => '?').join(', ');
      await conn.execute(
        `UPDATE AUTO_SEND_TEAMTALK
         SET isRunning = 1
         WHERE jobId IN (${placeholders})`,
        ids
      );
    }

    await conn.commit();
    res.json({ success: true, data: rows });
  } catch (error) {
    if (conn) await conn.rollback();
    console.error('[AUTO_SEND_TEAMTALK] due 조회 오류:', error);
    res.status(500).json({ success: false, error: 'due 목록 조회 중 오류가 발생했습니다.' });
  } finally {
    if (conn) conn.release();
  }
};

exports.turnOnAutoSend = async (req, res) => {
  const storeNo = toPositiveInt(req.body.storeNo);
  const targetRoomName = String(req.body.targetRoomName || '').trim();
  const intervalMinutes = toPositiveInt(req.body.intervalMinutes);
  const nextSendAt = normalizeDateTime(req.body.nextSendAt);

  if (!storeNo || !targetRoomName || !intervalMinutes || !nextSendAt) {
    return res.status(400).json({
      success: false,
      error: 'storeNo, targetRoomName, intervalMinutes, nextSendAt은 필수입니다. nextSendAt 형식은 YYYY-MM-DD HH:mm:ss 입니다.',
    });
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO AUTO_SEND_TEAMTALK
        (storeNo, targetRoomName, intervalMinutes, nextSendAt, lastSentAt, status, isRunning, lastError)
       VALUES (?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'), NULL, ?, 0, NULL)
       ON DUPLICATE KEY UPDATE
         storeNo = VALUES(storeNo),
         intervalMinutes = VALUES(intervalMinutes),
         nextSendAt = VALUES(nextSendAt),
         status = ?,
         isRunning = 0,
         lastError = NULL`,
      [storeNo, targetRoomName, intervalMinutes, nextSendAt, STATUS_RUNNING, STATUS_RUNNING]
    );

    res.json({ success: true, data: { affectedRows: result.affectedRows } });
  } catch (error) {
    console.error('[AUTO_SEND_TEAMTALK] ON 오류:', error);
    res.status(500).json({ success: false, error: '자동전송 ON 저장 중 오류가 발생했습니다.' });
  }
};

exports.turnOffAutoSend = async (req, res) => {
  const targetRoomName = String(req.body.targetRoomName || '').trim();

  if (!targetRoomName) {
    return res.status(400).json({ success: false, error: 'targetRoomName은 필수입니다.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE AUTO_SEND_TEAMTALK
       SET status = ?, isRunning = 0
       WHERE targetRoomName = ?`,
      [STATUS_STOPPED, targetRoomName]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: '해당 방의 자동전송 설정이 없습니다.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[AUTO_SEND_TEAMTALK] OFF 오류:', error);
    res.status(500).json({ success: false, error: '자동전송 OFF 처리 중 오류가 발생했습니다.' });
  }
};

exports.markJobDone = async (req, res) => {
  const jobId = req.body.jobId;
  const nextSendAt = normalizeDateTime(req.body.nextSendAt);

  if (!isValidJobId(jobId) || !nextSendAt) {
    return res.status(400).json({ success: false, error: '유효한 jobId와 nextSendAt(YYYY-MM-DD HH:mm:ss)이 필요합니다.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE AUTO_SEND_TEAMTALK
       SET isRunning = 0,
           lastSentAt = NOW(),
           nextSendAt = STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'),
           lastError = NULL
       WHERE jobId = ?`,
      [nextSendAt, jobId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: '해당 jobId가 존재하지 않습니다.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[AUTO_SEND_TEAMTALK] done 오류:', error);
    res.status(500).json({ success: false, error: 'done 처리 중 오류가 발생했습니다.' });
  }
};

exports.markJobError = async (req, res) => {
  const jobId = req.body.jobId;
  const errorMessage = String(req.body.errorMessage || '').trim();

  if (!isValidJobId(jobId)) {
    return res.status(400).json({ success: false, error: '유효한 jobId가 필요합니다.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE AUTO_SEND_TEAMTALK
       SET isRunning = 0,
           lastError = ?,
           nextSendAt = DATE_ADD(NOW(), INTERVAL intervalMinutes MINUTE)
       WHERE jobId = ?`,
      [errorMessage, jobId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: '해당 jobId가 존재하지 않습니다.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[AUTO_SEND_TEAMTALK] error 오류:', error);
    res.status(500).json({ success: false, error: 'error 처리 중 오류가 발생했습니다.' });
  }
};
