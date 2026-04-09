const db = require('../config/db');

function isValidStoreNo(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

function isValidRoomNo(value) {
  return typeof value === 'string' && /^(\d{3}|V[123])$/.test(value.trim().toUpperCase());
}

function isValidSendMsg(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
}

function isValidWaiterName(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim().length <= 20;
}

function isValidStatus(value) {
  const allowed = ['READY', 'DONE', 'CANCEL'];
  return typeof value === 'string' && allowed.includes(value.trim().toUpperCase());
}

exports.createOrder = async (req, res) => {
  const { storeNo, roomNo, sendMsg, waiterName = '', status = 'READY' } = req.body || {};

  if (!isValidStoreNo(storeNo)) {
    return res.status(400).json({ error: '유효한 storeNo가 필요합니다.' });
  }

  if (!isValidRoomNo(roomNo)) {
    return res.status(400).json({ error: 'roomNo는 3자리 숫자 또는 V1~V3 형식이어야 합니다.' });
  }

  if (!isValidSendMsg(sendMsg)) {
    return res.status(400).json({ error: 'sendMsg는 1~200자의 문자열이어야 합니다.' });
  }

  if (!isValidWaiterName(waiterName)) {
    return res.status(400).json({ error: 'waiterName은 0~20자의 문자열이어야 합니다.' });
  }

  if (!isValidStatus(status)) {
    return res.status(400).json({ error: 'status는 READY, DONE, CANCEL 중 하나여야 합니다.' });
  }

  const normalizedRoomNo = roomNo.trim().toUpperCase();
  const normalizedSendMsg = sendMsg.trim();
  const normalizedWaiterName = String(waiterName || '').trim();
  const normalizedStatus = status.trim().toUpperCase();

  try {
    const [result] = await db.execute(
      `INSERT INTO INFO_ORDER (storeNo, roomNo, sendMsg, waiterName, status, createdAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [Number(storeNo), normalizedRoomNo, normalizedSendMsg, normalizedWaiterName, normalizedStatus]
    );

    return res.status(201).json({
      success: true,
      message: 'INFO_ORDER 데이터가 저장되었습니다.',
      data: {
        id: result.insertId,
        storeNo: Number(storeNo),
        roomNo: normalizedRoomNo,
        sendMsg: normalizedSendMsg,
        waiterName: normalizedWaiterName,
        status: normalizedStatus
      }
    });
  } catch (error) {
    console.error('[ERROR] createOrder:', error);
    return res.status(500).json({ error: 'INFO_ORDER 저장 중 오류가 발생했습니다.' });
  }
};