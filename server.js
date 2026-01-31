const express = require("express");
const cors = require("cors");
const passport = require("passport");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");

const { specs } = require("./swagger"); // adjust path if you put swagger.js elsewhere
const swaggerUi = require("swagger-ui-express");

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(bodyParser.json());
app.use(passport.initialize());

// Routes
app.use("/auth", require("./routes/authRoutes"));
app.use("/admin", require("./routes/adminRoutes"));
app.use("/patient", require("./routes/patientRoutes"));
app.use("/appointments", require("./routes/appointmentRoutes"));

// Swagger UI route
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true, // optional: nice search bar
    swaggerOptions: {
      persistAuthorization: true, // keeps JWT after refresh
    },
  }),
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
