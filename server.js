
const express = require("express");

const app = express();
// const PORT = 5000;
const PORT = process.env.PORT || 5000;

// Middleware: JSON request data read karne ke liye
app.use(express.json());

// Test route
app.get("/", (req, res) => {
    res.send("Ambulance Management System Backend is Running!");
});

// Server start
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
