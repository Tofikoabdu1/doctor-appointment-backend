const db = require('../config/db');

async function getDashboard(req, res) {
  const patientId = req.user.id;
  try {
    const upcoming = await db.query(
      `SELECT a.*, d.name as doctor_name 
       FROM appointments a 
       JOIN doctors d ON a.doctor_id = d.id 
       WHERE patient_id = $1 AND appointment_date >= CURRENT_DATE AND status IN ('booked', 'confirmed')`,
      [patientId]
    );
    const history = await db.query(
      `SELECT a.*, d.name as doctor_name 
       FROM appointments a 
       JOIN doctors d ON a.doctor_id = d.id 
       WHERE patient_id = $1 AND (appointment_date < CURRENT_DATE OR status IN ('completed', 'cancelled'))`,
      [patientId]
    );
    res.json({ upcoming: upcoming.rows, history: history.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}



module.exports = { getDashboard };