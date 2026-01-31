const express = require("express");
const {
  authenticateToken,
  isPatient,
} = require("../middleware/authMiddleware");
const {
  getSpecializations,
  getDoctorsBySpecialization,
  getFreeSlots,
  bookAppointment,
} = require("../controllers/appointmentController");

const router = express.Router();

/**
 * @swagger
 * /appointments/specializations:
 *   get:
 *     summary: Get list of medical specializations
 *     tags:
 *       - Appointments
 *     responses:
 *       200:
 *         description: An array of specialization objects
 */
router.get("/specializations", getSpecializations); // Public

router.use(authenticateToken);
router.use(isPatient);

/**
 * @swagger
 * /appointments/doctors/{specialization_id}:
 *   get:
 *     summary: Get doctors by specialization
 *     tags:
 *       - Appointments
 *     parameters:
 *       - in: path
 *         name: specialization_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the specialization
 *     responses:
 *       200:
 *         description: List of doctors for the given specialization
 */
router.get("/doctors/:specialization_id", getDoctorsBySpecialization);

/**
 * @swagger
 * /appointments/slots/{doctor_id}:
 *   get:
 *     summary: Get available slots for a doctor
 *     tags:
 *       - Appointments
 *     parameters:
 *       - in: path
 *         name: doctor_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the doctor
 *     responses:
 *       200:
 *         description: Available time slots for the doctor
 */
router.get("/slots/:doctor_id", getFreeSlots);

/**
 * @swagger
 * /appointments/book:
 *   post:
 *     summary: Book an appointment
 *     tags:
 *       - Appointments
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               doctor_id:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               slot:
 *                 type: string
 *             required:
 *               - doctor_id
 *               - date
 *               - slot
 *     responses:
 *       201:
 *         description: Appointment successfully booked
 *       400:
 *         description: Validation error / bad request
 */
router.post("/book", bookAppointment);

module.exports = router;
