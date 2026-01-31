const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Doctor Appointment API",
      version: "1.0.0",
      description: "Online doctor appointment system backend (PERN stack)",
      contact: {
        name: "Tofik",
      },
    },
    servers: [
      {
        url: "http://localhost:5000", // change to your real port/host
        description: "Development server",
      },
      // Add production later: { url: 'https://your-app.com' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [
    "./routes/*.js", // all your route files
    "./controllers/*.js", // if you put comments in controllers
    "./server.js", // or main file if you want base docs
    "./services/*.js",
    // add more paths if needed, e.g. './services/*.js'
  ],
};

const specs = swaggerJsdoc(options);

module.exports = { specs };
