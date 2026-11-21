const express = require("express");
const AmbulanceRequest = require("../models/AmbulanceRequest");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");

const router = express.Router();


// Create a new ambulance request

router.post(
    "/request",
    authMiddleware,
    authorizeRole("patient"),
    async (req, res) => {
        try {
            const {
                pickupLocation,
                destination,
                emergencyType,
                description
            } = req.body;

            // Check required fields
            if (
                !pickupLocation?.trim() ||
                !destination?.trim() ||
                !emergencyType
            ) {
                return res.status(400).json({
                    message: "Pickup location, destination, and emergency type are required."
                });
            }

            // Check valid emergency type
            const allowedEmergencyTypes = [
                "Medical Emergency",
                "Accident",
                "Critical Care",
                "Other"
            ];

            if (!allowedEmergencyTypes.includes(emergencyType)) {
                return res.status(400).json({
                    message: "Invalid emergency type."
                });
            }

            // Save request in MongoDB
            const ambulanceRequest = await AmbulanceRequest.create({
                patient: req.user.userId,
                pickupLocation,
                destination,
                emergencyType,
                description
            });

            return res.status(201).json({
                message: "Ambulance request created successfully",
                request: ambulanceRequest
            });

        } catch (error) {
            console.error("Ambulance request error:", error.message);

            return res.status(500).json({
                message: "Server error while creating ambulance request."
            });
        }
    }
);

module.exports = router;