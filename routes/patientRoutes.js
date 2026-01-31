const express = require("express");
const {
  authenticateToken,
  isPatient,
} = require("../middleware/authMiddleware");
const { getDashboard } = require("../controllers/patientController");

const router = express.Router();

router.use(authenticateToken);
router.use(isPatient);

/**
 * @swagger
 * /patient/dashboard:
 *   get:
 *     summary: Get patient dashboard data
 *     tags:
 *       - Patient
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard information for the authenticated patient
 */
router.get("/dashboard", getDashboard);

module.exports = router;
