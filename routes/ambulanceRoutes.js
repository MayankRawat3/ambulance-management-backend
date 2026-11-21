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


// Get all ambulance requests of logged-in patient
router.get(
    "/my-requests",
    authMiddleware,
    authorizeRole("patient"),
    async (req, res) => {
        try {
            const requests = await AmbulanceRequest.find({
                patient: req.user.userId
            }).sort({ createdAt: -1 });

            return res.status(200).json({
                message: "Ambulance requests fetched successfully",
                requests
            });

        } catch (error) {
            console.error("Fetch requests error:", error.message);

            return res.status(500).json({
                message: "Server error while fetching ambulance requests."
            });
        }
    }
);


// Driver accepts an ambulance request
router.patch(
    "/:requestId/accept",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const request = await AmbulanceRequest.findOneAndUpdate(
                {
                    _id: req.params.requestId,
                    status: "pending",
                    assignedDriver: null
                },
                {
                    $set: {
                        status: "accepted",
                        assignedDriver: req.user.userId
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!request) {
                return res.status(409).json({
                    message: "Request is unavailable or already accepted."
                });
            }

            return res.status(200).json({
                message: "Ambulance request accepted successfully",
                request
            });

        } catch (error) {
            console.error("Accept request error:", error.message);

            return res.status(500).json({
                message: "Server error while accepting ambulance request."
            });
        }
    }
);


router.get(
    "/available",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const requests = await AmbulanceRequest.find({
                status: "pending",
                assignedDriver: null
            })
                .populate("patient", "name phone email")
                .sort({ createdAt: -1 });

            return res.status(200).json({
                message: "Available ambulance requests fetched successfully",
                requests
            });
        } catch (error) {
            console.error("Available requests error:", error.message);
            return res.status(500).json({
                message: "Server error while fetching available ambulance requests."
            });
        }
    }
);



router.get(
    "/my-assigned",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const requests = await AmbulanceRequest.find({
                assignedDriver: req.user.userId
            })
                .populate("patient", "name phone email")
                .sort({ createdAt: -1 });

            return res.status(200).json({
                message: "Your assigned ambulance requests fetched successfully",
                requests
            });
        } catch (error) {
            console.error("My assigned requests error:", error.message);
            return res.status(500).json({
                message: "Server error while fetching assigned ambulance requests."
            });
        }
    }
);



router.patch(
    "/:requestId/complete",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const request = await AmbulanceRequest.findOneAndUpdate(
                {
                    _id: req.params.requestId,
                    assignedDriver: req.user.userId,
                    status: "accepted"
                },
                {
                    $set: {
                        status: "completed"
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!request) {
                return res.status(404).json({
                    message: "Request not found or cannot be completed."
                });
            }

            return res.status(200).json({
                message: "Ambulance request marked as completed successfully",
                request
            });
        } catch (error) {
            console.error("Complete request error:", error.message);

            return res.status(500).json({
                message: "Server error while completing ambulance request."
            });
        }
    }
);


module.exports = router;