const express = require('express');
const controller = require('../controllers/autoSendStartTalkController');

const router = express.Router();

router.post('/event', controller.saveChoiceEvent);
router.get('/render', controller.renderChoiceBoard);
router.post('/manual-board', controller.saveManualBoard);

module.exports = router;