const express = require("express");
const { authenticateToken, isAdmin } = require("../middleware/authMiddleware");
const { addDoctor, getAnalytics } = require("../controllers/adminController");

const router = express.Router();

router.use(authenticateToken);
router.use(isAdmin);

/**
 * @swagger
 * /admin/doctors:
 *   post:
 *     summary: Add a new doctor (admin only)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               specialization:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *             required:
 *               - name
 *               - specialization
 *     responses:
 *       201:
 *         description: Doctor added successfully
 */
router.post("/doctors", addDoctor);

/**
 * @swagger
 * /admin/analytics:
 *   get:
 *     summary: Get admin analytics data
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics metrics and summaries
 */
router.get("/analytics", getAnalytics);

module.exports = router;
