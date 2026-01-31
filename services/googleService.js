const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

// OAuth2 client for calendar access using a single Gmail account
function getOAuth2Client() {
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 
                      `${process.env.BACKEND_URL || 'http://localhost:5000'}/auth/google-calendar/callback`;
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // Set the refresh token (obtained from one-time OAuth flow)
  if (process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    });
  }

  return oauth2Client;
}

async function createMeetEvent(appointment) {
  // Ensure time format is HH:MM:SS (add seconds if missing)
  const formatTime = (timeStr) => {
    if (!timeStr) throw new Error('Time is required');
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return `${timeStr}:00`; // Add seconds if only HH:MM
    }
    return timeStr;
  };

  // Ensure date format is YYYY-MM-DD
  const formatDate = (dateStr) => {
    if (!dateStr) throw new Error('Date is required');
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: ${dateStr}`);
    }
    return dateStr;
  };

  // Validate email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!appointment.patient_email || !emailRegex.test(appointment.patient_email)) {
    throw new Error('Valid patient email is required');
  }
  if (!appointment.doctor_email || !emailRegex.test(appointment.doctor_email)) {
    throw new Error('Valid doctor email is required');
  }

  const startDateTime = `${formatDate(appointment.appointment_date)}T${formatTime(appointment.start_time)}`;
  const endDateTime = `${formatDate(appointment.appointment_date)}T${formatTime(appointment.end_time)}`;

  // Validate that end time is after start time (compare as strings first, then as dates)
  const startTimeStr = appointment.start_time.replace(':', '');
  const endTimeStr = appointment.end_time.replace(':', '');
  if (endTimeStr <= startTimeStr) {
    throw new Error('End time must be after start time');
  }

  const event = {
    summary: `Appointment with Dr. ${appointment.doctor_name}`,
    description: appointment.notes || '',
    start: {
      dateTime: startDateTime,
      timeZone: 'Africa/Addis_Ababa',  // Adjust for Ethiopia
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Africa/Addis_Ababa',
    },
    attendees: [
      { email: appointment.patient_email },
      { email: appointment.doctor_email },
    ],
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Log the event being sent for debugging
  console.log('Creating Google Calendar event with:', {
    startDateTime,
    endDateTime,
    timeZone: 'Africa/Addis_Ababa',
    attendees: event.attendees.map(a => a.email),
  });

  try {
    const oauth2Client = getOAuth2Client();
    
    // Check if we have a refresh token
    if (!process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
      throw new Error('Google Calendar refresh token not configured. Please run the OAuth setup first.');
    }

    // Refresh the access token if needed
    await oauth2Client.refreshAccessToken();

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.insert({
      calendarId: 'primary',  // Uses the authenticated Gmail account's calendar
      resource: event,
      conferenceDataVersion: 1,
    });

    if (!response.data.hangoutLink) {
      throw new Error('Google Meet link not generated in response');
    }

    return response.data.hangoutLink;  // Meet link
  } catch (error) {
    // Provide more detailed error information
    const errorDetails = {
      message: error.message,
      code: error.code,
      response: error.response?.data || null,
      status: error.response?.status,
      statusText: error.response?.statusText,
    };
    console.error('Google Calendar API Error:', JSON.stringify(errorDetails, null, 2));
    
    // Extract more specific error message from Google's response
    const googleError = error.response?.data?.error;
    let errorMessage = error.message;
    if (googleError) {
      errorMessage = `${error.message}. Google API Error: ${googleError.message || JSON.stringify(googleError)}`;
      if (googleError.errors && googleError.errors.length > 0) {
        errorMessage += `. Errors: ${googleError.errors.map(e => e.message).join(', ')}`;
      }
    }
    
    const detailedError = new Error(errorMessage);
    detailedError.code = error.code;
    detailedError.response = error.response?.data;
    throw detailedError;
  }
}

// Function to get OAuth2 authorization URL (for one-time setup)
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/calendar'];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force consent to get refresh token
  });
}

// Function to get tokens from authorization code (for one-time setup)
async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

module.exports = { 
  createMeetEvent, 
  getAuthUrl, 
  getTokensFromCode,
  getOAuth2Client 
};