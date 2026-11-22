const { io } = require("socket.io-client");

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YWUzOWY0MjAzYjNiZjhiZDVhMWNiMDkiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzk1Mjg0MDQ5LCJleHAiOjE3OTUzNzA0NDl9.crH7uvVGazzgTo1B4DMYKj-mXHt83no72xdbhYzepLE";

const requestId = "6b028c5c0352d5f460aa3305";

const socket = io("http://localhost:5000", {
    auth: { token }
});

socket.on("connect", () => {
    console.log("Socket connected:", socket.id);

    socket.emit("join-ambulance-request", requestId);
});

socket.on("tracking-joined", (data) => {
    console.log("Tracking room joined:", data);

    socket.emit("update-driver-location", {
        requestId,
        latitude: 30.3165,
        longitude: 78.0322
    });
});

socket.on("tracking-error", (data) => {
    console.log("Tracking error:", data.message);
});

socket.on("disconnect", () => {
    console.log("Socket disconnected");
});

socket.on("driver-location-updated", (data) => {
    console.log("Driver location:", data);
});