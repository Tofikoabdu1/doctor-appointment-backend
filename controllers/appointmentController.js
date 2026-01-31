const db = require("../config/db");
const { createMeetEvent } = require("../services/googleService");
const { sendAppointmentEmail } = require("../services/emailService");
const uuid = require("uuid");

async function getSpecializations(req, res) {
  try {
    const result = await db.query("SELECT * FROM specializations");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getDoctorsBySpecialization(req, res) {
  const { specialization_id } = req.params;
  try {
    const result = await db.query(
      "SELECT * FROM doctors WHERE specialization_id = $1 AND is_active = true",
      [specialization_id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getFreeSlots(req, res) {
  const { doctor_id } = req.params;
  const next7Days = []; // Generate dates for next 7 days
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    next7Days.push(date.toISOString().split("T")[0]); // YYYY-MM-DD
  }

  try {
    const slots = [];
    for (const date of next7Days) {
      const dayOfWeek = new Date(date).getDay(); // 0=Sun, 6=Sat
      const schedule = await db.query(
        "SELECT * FROM doctor_schedules WHERE doctor_id = $1 AND day_of_week = $2",
        [doctor_id, dayOfWeek],
      );
      if (schedule.rows.length === 0) continue;

      const { start_time, end_time, slot_duration, break_start, break_end } =
        schedule.rows[0];
      const dailySlots = generateSlots(
        start_time,
        end_time,
        slot_duration,
        break_start,
        break_end,
      );

      // Exclude booked
      const booked = await db.query(
        "SELECT start_time, end_time FROM appointments WHERE doctor_id = $1 AND appointment_date = $2 AND status NOT IN ($3, $4)",
        [doctor_id, date, "cancelled", "completed"],
      );
      const free = dailySlots.filter(
        (slot) => !isOverlapping(slot, booked.rows),
      );
      if (free.length > 0) slots.push({ date, free });
    }

    if (slots.length === 0)
      return res.json({
        message: "No free slots in next 7 days. Please check later.",
      });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function generateSlots(start, end, duration, breakStart, breakEnd) {
  const slots = [];
  let current = parseTime(start);
  const endTime = parseTime(end);
  const breakS = breakStart ? parseTime(breakStart) : null;
  const breakE = breakEnd ? parseTime(breakEnd) : null;

  while (current < endTime) {
    const slotEnd = new Date(current.getTime() + duration * 60000);
    if (!breakS || !(current >= breakS && slotEnd <= breakE)) {
      slots.push({
        start_time: formatTime(current),
        end_time: formatTime(slotEnd),
      });
    }
    current = slotEnd;
  }
  return slots;
}

function parseTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTime(date) {
  return date.toTimeString().split(" ")[0].slice(0, 5); // HH:MM
}

function isOverlapping(slot, booked) {
  return booked.some((b) => {
    const bStart = parseTime(b.start_time);
    const bEnd = parseTime(b.end_time);
    const sStart = parseTime(slot.start_time);
    const sEnd = parseTime(slot.end_time);
    return sStart < bEnd && sEnd > bStart;
  });
}

async function bookAppointment(req, res) {
  const patientId = req.user.id;
  const {
    doctor_id,
    specialization_id,
    appointment_date,
    start_time,
    end_time,
    type,
    notes,
  } = req.body;

  try {
    // Check if slot free (reuse logic or query)
    const conflicting = await db.query(
      "SELECT * FROM appointments WHERE doctor_id = $1 AND appointment_date = $2 AND ((start_time < $4 AND end_time > $3) OR (start_time < $3 AND end_time > $3)) AND status NOT IN ($5, $6)",
      [
        doctor_id,
        appointment_date,
        start_time,
        end_time,
        "cancelled",
        "completed",
      ],
    );
    if (conflicting.rows.length > 0)
      return res.status(400).json({ error: "Slot already booked" });

    // Get patient and doctor details
    const patient = await db.query(
      "SELECT email, name FROM users WHERE id = $1",
      [patientId],
    );
    const doctor = await db.query(
      "SELECT email, name FROM doctors WHERE id = $1",
      [doctor_id],
    );
    if (!patient.rows[0] || !doctor.rows[0])
      return res.status(404).json({ error: "User/Doctor not found" });

    let meetLink = null;

    if (type === "online") {
      try {
        const appointment = {
          doctor_name: doctor.rows[0].name,
          patient_email: patient.rows[0].email,
          doctor_email: doctor.rows[0].email,
          appointment_date,
          start_time,
          end_time,
          notes,
        };

        console.log(
          "Attempting to create Google Meet event with data:",
          appointment,
        );

        meetLink = await createMeetEvent(appointment);

        console.log("Google Meet link generated:", meetLink);
      } catch (googleErr) {
        console.error("Google Meet creation FAILED:", {
          message: googleErr.message,
          stack: googleErr.stack,
          code: googleErr.code,
          details: googleErr.details || googleErr.response?.data?.error,
          fullError: googleErr,
        });

        // Return detailed error for debugging
        return res.status(502).json({
          error: "Failed to generate online meeting link",
          detail: googleErr.message || "Google Calendar/Meet API error",
          suggestion: "Check .env credentials and Google Cloud setup",
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  code: googleErr.code,
                  response: googleErr.response?.data,
                }
              : undefined,
        });
      }
    }

    const address = type === "in-person" ? process.env.HOSPITAL_ADDRESS : null;

    const result = await db.query(
      "INSERT INTO appointments (patient_id, doctor_id, specialization_id, appointment_date, start_time, end_time, type, meet_link, patient_notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [
        patientId,
        doctor_id,
        specialization_id,
        appointment_date,
        start_time,
        end_time,
        type,
        meetLink,
        notes,
        "booked",
      ],
    );

    // Send emails
    const subject = "Appointment Booked";

    // Create email content
    let emailText = `Dear Participant,\n\n`;
    emailText += `Your appointment has been successfully scheduled.\n\n`;
    emailText += `Date: ${appointment_date}\n`;
    emailText += `Time: ${start_time} - ${end_time}\n`;
    if (type === "online") {
      emailText += `Meeting Link: ${meetLink}\n`;
      emailText += `\nPlease join the meeting using the link above at the scheduled time.`;
    } else {
      emailText += `Location: ${address}\n`;
    }
    if (notes) {
      emailText += `\nAdditional Notes: ${notes}\n`;
    }
    emailText += `\nWe look forward to your participation.\n\nBest regards,\nHospital Appointment System`;

    // Create HTML email
    let emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #2c3e50; text-align: center;">Appointment Confirmation</h2>
        <p>Dear Participant,</p>
        <p>Your appointment has been successfully scheduled. Please find the details below:</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Date:</strong> ${appointment_date}</p>
          <p><strong>Time:</strong> ${start_time} - ${end_time}</p>
          ${
            type === "online"
              ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}" style="color: #3498db; text-decoration: none;">${meetLink}</a></p>
                <p style="margin-top: 15px; text-align: center;">
                  <a href="${meetLink}" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Meeting</a>
                </p>`
              : `<p><strong>Location:</strong> ${address}</p>`
          }
          ${notes ? `<p><strong>Additional Notes:</strong> ${notes}</p>` : ""}
        </div>

        ${
          type === "online"
            ? "<p>Please join the meeting using the link above at the scheduled time.</p>"
            : "<p>Please arrive at the location at the scheduled time.</p>"
        }

        <p style="margin-top: 20px;">We look forward to your participation.<br>Best regards,<br>Hospital Appointment System</p>
      </div>
    `;

    await sendAppointmentEmail(
      patient.rows[0].email,
      subject,
      emailText,
      emailHtml,
    );
    await sendAppointmentEmail(
      doctor.rows[0].email,
      subject,
      emailText,
      emailHtml,
    );
    // if (type === "online") {
    let emailText_2 = `
                  Dear Organizer,

                  You are requested to approve the upcoming appointment by joining the Google Meet session and enabling access for both the Doctor and the Patient.

                  Appointment Details:
                  - Date: ${appointment_date}
                  - Time: ${start_time} - ${end_time}
                    ${type === "online" ? `- Meeting Link: ${meetLink}` : `- Address: ${address}`}
                    ${notes ? `- Notes: ${notes}` : ""}

                    Please ensure the meeting is opened so the participants can join without delay.

                    Thank you,
                    Hospital Appointment System
`;

    let emailHtml_2 = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                      <h2 style="color: #2c3e50; text-align: center;">Appointment Approval Required</h2>
                      <p>Dear Organizer,</p>
                      <p>You are requested to approve the upcoming appointment by joining the Google Meet session and making it accessible for both the Doctor and the Patient.</p>
                      
                      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Date:</strong> ${appointment_date}</p>
                        <p><strong>Time:</strong> ${start_time} - ${end_time}</p>
                        ${
                          type === "online"
                            ? `<p><strong>Meeting Link:</strong> <a href="${meetLink}" style="color: #3498db; text-decoration: none;">${meetLink}</a></p>
                              <p style="margin-top: 15px; text-align: center;">
                                <a href="${meetLink}" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Meeting</a>
                              </p>`
                            : `<p><strong>Address:</strong> ${address}</p>`
                        }
                        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
                      </div>

                      ${
                        type === "online"
                          ? "<p><em>Please join the meeting using the link above and ensure it is opened for the Doctor and the Patient.</em></p>"
                          : ""
                      }

                      <p style="margin-top: 20px;">Thank you,<br>Hospital Appointment System</p>
                    </div>
                    `;
    if (type === "online") {
      await sendAppointmentEmail(
        process.env.EMAIL_USER,
        subject,
        emailText_2,
        emailHtml_2,
      );
    }

    // }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getSpecializations,
  getDoctorsBySpecialization,
  getFreeSlots,
  bookAppointment,
};
