const db = require('../config/db');

function isValidStoreNo(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

function isValidRoomNo(value) {
  return typeof value === 'string' && /^(\d{3}|V[123])$/.test(value);
}

function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 20;
}

exports.upsertLive = async (req, res) => {
  const { storeNo } = req.params;
  const { roomNo, salerName, waiterName } = req.body || {};

  if (!isValidStoreNo(storeNo)) {
    return res.status(400).json({ error: '유효한 storeNo가 필요합니다.' });
  }

  if (!isValidRoomNo(roomNo)) {
    return res.status(400).json({ error: 'roomNo는 3자리 숫자 또는 V1~V3 형식이어야 합니다.' });
  }

  if (!isValidName(salerName) || !isValidName(waiterName)) {
    return res.status(400).json({ error: 'salerName, waiterName은 1~20자의 문자열이어야 합니다.' });
  }

  try {
    await db.execute(
      `INSERT INTO INFO_LIVE (storeNo, roomNo, salerName, waiterName, createdAt)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         salerName = VALUES(salerName),
         waiterName = VALUES(waiterName),
         createdAt = CURRENT_TIMESTAMP`,
      [Number(storeNo), roomNo, salerName.trim(), waiterName.trim()]
    );

    return res.status(200).json({
      success: true,
      message: 'INFO_LIVE 데이터가 저장되었습니다.',
      data: {
        storeNo: Number(storeNo),
        roomNo,
        salerName: salerName.trim(),
        waiterName: waiterName.trim()
      }
    });
  } catch (error) {
    console.error('[ERROR] upsertLive:', error);
    return res.status(500).json({ error: 'INFO_LIVE 저장 중 오류가 발생했습니다.' });
  }
};