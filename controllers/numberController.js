const db = require('../config/db');

exports.savePhoneNumber = async (req, res) => {
  const { room, authorName, phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: 'phone is required' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM INFO_CONTACTS WHERE phone = ? LIMIT 1',
      [phone],
    );

    if (existing.length > 0) {
      return res.status(200).json({
        message: '이미 등록된 연락처입니다.',
        duplicated: true,
      });
    }

    await db.query(
      `INSERT INTO INFO_CONTACTS (roomName, authorName, phone)
       VALUES (?, ?, ?)`,
      [room || null, authorName || null, phone],
    );

    return res.status(201).json({
      message: '연락처가 저장되었습니다.',
      duplicated: false,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `DB error: ${error.message}` });
  }
};
