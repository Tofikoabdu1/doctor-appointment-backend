const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const dotenv = require("dotenv");
const { signup, signin } = require("../controllers/authController");
const { getAuthUrl, getTokensFromCode } = require("../services/googleService");

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        `${process.env.BACKEND_URL || "http://localhost:5000"}/auth/google/callback`,
      passReqToCallback: true, // keep this
      // Optional: state: true for CSRF protection in production
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Try to find existing user by google_id
        let result = await db.query(
          "SELECT * FROM users WHERE google_id = $1",
          [profile.id],
        );

        let user;

        if (result.rows.length === 0) {
          // New user → auto-signup as patient
          const insertResult = await db.query(
            `INSERT INTO users (name, email, google_id, role)
               VALUES ($1, $2, $3, $4)
               RETURNING id, name, email, role, google_id`,
            [
              profile.displayName || "Google User",
              profile.emails?.[0]?.value || `${profile.id}@google.com`, // fallback
              profile.id,
              "patient", // auto-assign patient role (admins are manual)
            ],
          );

          user = insertResult.rows[0];
        } else {
          user = result.rows[0];
        }

        // Success → pass user to Passport (done(null, user))
        return done(null, user);
      } catch (err) {
        console.error("Google auth error:", err);
        return done(err); // error case
      }
    },
  ),
);

// Optional: keep serialize/deserialize if you ever use sessions later
// But for stateless JWT you can actually skip them entirely
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0] || false);
  } catch (err) {
    done(err);
  }
});

const router = express.Router();

// // Passport Google Strategy
// passport.use(new GoogleStrategy({
//   clientID: process.env.GOOGLE_CLIENT_ID,
//   clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//   callbackURL: process.env.GOOGLE_CALLBACK_URL,
//   passReqToCallback: true,
// }, async (accessToken, refreshToken, profile, done) => {
//   try {
//     let user = await db.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
//     if (user.rows.length === 0) {
//       // Signup if new (assume patient; admins manual)
//       user = await db.query(
//         'INSERT INTO users (name, email, google_id, role) VALUES ($1, $2, $3, $4) RETURNING *',
//         [profile.displayName, profile.emails[0].value, profile.id, 'patient']
//       );
//     }
//     done(null, user.rows[0]);
//   } catch (err) {
//     done(err);
//   }
// }));

// passport.serializeUser((user, done) => done(null, user.id));
// passport.deserializeUser(async (id, done) => {
//   const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);
//   done(null, user.rows[0]);
// });

// Routes
/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create a new user account (signup)
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *             required:
 *               - email
 *               - password
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation error
 */
router.post("/signup", signup);

/**
 * @swagger
 * /auth/signin:
 *   post:
 *     summary: Sign in and receive a JWT
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *             required:
 *               - email
 *               - password
 *     responses:
 *       200:
 *         description: Authentication successful; returns token
 *       401:
 *         description: Invalid credentials
 */
router.post("/signin", signin);

// Debug helper: shows the exact redirect URIs you must add in Google Cloud Console
router.get("/debug/google-redirects", (req, res) => {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
  const googleLoginRedirect =
    process.env.GOOGLE_CALLBACK_URL || `${backendUrl}/auth/google/callback`;
  const googleCalendarRedirect =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${backendUrl}/auth/google-calendar/callback`;

  res.json({
    backendUrl,
    googleLoginRedirect,
    googleCalendarRedirect,
    note: "Add BOTH redirect URIs above to the same OAuth Client in Google Cloud Console (or use separate clients for login vs calendar).",
  });
});

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Start Google OAuth2 login (redirect)
 *     tags:
 *       - Auth
 *     responses:
 *       302:
 *         description: Redirects to Google for authentication
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth2 callback (redirects back to frontend with token)
 *     tags:
 *       - Auth
 *     responses:
 *       302:
 *         description: Redirects to frontend with token in query string on success
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/google/fail",
    session: false, // ← very important: disable session
  }),
  (req, res) => {
    if (!req.user) {
      return res.redirect(
        `${process.env.FRONTEND_URL}?error=google_auth_failed`,
      );
    }

    // Generate your JWT
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    // Redirect to frontend with token in query string
    // (Frontend can read URL → save token → remove from URL)
    res.redirect(
      `${process.env.FRONTEND_URL}?token=${token}&role=${req.user.role}`,
    );

    // Alternative (pure API response - useful for testing in Postman/browser):
    // res.json({ token, user: { id: req.user.id, name: req.user.name, role: req.user.role } });
  },
);

// Optional fail handler
router.get("/google/fail", (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}?error=google_auth_failed`);
});

// Google Calendar OAuth2 Setup (One-time setup to get refresh token)
// Step 1: Get authorization URL
/**
 * @swagger
 * /auth/google-calendar:
 *   get:
 *     summary: Get URL to authorize Google Calendar access
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Returns an authUrl and redirectUri to use for Google Calendar OAuth
 */
router.get("/google-calendar", (req, res) => {
  try {
    const redirectUri =
      process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
      `${process.env.BACKEND_URL || "http://localhost:5000"}/auth/google-calendar/callback`;

    const authUrl = getAuthUrl();
    res.json({
      message: "Visit this URL to authorize Google Calendar access",
      authUrl,
      redirectUri: redirectUri,
      instructions: [
        "1. Make sure this redirect URI is added to your Google Cloud Console:",
        `   ${redirectUri}`,
        "2. Visit the authUrl above to authorize",
        "3. After authorization, you will be redirected to the callback URL with a code",
        "4. Use that code at /auth/google-calendar/callback?code=YOUR_CODE",
      ],
      googleCloudConsoleSteps: [
        "Go to: https://console.cloud.google.com/apis/credentials",
        "Click on your OAuth 2.0 Client ID",
        'Add this URI to "Authorized redirect URIs":',
        redirectUri,
        "Save and try again",
      ],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Handle callback and get refresh token
/**
 * @swagger
 * /auth/google-calendar/callback:
 *   get:
 *     summary: Handle Google Calendar OAuth callback and return tokens
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code returned from Google
 *     responses:
 *       200:
 *         description: Returns refresh token and access token info
 *       400:
 *         description: Missing or invalid code / no refresh token received
 */
router.get("/google-calendar/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    const tokens = await getTokensFromCode(code);

    if (!tokens.refresh_token) {
      return res.status(400).json({
        error:
          'No refresh token received. Make sure to set prompt: "consent" in the auth URL.',
        tokens: tokens, // Show what we got
      });
    }

    res.json({
      message: "Successfully authorized! Add this to your .env file:",
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token, // This expires, but refresh_token is what we need
      expiresIn: tokens.expiry_date,
      instructions:
        "Add GOOGLE_CALENDAR_REFRESH_TOKEN=" +
        tokens.refresh_token +
        " to your .env file",
    });
  } catch (error) {
    console.error("Google Calendar OAuth error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Google
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// router.get('/google/callback',
//     passport.authenticate('google', { session: false, failureRedirect: '/auth/google/fail' }),  // ← session: false is key!
//     (req, res) => {
//       if (!req.user) {
//         return res.redirect(`${process.env.FRONTEND_URL}?error=google_auth_failed`);
//       }

//       const token = jwt.sign(
//         { id: req.user.id, role: req.user.role },
//         process.env.JWT_SECRET,
//         { expiresIn: '1h' }
//       );

//       // Redirect to frontend with token (or send JSON if API-only)
//       res.redirect(`${process.env.FRONTEND_URL}?token=${token}`);
//       // Alternative for pure API: res.json({ token });
//     }
//   );

//   // Optional fail route
//   router.get('/google/fail', (req, res) => {
//     res.redirect(`${process.env.FRONTEND_URL}?error=google_auth_failed`);
//   });

module.exports = router;
