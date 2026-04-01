const db = require('../config/db');

exports.updateMessage = async (req, res) => {
  const storeNo = req.params.storeNo; // 여기 수정
  const { choiceMsg } = req.body;

  if (!storeNo || !choiceMsg) {
    return res.status(400).json({ error: 'storeNo와 message는 필수입니다.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE INFO_CHOICE SET choiceMsg = ?, createdAt = CURRENT_TIMESTAMP WHERE storeNo = ?`,
      [choiceMsg, storeNo]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '해당 storeNo의 데이터가 존재하지 않습니다.' });
    }

    res.json({ success: true, message: '메시지가 업데이트되었습니다.' });
  } catch (error) {
    console.error('DB 업데이트 에러:', error);
    res.status(500).json({ error: 'DB 업데이트 중 오류가 발생했습니다.' });
  }
};
