const express = require('express');
const router = express.Router();
const controller = require('../controllers/roomController');

router.get('/:storeNo', controller.getRoomInfo);
router.put('/:storeNo', controller.updateRoomInfo);

module.exports = router;