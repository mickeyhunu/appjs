const db = require('../config/db'); // DB 연결 모듈

// ===== 내부 공통 =====
const bannedWordsCache = new Map(); // storeNo => [bannedWord1, bannedWord2, ...]

async function loadBannedWords(storeNo) {
  try {
    const [rows] = await db.execute(
      'SELECT bannedWord FROM ENTRY_BANNED_WORD WHERE storeNo = ?',
      [storeNo]
    );
    const words = rows.map(row => row.bannedWord);
    bannedWordsCache.set(storeNo, words);
    return words;
  } catch (error) {
    console.error(`[ERROR] loadBannedWords (${storeNo}):`, error);
    return [];
  }
}

async function isBanned(storeNo, workerName) {
  let bannedWords = bannedWordsCache.get(storeNo);
  if (!bannedWords) bannedWords = await loadBannedWords(storeNo);

  // 공통 금칙어도 가져옴 (storeNo = 0)
  let globalWords = bannedWordsCache.get(0);
  if (!globalWords) globalWords = await loadBannedWords(0);

  const allBannedWords = [...bannedWords, ...globalWords];
  return allBannedWords.some(banned => workerName.includes(banned));
}

// ===== 컨트롤러 =====

// 모든 가게의 오늘 엔트리 조회
exports.getAllWorkersAllStores = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT storeNo, workerName, createdAt 
       FROM ENTRY_TODAY
       ORDER BY createdAt ASC`
    );

    const grouped = {};
    rows.forEach(row => {
      if (!grouped[row.storeNo]) grouped[row.storeNo] = [];
      grouped[row.storeNo].push(row.workerName);
    });

    res.json(grouped);
  } catch (error) {
    console.error('[ERROR] getAllWorkersAllStores:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};

// ENTRY_TODAY 추가 (insertCount만 증가)
exports.addWorker = async (req, res) => {
  const { storeNo } = req.params;
  const { workerName } = req.body;

  if (!storeNo || !workerName || typeof workerName !== 'string') {
    return res.status(400).json({ error: 'storeNo와 workerName이 필요합니다.' });
  }

  try {
    const isForbidden = await isBanned(Number(storeNo), workerName);
    if (isForbidden) {
      //console.log(`[INFO] 금칙어 감지 - 무시됨: ${storeNo}-${workerName}`);
      return res.status(200).json({ message: '금칙어가 포함된 이름이라 저장되지 않았습니다.' });
    }
    
    await db.execute(
      `INSERT INTO ENTRY_TODAY (storeNo, workerName)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         insertCount = insertCount + 1`,
      [storeNo, workerName]
    );

    res.status(201).json({ message: '작업자가 추가되었습니다.' });
  } catch (error) {
    console.error('[ERROR] addWorker:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};

// today/mention : mentionCount만 올리기
exports.incrementMention = async (req, res) => {
  let { storeNo, workerName } = req.body;

  if (storeNo === undefined || !workerName || typeof workerName !== 'string') {
    return res.status(400).json({ error: 'storeNo와 workerName이 필요합니다.' });
  }

  const numStoreNo = Number(storeNo);
  if (!Number.isInteger(numStoreNo)) {
    return res.status(400).json({ error: '유효한 storeNo가 필요합니다.' });
  }

  try {
    // 엔트리 레코드가 없을 수도 있으니 INSERT ... ON DUPLICATE로 처리
    const [result] = await db.execute(
      `
      INSERT INTO ENTRY_TODAY (storeNo, workerName, mentionCount)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        mentionCount = mentionCount + 1
      `,
      [numStoreNo, workerName]
    );

    //console.log(`[INFO] incrementMention: storeNo=${numStoreNo}, workerName=${workerName}, affected=${result?.affectedRows ?? 0}`);

    return res.status(200).json({
      message: 'mentionCount가 증가되었습니다.',
      storeNo: numStoreNo,
      workerName,
    });
  } catch (error) {
    console.error('[ERROR] incrementMention:', error);
    return res.status(500).json({ error: '서버 오류' });
  }
};

// ENTRY_BANNED_WORD 조회
exports.getBannedWords = async (req, res) => {
  const { storeNo } = req.params;
  if (storeNo === undefined) {
    return res.status(400).json({ error: 'storeNo가 필요합니다.' });
  }
  try {
    const [rows] = await db.execute(
      'SELECT storeNo, bannedWord FROM ENTRY_BANNED_WORD WHERE storeNo = ?',
      [storeNo]
    );
    res.json(rows);
  } catch (error) {
    console.error('[ERROR] getBannedWords:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};

// ENTRY_BANNED_WORD 추가
exports.addBannedWord = async (req, res) => {
  const { storeNo } = req.params;
  const { bannedWord } = req.body;

  if (storeNo === undefined || !bannedWord || typeof bannedWord !== 'string') {
    return res.status(400).json({ error: 'storeNo와 bannedWord가 필요합니다.' });
  }

  try {
    await db.execute(
      'REPLACE INTO ENTRY_BANNED_WORD (storeNo, bannedWord) VALUES (?, ?)',
      [storeNo, bannedWord]
    );
    // 새로 추가되면 기존 캐시 무효화
    bannedWordsCache.delete(Number(storeNo));

    res.status(201).json({ message: '금칙어가 추가되었습니다.' });
  } catch (error) {
    console.error('[ERROR] addBannedWord:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};

exports.deleteWordByStore = async (req, res) => {
  const { storeNo } = req.params;
  const { workerName } = req.body;

  const numStoreNo = Number(storeNo);
  if (!Number.isInteger(numStoreNo) || !workerName || typeof workerName !== 'string') {
    return res.status(400).json({ error: '유효한 storeNo와 workerName이 필요합니다.' });
  }

  try {
    const [result] = await db.execute(
      'DELETE FROM ENTRY_TODAY WHERE storeNo = ? AND workerName = ?',
      [numStoreNo, workerName]
    );
    const affected = result?.affectedRows ?? 0;
    //console.log(`[INFO] deleteWordByStore: storeNo=${numStoreNo}, workerName=${workerName}, deleted=${affected}`);
    res.json({ message: '삭제 처리 완료', deleted: affected });
  } catch (error) {
    console.error('[ERROR] deleteWordByStore:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};

exports.deleteWordGlobal = async (req, res) => {
  let { storeNo, workerName } = req.body;

  if (storeNo === undefined || !workerName || typeof workerName !== 'string') {
    return res.status(400).json({ error: 'storeNo와 workerName이 필요합니다.' });
  }

  const numStoreNo = Number(storeNo);
  if (!Number.isInteger(numStoreNo)) {
    return res.status(400).json({ error: '유효한 storeNo가 필요합니다.' });
  }

  try {
    let sql, params;
    if (numStoreNo === 0) {
      // 전 가게에서 삭제
      sql = 'DELETE FROM ENTRY_TODAY WHERE workerName = ?';
      params = [workerName];
    } else {
      sql = 'DELETE FROM ENTRY_TODAY WHERE storeNo = ? AND workerName = ?';
      params = [numStoreNo, workerName];
    }

    const [result] = await db.execute(sql, params);
    const affected = result?.affectedRows ?? 0;
    //console.log(`[INFO] deleteWordGlobal: storeNo=${numStoreNo}, workerName=${workerName}, deleted=${affected}`);
    res.json({ message: '삭제 처리 완료', deleted: affected, scope: numStoreNo === 0 ? 'ALL' : String(numStoreNo) });
  } catch (error) {
    console.error('[ERROR] deleteWordGlobal:', error);
    res.status(500).json({ error: '서버 오류' });
  }
};
