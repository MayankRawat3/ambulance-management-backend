const express = require("express");
const AmbulanceRequest = require("../models/AmbulanceRequest");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const User = require("../models/User");
const mongoose = require("mongoose");


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
                typeof pickupLocation !== "string" ||
                typeof destination !== "string" ||
                typeof emergencyType !== "string"
            ) {
                return res.status(400).json({
                    message: "Pickup location, destination, and emergency type are required."
                });
            }

            // Trim input values
            const cleanPickupLocation = pickupLocation.trim();
            const cleanDestination = destination.trim();
            const cleanEmergencyType = emergencyType.trim();


            // Check empty values
            if (
                !cleanPickupLocation ||
                !cleanDestination ||
                !cleanEmergencyType
            ) {
                return res.status(400).json({
                    message: "Fields cannot contain only spaces."
                });
            }

            // Validate description
            if (
                description !== undefined &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    message: "Description must be a string."
                });
            }

            //checkpoint - Check valid emergency type
            const allowedEmergencyTypes = [
                "Medical Emergency",
                "Accident",
                "Critical Care",
                "Other"
            ];

            if (!allowedEmergencyTypes.includes(cleanEmergencyType)) {
                return res.status(400).json({
                    message: "Invalid emergency type."
                });
            }

            // Save request in MongoDB
            const ambulanceRequest = await AmbulanceRequest.create({
                patient: req.user.userId,
                pickupLocation: cleanPickupLocation,
                destination: cleanDestination,
                emergencyType: cleanEmergencyType,
                description: description?.trim() || ""
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

        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
            return res.status(400).json({
                message: "Invalid ambulance request ID."
            });
        }

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

        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
            return res.status(400).json({
                message: "Invalid ambulance request ID."
            });
        }

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


router.patch(
    "/:requestId/cancel",
    authMiddleware,
    authorizeRole("patient"),
    async (req, res) => {

        if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
            return res.status(400).json({
                message: "Invalid ambulance request ID."
            });
        }

        try {
            const request = await AmbulanceRequest.findOneAndUpdate(
                {
                    _id: req.params.requestId,
                    patient: req.user.userId,
                    status: "pending",
                    assignedDriver: null
                },
                {
                    $set: {
                        status: "cancelled"
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!request) {
                return res.status(404).json({
                    message: "Request not found or cannot be cancelled."
                });
            }

            return res.status(200).json({
                message: "Ambulance request cancelled successfully",
                request
            });
        } catch (error) {
            console.error("Cancel request error:", error.message);

            return res.status(500).json({
                message: "Server error while cancelling ambulance request."
            });
        }
    }
);


router.patch(
    "/availability",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const { isAvailable } = req.body;

            if (typeof isAvailable !== "boolean") {
                return res.status(400).json({
                    message: "isAvailable must be true or false."
                });
            }

            const driver = await User.findOneAndUpdate(
                {
                    _id: req.user.userId,
                    role: "driver"
                },
                {
                    $set: { isAvailable }
                },
                {
                    new: true,
                    runValidators: true
                }
            ).select("-password");

            if (!driver) {
                return res.status(404).json({
                    message: "Driver not found."
                });
            }

            return res.status(200).json({
                message: "Driver availability updated successfully.",
                driver
            });
        } catch (error) {
            console.error("Availability update error:", error.message);

            return res.status(500).json({
                message: "Server error while updating driver availability."
            });
        }
    }
);


router.get(
    "/availability",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const driver = await User.findOne({
                _id: req.user.userId,
                role: "driver"
            }).select("name email role isAvailable");

            if (!driver) {
                return res.status(404).json({
                    message: "Driver not found."
                });
            }

            return res.status(200).json({
                message: "Driver availability fetched successfully.",
                driver
            });
        } catch (error) {
            console.error("Fetch availability error:", error.message);

            return res.status(500).json({
                message: "Server error while fetching driver availability."
            });
        }
    }
);

router.get(
    "/hospital/requests",
    authMiddleware,
    authorizeRole("hospital"),
    async (req, res) => {
        try {
            const requests = await AmbulanceRequest.find()
                .populate("patient", "name phone email")
                .populate("assignedDriver", "name phone email isAvailable")
                .sort({ createdAt: -1 });

            return res.status(200).json({
                message: "Hospital dashboard requests fetched successfully",
                totalRequests: requests.length,
                requests
            });
        } catch (error) {
            console.error("Hospital dashboard error:", error.message);

            return res.status(500).json({
                message: "Server error while fetching hospital dashboard."
            });
        }
    }
);


module.exports = router;