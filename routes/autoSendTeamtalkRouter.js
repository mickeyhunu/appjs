const express = require('express');
const controller = require('../controllers/autoSendTeamtalkController');

const router = express.Router();

router.get('/due', controller.getDueJobs);
router.post('/on', controller.turnOnAutoSend);
router.post('/off', controller.turnOffAutoSend);
router.post('/done', controller.markJobDone);
router.post('/error', controller.markJobError);

module.exports = router;
