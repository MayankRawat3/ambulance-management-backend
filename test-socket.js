
const { io } = require("socket.io-client");

// Paste a fresh JWT locally. Never share it.
// const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YWUzOWY0MjAzYjNiZjhiZDVhMWNiMDkiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzk1Mjg0MDQ5LCJleHAiOjE3OTUzNzA0NDl9.crH7uvVGazzgTo1B4DMYKj-mXHt83no72xdbhYzepLE";

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YWUzOWY0MjAzYjNiZjhiZDVhMWNiMDkiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzk1NDMxNjcxLCJleHAiOjE3OTU1MTgwNzF9.QTNbb2YwVIoYu9J1o6yrsNWBdTlJVJHvugkA93sxkME";

const requestId = "6b03f308dd8dd27108eb99af";

const socket = io("http://localhost:5000", {
    auth: { token },
    timeout: 5000,
    reconnection: false
});

socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    socket.emit("join-ambulance-request", requestId);
});

socket.on("connect_error", (error) => {
    console.log("Connection error:", error.message);
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

socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
});

socket.on("driver-location-updated", (data) => {
    console.log("Driver location updated:", data);
});
