
require("dotenv").config();


const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const userRoutes = require("./routes/userRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Read JSON data sent by client
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.send("Ambulance Management System Backend is Running!");
});


// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.get("/api/protected", authMiddleware, (req, res) => {
    res.status(200).json({
        message: "You have accessed a protected route!",
        user: req.user
    });
});

// Connect database and start server
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("MongoDB connected successfully");

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

startServer();
