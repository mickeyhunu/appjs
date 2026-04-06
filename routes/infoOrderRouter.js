const express = require('express');
const router = express.Router();
const infoOrderController = require('../controllers/infoOrderController');

router.post('/', infoOrderController.createOrder);

module.exports = router;