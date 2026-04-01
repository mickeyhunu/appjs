const express = require('express');
const router = express.Router();
const controller = require('../controllers/infoChojoongController');

router.put('/:storeNo', controller.updateMessage);

module.exports = router;




