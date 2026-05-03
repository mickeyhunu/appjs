const express = require('express');
const router = express.Router();
const { savePhoneNumber } = require('../controllers/numberController');

router.post('/numberGet', savePhoneNumber);

module.exports = router;
