const express = require('express');
const controller = require('../controllers/autoTalkController');

const router = express.Router();

router.post('/event', controller.saveChoiceEvent);
router.get('/render', controller.renderChoiceBoard);

module.exports = router;