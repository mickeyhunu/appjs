const express = require('express');
const router = express.Router();
const controller = require('../controllers/infoChoiceController');

router.get('/:storeNo', controller.getMessage);
router.put('/:storeNo', controller.updateMessage);

module.exports = router;




