const db = require('../config/db');

async function addDoctor(req, res) {
  const { name, email, specialization_id, license_number, phone, bio } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO doctors (name, email, specialization_id, license_number, phone, bio) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, specialization_id, license_number, phone, bio]
    );
    res.json(result.rows[0]);
    // console.log(result)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAnalytics(req, res) {
  try {
    const lastWeekAppointments = await db.query(
      "SELECT COUNT(*) FROM appointments WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'"
    );
    const numPatients = await db.query("SELECT COUNT(*) FROM users WHERE role = 'patient'");
    const numDoctors = await db.query('SELECT COUNT(*) FROM doctors');

    res.json({
      lastWeekAppointments: lastWeekAppointments.rows[0].count,
      numPatients: numPatients.rows[0].count,
      numDoctors: numDoctors.rows[0].count,
      // Add more queries as needed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { addDoctor, getAnalytics };