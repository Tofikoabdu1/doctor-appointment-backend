# Doctor Appointment Backend

This repository contains the backend for a doctor appointment system (PERN-style). The API provides authentication (email/password + Google OAuth), patient dashboard, appointment booking (with optional Google Meet creation), admin-only endpoints, and email notifications.

---

## Contents

- **Installation & prerequisites**
- **Environment variables**
- **Database setup (example SQL)**
- **Run (development & production)**
- **API endpoints** (full list with examples)
- **Google Calendar / Meet setup**
- **Swagger UI**

---

## Prerequisites

- Node.js 16+ (recommend Node 18+)
- npm or yarn
- PostgreSQL
- Google Cloud Console account (for OAuth / Calendar API) — optional for online meetings
- SMTP credentials (for sending emails)

## Install

1. Clone repository

```bash
git clone https://github.com/Tofikoabdu1/doctor-appointment-backend.git
cd doctor-appointment-backend
```

2. Install dependencies

```bash
npm install
```

3. Create a `.env` file in the project root (see next section).

## Environment variables

Create a `.env` file with at least the following variables. Adjust values as required.

- `PORT` - server port (default 5000)
- `FRONTEND_URL` - URL of your frontend (used for redirects after OAuth)
- `BACKEND_URL` - backend base URL (optional, used to build callbacks)
- `DB_HOST` - Postgres host
- `DB_PORT` - Postgres port (5432)
- `DB_USER` - Postgres user
- `DB_PASSWORD` - Postgres password
- `DB_NAME` - Postgres database name
- `JWT_SECRET` - secret used to sign JWTs
- `EMAIL_HOST` - SMTP host
- `EMAIL_PORT` - SMTP port
- `EMAIL_USER` - SMTP username (also used as "from" address)
- `EMAIL_PASS` - SMTP password
- `GOOGLE_CLIENT_ID` - Google OAuth client id (for login)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_CALLBACK_URL` - Google OAuth callback (optional)
- `GOOGLE_CALENDAR_CLIENT_ID` - (optional) client id for Calendar OAuth (can reuse `GOOGLE_CLIENT_ID`)
- `GOOGLE_CALENDAR_CLIENT_SECRET` - (optional) secret for Calendar OAuth
- `GOOGLE_CALENDAR_REDIRECT_URI` - callback used when authorizing calendar access
- `GOOGLE_CALENDAR_REFRESH_TOKEN` - refresh token for calendar API (obtained via one-time OAuth flow)
- `HOSPITAL_ADDRESS` - address string for in-person appointments

Note: if you don't enable Google Calendar integration, online meeting creation will fail. You can still use the system for in-person appointments.

## Database (example SQL)

Below are minimal example table definitions inferred from the code. Adjust types and constraints as needed for your production environment.

```sql
-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_id TEXT,
  role TEXT NOT NULL DEFAULT 'patient' -- 'patient' or 'admin'
);

-- Specializations
CREATE TABLE specializations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- Doctors
CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  specialization_id INTEGER REFERENCES specializations(id),
  is_active BOOLEAN DEFAULT TRUE,
  license_number TEXT,
  phone TEXT,
  bio TEXT
);

-- Doctor schedules (simple representation)
CREATE TABLE doctor_schedules (
  id SERIAL PRIMARY KEY,
  doctor_id INTEGER REFERENCES doctors(id),
  day_of_week INTEGER, -- 0-6
  start_time TEXT, -- '09:00'
  end_time TEXT,
  slot_duration INTEGER, -- minutes
  break_start TEXT,
  break_end TEXT
);

-- Appointments
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES users(id),
  doctor_id INTEGER REFERENCES doctors(id),
  specialization_id INTEGER REFERENCES specializations(id),
  appointment_date DATE,
  start_time TEXT,
  end_time TEXT,
  type TEXT, -- 'online' or 'in-person'
  meet_link TEXT,
  patient_notes TEXT,
  status TEXT DEFAULT 'booked',
  created_at TIMESTAMP DEFAULT now()
);
```

Run the SQL with psql or a DB client connected to the `DB_NAME` database.

## Running the server

- Development (with nodemon):

```bash
npm run dev
```

- Production:

```bash
npm start
```

The server listens on `PORT` (default 5000). Swagger UI is available at `http://localhost:5000/api-docs`.

## Authentication & headers

- Most protected endpoints require an `Authorization` header: `Authorization: Bearer <JWT>`
- Tokens are issued by `POST /auth/signin` (and also after `POST /auth/signup`).

## API Endpoints (full list with examples)

Base URL: `http://localhost:5000`

1. Auth

- Signup (create user)
  - Endpoint: `POST /auth/signup`
  - Body (JSON):

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "secret123",
  "role": "patient"
}
```

- Example curl:

```bash
curl -X POST http://localhost:5000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123","role":"patient"}'
```

- Signin (email/password)
  - Endpoint: `POST /auth/signin`
  - Body (JSON):

```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```

- Example curl:

```bash
curl -X POST http://localhost:5000/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

- Response contains `token` and `user`.

- Google OAuth login (browser flow)
  - Start: `GET /auth/google` → redirects to Google.
  - Callback: `GET /auth/google/callback` → Google redirects back and the server issues a JWT and redirects to `FRONTEND_URL?token=...&role=...`.

- Google Calendar OAuth for calendar access (one-time setup)
  - Get auth URL: `GET /auth/google-calendar` → returns `authUrl` and instructions.
  - After authorizing in Google Console you receive a `code` → call:

    `GET /auth/google-calendar/callback?code=YOUR_CODE`

  - Response returns `refreshToken` which you must add to `.env` as `GOOGLE_CALENDAR_REFRESH_TOKEN`.

2. Public Appointments

- Get specializations (public)
  - Endpoint: `GET /appointments/specializations`
  - Example:

```bash
curl http://localhost:5000/appointments/specializations
```

3. Protected (Patient) - requires Bearer token

- Patient dashboard
  - Endpoint: `GET /patient/dashboard`
  - Header: `Authorization: Bearer <token>`

  - Example:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/patient/dashboard
```

- Get doctors by specialization
  - Endpoint: `GET /appointments/doctors/:specialization_id`
  - Example:

```bash
curl http://localhost:5000/appointments/doctors/1 -H "Authorization: Bearer $TOKEN"
```

- Get available slots for a doctor (next 7 days)
  - Endpoint: `GET /appointments/slots/:doctor_id`
  - Example:

```bash
curl http://localhost:5000/appointments/slots/2 -H "Authorization: Bearer $TOKEN"
```

- Book an appointment
  - Endpoint: `POST /appointments/book`
  - Header: `Authorization: Bearer <token>`
  - Body (JSON) example for online appointment:

```json
{
  "doctor_id": 2,
  "specialization_id": 1,
  "appointment_date": "2026-02-05",
  "start_time": "09:30",
  "end_time": "10:00",
  "type": "online",
  "notes": "Follow-up on blood test"
}
```

- Example curl:

```bash
curl -X POST http://localhost:5000/appointments/book \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"doctor_id":2,"specialization_id":1,"appointment_date":"2026-02-05","start_time":"09:30","end_time":"10:00","type":"online","notes":"Follow-up"}'
```

- Behavior: If `type` is `online`, the server attempts to create a Google Meet event (requires valid calendar refresh token). Email confirmations are sent to patient, doctor, and optionally an organizer address (`EMAIL_USER`).

4. Admin (requires admin token)

- Add doctor
  - Endpoint: `POST /admin/doctors`
  - Header: `Authorization: Bearer <admin-token>`
  - Body example:

```json
{
  "name": "Dr. Tadesse",
  "email": "doc@example.com",
  "specialization_id": 1,
  "license_number": "ABC-123",
  "phone": "+251912345678",
  "bio": "Cardiologist with 10 years experience"
}
```

- Example curl:

```bash
curl -X POST http://localhost:5000/admin/doctors \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Dr. T","email":"doc@example.com","specialization_id":1}'
```

- Analytics
  - Endpoint: `GET /admin/analytics`
  - Example curl:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:5000/admin/analytics
```

## Swagger UI

API docs are auto-generated from JSDoc comments. Open:

```
http://localhost:5000/api-docs
```

Use the interactive UI to try endpoints and view schemas.

## Google Calendar / Meet integration (one-time setup)

1. Create OAuth 2.0 Client ID in Google Cloud Console (Credentials → OAuth 2.0 Client IDs).
2. Add the redirect URIs shown by `GET /auth/debug/google-redirects` to your OAuth client.
3. Visit `GET /auth/google-calendar` to get an `authUrl` and follow the instructions.
4. After consenting, Google will redirect to `/auth/google-calendar/callback?code=...` — use that `code` to get tokens; the server returns a `refreshToken`.
5. Save `GOOGLE_CALENDAR_REFRESH_TOKEN` into your `.env` so `createMeetEvent()` can create events.

Important: set `prompt: consent` in the auth URL (the server already sets this) to receive a refresh token.

## Email notes

- The project uses `nodemailer` with `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS`.
- Emails are sent on appointment booking to patient, doctor, and the configured organizer (`EMAIL_USER`). Ensure the SMTP account allows sending to the addresses you test with.

## Troubleshooting

- 502 or errors when creating Google Meet: ensure `GOOGLE_CALENDAR_REFRESH_TOKEN` and calendar client credentials are correct; check Google Cloud Console (APIs & Services → Library) that Google Calendar API is enabled.
- Invalid token errors: ensure `JWT_SECRET` is set and tokens are passed as `Authorization: Bearer <token>`.
- Email failures: confirm SMTP credentials and ports; check provider logs.
