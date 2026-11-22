const { io } = require("socket.io-client");

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YWRmZTU4ZDcyODdiMTM4ZTJhZWM0OTAiLCJyb2xlIjoicGF0aWVudCIsImlhdCI6MTc5NTI4NDE4NywiZXhwIjoxNzk1MzcwNTg3fQ.u0GJWLCYjcFZMxVLuPTRQRRulvk6AAkK5fk-MQd8pec";
const requestId = "6b028c5c0352d5f460aa3305";

const socket = io("http://localhost:5000", {
    auth: { token }
});

socket.on("connect", () => {
    console.log("Patient connected:", socket.id);

    socket.emit("join-ambulance-request", requestId);
    // Simulate live location updates from the driver
    socket.emit("update-driver-location", {
    requestId,
    latitude: 30.3165,
    longitude: 78.0322
});
});

socket.on("tracking-joined", (data) => {
    console.log("Patient joined tracking room:", data);
});

socket.on("driver-location-updated", (data) => {
    console.log("Live driver location received:", data);
});

socket.on("tracking-error", (data) => {
    console.log("Tracking error:", data.message);
});

socket.on("connect_error", (error) => {
    console.log("Connection failed:", error.message);
});