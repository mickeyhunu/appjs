const express = require('express');
const router = express.Router();
const entryController = require('../controllers/entryController');

// ENTRY_ALL 관련
router.get('/today/all', entryController.getAllWorkersAllStores); // 조회
router.post('/today/:storeNo', entryController.addWorker);        // 추가
router.put('/today/mention', entryController.incrementMention);// 멘션추가

// ENTRY_BANNED_WORD 관련
router.get('/banned/:storeNo', entryController.getBannedWords); // 조회
router.post('/banned/:storeNo', entryController.addBannedWord); // 추가

// ====== 🔽 추가(삭제 API) 🔽 ======
router.post('/today/:storeNo/delete-word', entryController.deleteWordByStore); // 특정 가게에서 이름 삭제
router.post('/today/delete-word', entryController.deleteWordGlobal);           // 범용(바디로 storeNo+workerName)

module.exports = router;