const express = require("express");
const router = express.Router();
const { checkIn, checkOut } = require("../controllers/attendanceController");

router.post("/checkin", checkIn);
router.post("/checkout", checkOut);

module.exports = router;