const express = require("express");
const cors = require("cors");

const documentRoutes = require("./routes/documentRoutes");

// The Express app without app.listen(), so tests can import it and send
// requests with Supertest. server.js starts it on a port.
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/documents", documentRoutes);

app.get("/", (req, res) => {
  res.send("AI Document Q&A backend running");
});

module.exports = app;