
require("dotenv").config();


const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const userRoutes = require("./routes/userRoutes");
const authorizeRole = require("./middleware/roleMiddleware");
const ambulanceRoutes = require("./routes/ambulanceRoutes");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const AmbulanceRequest = require("./models/AmbulanceRequest");
const User = require("./models/User");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Socket.IO JWT Authentication
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error("Authentication required."));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.user = decoded;

        next();
    } catch (error) {
        next(new Error("Invalid or expired token."));
    }
});

// Socket.IO Connection
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.user.userId);

    socket.on("join-ambulance-request", async (requestId) => {
        try {
            if (!mongoose.Types.ObjectId.isValid(requestId)) {
                return socket.emit("tracking-error", {
                    message: "Invalid request ID."
                });
            }

            const ambulanceRequest = await AmbulanceRequest.findOne({
                _id: requestId,
                status: { $in: ["accepted", "assigned"] }
            });

            if (!ambulanceRequest) {
                return socket.emit("tracking-error", {
                    message: "Active ambulance request not found."
                });
            }

            const userId = socket.user.userId;
            const role = socket.user.role;

            const isPatient =
                role === "patient" &&
                ambulanceRequest.patient.toString() === userId;

            const isAssignedDriver =
                role === "driver" &&
                ambulanceRequest.assignedDriver?.toString() === userId;

            if (!isPatient && !isAssignedDriver) {
                return socket.emit("tracking-error", {
                    message: "You are not authorized to join this tracking room."
                });
            }

            socket.join(`ambulance:${requestId}`);

            socket.emit("tracking-joined", {
                message: "Successfully joined ambulance tracking room.",
                requestId
            });

        } catch (error) {
            console.error("Tracking room error:", error.message);

            socket.emit("tracking-error", {
                message: "Unable to join tracking room."
            });
        }
    });

    // Handle live location updates from drivers
    socket.on("update-driver-location", async (data) => {
    try {
        const { requestId, latitude, longitude } = data || {};

        if (socket.user.role !== "driver") {
            return socket.emit("tracking-error", {
                message: "Only drivers can update location."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return socket.emit("tracking-error", {
                message: "Invalid request ID."
            });
        }

        if (
            typeof latitude !== "number" ||
            typeof longitude !== "number" ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return socket.emit("tracking-error", {
                message: "Invalid latitude or longitude."
            });
        }

        const ambulanceRequest = await AmbulanceRequest.findOne({
            _id: requestId,
            assignedDriver: socket.user.userId,
            status: { $in: ["accepted", "assigned"] }
        });

        if (!ambulanceRequest) {
            return socket.emit("tracking-error", {
                message: "No active assigned request found."
            });
        }

        const driver = await User.findOneAndUpdate(
            {
                _id: socket.user.userId,
                role: "driver"
            },
            {
                location: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                }
            },
            { returnDocument: "after" }
        ).select("location");

        if (!driver) {
            return socket.emit("tracking-error", {
                message: "Driver not found."
            });
        }

        io.to(`ambulance:${requestId}`).emit(
            "driver-location-updated",
            {
                driverId: socket.user.userId,
                latitude,
                longitude,
                updatedAt: new Date()
            }
        );

    } catch (error) {
        console.error("Live location error:", error.message);

        socket.emit("tracking-error", {
            message: "Unable to update live location."
        });
    }
});

// Handle disconnection

    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.user.userId);
    });
});

const PORT = process.env.PORT || 5000;

// Read JSON data sent by client
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please try again after 15 minutes."
    }
});

app.use(globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        message: "Too many authentication attempts. Try again after 15 minutes."
    }
});


// Home route
app.get("/", (req, res) => {
    res.send("Ambulance Management System Backend is Running!");
});


// Authentication routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ambulance", ambulanceRoutes);


app.get("/api/protected", authMiddleware, (req, res) => {
    res.status(200).json({
        message: "You have accessed a protected route!",
        user: req.user
    });
});


app.get(
    "/api/driver/dashboard",
    authMiddleware,
    authorizeRole("driver"),
    (req, res) => {
        res.status(200).json({
            message: "Welcome to the Driver Dashboard!",
            user: req.user
        });
    }
);

// Connect database and start server
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("MongoDB connected successfully");

        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

// Handle unknown routes
app.use(notFound);

// Centralized error handler
app.use(errorHandler);

startServer();


