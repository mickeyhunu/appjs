const express = require('express');
const router = express.Router();
const infoLiveController = require('../controllers/infoLiveController');

router.get('/:storeNo/:roomNo', infoLiveController.getLive);
router.put('/:storeNo', infoLiveController.upsertLive);

module.exports = router;