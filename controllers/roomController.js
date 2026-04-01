const db = require('../config/db');

// ✅ GET /room/:storeNo
exports.getRoomInfo = async (req, res) => {
  const storeNo = req.params.storeNo;

  try {
    const [rows] = await db.query(`
      SELECT 
    R.roomInfo, 
    R.waitInfo,
    R.roomDetail,
    S.storeName, 
    S.storeAddress,
    DATE_FORMAT(R.updatedAt, '%Y-%m-%d %H:%i') AS updatedAt
    FROM INFO_ROOM R
    JOIN INFO_STORE S ON R.storeNo = S.storeNo
    WHERE R.storeNo = ?
    `, [storeNo]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Store not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
};

// ✅ PUT /room/:storeNo
exports.updateRoomInfo = async (req, res) => {
  const storeNo = req.params.storeNo;
  const { roomInfo, waitInfo, roomDetail } = req.body;

  // 동적으로 SET 쿼리 생성
  const fields = [];
  const values = [];

  if (roomInfo !== undefined) {
    fields.push('roomInfo = ?');
    values.push(roomInfo);
  }

  if (waitInfo !== undefined) {
    fields.push('waitInfo = ?');
    values.push(waitInfo);
  }
  
  if (roomDetail !== undefined) {
    fields.push('roomDetail = ?');
    values.push(JSON.stringify(roomDetail));
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No data provided' });
  }

  try {
    const query = `UPDATE INFO_ROOM SET ${fields.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE storeNo = ?`;
    values.push(storeNo);

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Store not found' });
    }

    res.json({ message: 'Updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
};