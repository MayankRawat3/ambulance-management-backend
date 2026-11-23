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
                description,
                longitude,
                latitude
            } = req.body;

            if (
                typeof pickupLocation !== "string" ||
                typeof destination !== "string" ||
                typeof emergencyType !== "string"
            ) {
                return res.status(400).json({
                    message: "Pickup location, destination, and emergency type are required."
                });
            }

            const cleanPickupLocation = pickupLocation.trim();
            const cleanDestination = destination.trim();
            const cleanEmergencyType = emergencyType.trim();

            if (
                !cleanPickupLocation ||
                !cleanDestination ||
                !cleanEmergencyType
            ) {
                return res.status(400).json({
                    message: "Fields cannot contain only spaces."
                });
            }

            if (
                description !== undefined &&
                typeof description !== "string"
            ) {
                return res.status(400).json({
                    message: "Description must be a string."
                });
            }

            const lon = Number(longitude);
            const lat = Number(latitude);

            if (
                longitude === undefined ||
                latitude === undefined ||
                !Number.isFinite(lon) ||
                !Number.isFinite(lat) ||
                lon < -180 || lon > 180 ||
                lat < -90 || lat > 90
            ) {
                return res.status(400).json({
                    message: "Valid longitude and latitude are required."
                });
            }

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

            const ambulanceRequest = await AmbulanceRequest.create({
                patient: req.user.userId,
                pickupLocation: cleanPickupLocation,
                pickupCoordinates: {
                    type: "Point",
                    coordinates: [lon, lat]
                },
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

        let driverLocked = false;

        try {
            // Step 1: Atomically check and lock driver availability
            const driver = await User.findOneAndUpdate(
                {
                    _id: req.user.userId,
                    role: "driver",
                    isAvailable: true
                },
                {
                    $set: { isAvailable: false }
                },
                {
                    returnDocument: "after",
                    runValidators: true
                }
            );

            if (!driver) {
                return res.status(409).json({
                    message: "You must be online and available to accept a request."
                });
            }

            driverLocked = true;

            // Step 2: Check for an existing active request
            const activeRequest = await AmbulanceRequest.findOne({
                assignedDriver: req.user.userId,
                status: { $in: ["accepted", "assigned"] }
            });

            if (activeRequest) {
                await User.updateOne(
                    { _id: req.user.userId },
                    { $set: { isAvailable: false } }
                );

                return res.status(409).json({
                    message: "You already have an active ambulance request.",
                    activeRequestId: activeRequest._id
                });
            }

            // Step 3: Accept the pending request
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
                    returnDocument: "after",
                    runValidators: true
                }
            );

            if (!request) {
                await User.updateOne(
                    { _id: req.user.userId },
                    { $set: { isAvailable: true } }
                );

                return res.status(409).json({
                    message: "Request is unavailable or already accepted."
                });
            }

            return res.status(200).json({
                message: "Ambulance request accepted successfully.",
                request
            });

        } catch (error) {
            console.error("Accept request error:", error.message);

            if (driverLocked) {
                const activeRequest = await AmbulanceRequest.findOne({
                    assignedDriver: req.user.userId,
                    status: { $in: ["accepted", "assigned"] }
                });

                if (!activeRequest) {
                    await User.updateOne(
                        { _id: req.user.userId },
                        { $set: { isAvailable: true } }
                    );
                }
            }

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


// Find nearby available drivers with distance
router.get(
    "/nearby-drivers",
    authMiddleware,
    authorizeRole("hospital"),
    async (req, res) => {
        try {
            const { longitude, latitude, maxDistance = 10000 } = req.query;

            const lon = Number(longitude);
            const lat = Number(latitude);
            const distance = Number(maxDistance);

            if (
                longitude === undefined ||
                latitude === undefined ||
                !Number.isFinite(lon) ||
                !Number.isFinite(lat) ||
                lon < -180 || lon > 180 ||
                lat < -90 || lat > 90 ||
                !Number.isFinite(distance) ||
                distance <= 0
            ) {
                return res.status(400).json({
                    message: "Valid longitude, latitude and maxDistance are required."
                });
            }

            const drivers = await User.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [lon, lat]
                        },
                        distanceField: "distanceInMeters",
                        maxDistance: distance,
                        spherical: true,
                        query: {
                            role: "driver",
                            isAvailable: true
                        }
                    }
                },
                {
                    $limit: 20
                },
                {
                    $project: {
                        name: 1,
                        phone: 1,
                        location: 1,
                        isAvailable: 1,
                        distanceInMeters: 1,
                        distanceInKm: {
                            $round: [
                                { $divide: ["$distanceInMeters", 1000] },
                                2
                            ]
                        }
                    }
                }
            ]);

            return res.status(200).json({
                message: "Nearby available drivers fetched successfully.",
                count: drivers.length,
                drivers
            });

        } catch (error) {
            console.error("Nearby drivers error:", error.message);

            return res.status(500).json({
                message: "Server error while finding nearby drivers."
            });
        }
    }
);

// Automatically assign nearest available driver
router.patch(
    "/:requestId/auto-assign",
    authMiddleware,
    authorizeRole("hospital"),
    async (req, res) => {
        try {
            const { requestId } = req.params;

            if (!mongoose.Types.ObjectId.isValid(requestId)) {
                return res.status(400).json({
                    message: "Invalid ambulance request ID."
                });
            }

            const request = await AmbulanceRequest.findOne({
                _id: requestId,
                status: "pending",
                assignedDriver: null
            });

            if (!request) {
                return res.status(404).json({
                    message: "Pending ambulance request not found."
                });
            }

            const [longitude, latitude] =
                request.pickupCoordinates.coordinates;

            const drivers = await User.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [longitude, latitude]
                        },
                        distanceField: "distanceInMeters",
                        maxDistance: 10000,
                        spherical: true,
                        query: {
                            role: "driver",
                            isAvailable: true
                        }
                    }
                },
                { $limit: 20 }
            ]);

            if (drivers.length === 0) {
                return res.status(404).json({
                    message: "No available drivers found nearby."
                });
            }

            for (const candidate of drivers) {
                const activeRequest = await AmbulanceRequest.findOne({
                    assignedDriver: candidate._id,
                    status: { $in: ["accepted", "assigned"] }
                });

                if (activeRequest) {
                    await User.updateOne(
                        { _id: candidate._id },
                        { $set: { isAvailable: false } }
                    );
                    continue;
                }

                const lockedDriver = await User.findOneAndUpdate(
                    {
                        _id: candidate._id,
                        role: "driver",
                        isAvailable: true
                    },
                    {
                        $set: { isAvailable: false }
                    },
                    { returnDocument: "after" }
                );

                if (!lockedDriver) {
                    continue;
                }

                const assignedRequest =
                    await AmbulanceRequest.findOneAndUpdate(
                        {
                            _id: requestId,
                            status: "pending",
                            assignedDriver: null
                        },
                        {
                            $set: {
                                assignedDriver: candidate._id,
                                status: "accepted"
                            }
                        },
                        {
                            returnDocument: "after",
                            runValidators: true
                        }
                    );

                if (!assignedRequest) {
                    await User.updateOne(
                        { _id: candidate._id },
                        { $set: { isAvailable: true } }
                    );

                    return res.status(409).json({
                        message: "Request was assigned or changed by another process."
                    });
                }

                return res.status(200).json({
                    message: "Nearest driver assigned successfully.",
                    distanceInMeters: candidate.distanceInMeters,
                    distanceInKm: Number(
                        (candidate.distanceInMeters / 1000).toFixed(2)
                    ),
                    request: assignedRequest,
                    driver: {
                        _id: lockedDriver._id,
                        name: lockedDriver.name,
                        phone: lockedDriver.phone,
                        isAvailable: lockedDriver.isAvailable
                    }
                });
            }

            return res.status(409).json({
                message: "No driver is currently available for assignment."
            });

        } catch (error) {
            console.error("Auto assignment error:", error.message);

            return res.status(500).json({
                message: "Server error during automatic driver assignment."
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

// PATCH /:requestId/complete

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
            // Step 1: Complete the assigned request
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
                    returnDocument: "after",
                    runValidators: true
                }
            );

            if (!request) {
                return res.status(404).json({
                    message: "Request not found or cannot be completed."
                });
            }

            // Step 2: Make driver available again
            const driver = await User.findOneAndUpdate(
                {
                    _id: req.user.userId,
                    role: "driver"
                },
                {
                    $set: {
                        isAvailable: true
                    }
                },
                {
                    returnDocument: "after"
                }
            );

            if (!driver) {
                return res.status(500).json({
                    message: "Request completed, but driver availability could not be updated."
                });
            }

            return res.status(200).json({
                message: "Ambulance request completed successfully.",
                request,
                driverAvailability: driver.isAvailable
            });

        } catch (error) {
            console.error("Complete request error:", error.message);

            return res.status(500).json({
                message: "Server error while completing ambulance request."
            });
        }
    }
);

//    
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

        let cancelledRequest = null;
        let driverReleased = false;

        try {
            // Step 1: Cancel pending or active request
            cancelledRequest = await AmbulanceRequest.findOneAndUpdate(
                {
                    _id: req.params.requestId,
                    patient: req.user.userId,
                    status: {
                        $in: ["pending", "accepted", "assigned"]
                    }
                },
                {
                    $set: {
                        status: "cancelled"
                    }
                },
                {
                    returnDocument: "after",
                    runValidators: true
                }
            );

            if (!cancelledRequest) {
                return res.status(404).json({
                    message: "Request not found or cannot be cancelled."
                });
            }

            // Step 2: Release assigned driver
            if (cancelledRequest.assignedDriver) {
                const driver = await User.findOneAndUpdate(
                    {
                        _id: cancelledRequest.assignedDriver,
                        role: "driver"
                    },
                    {
                        $set: {
                            isAvailable: true
                        }
                    },
                    {
                        returnDocument: "after"
                    }
                );

                if (!driver) {
                    throw new Error("Assigned driver not found.");
                }

                driverReleased = true;
            }

            return res.status(200).json({
                message: "Ambulance request cancelled successfully.",
                request: cancelledRequest,
                driverAvailability: cancelledRequest.assignedDriver
                    ? true
                    : null
            });

        } catch (error) {
            console.error("Cancel request error:", error.message);

            // Step 3: Restore request if driver release failed
            if (cancelledRequest && !driverReleased) {
                await AmbulanceRequest.updateOne(
                    {
                        _id: cancelledRequest._id,
                        patient: req.user.userId,
                        status: "cancelled",
                        assignedDriver: cancelledRequest.assignedDriver
                    },
                    {
                        $set: {
                            status: cancelledRequest.assignedDriver
                                ? "accepted"
                                : "pending"
                        }
                    }
                );
            }

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

// Hospital dashboard to view all requests
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

// PATCH /location
router.patch(
    "/location",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        try {
            const { latitude, longitude } = req.body;

            if (
                typeof latitude !== "number" ||
                typeof longitude !== "number"
            ) {
                return res.status(400).json({
                    message: "Latitude and longitude must be numbers."
                });
            }

            if (
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            ) {
                return res.status(400).json({
                    message: "Invalid latitude or longitude values."
                });
            }

            const driver = await User.findOneAndUpdate(
                {
                    _id: req.user.userId,
                    role: "driver"
                },
                {
                    location: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    }
                },
                { new: true }
            ).select("-password");

            if (!driver) {
                return res.status(404).json({
                    message: "Driver not found."
                });
            }

            return res.status(200).json({
                message: "Driver location updated successfully.",
                location: driver.location
            });

        } catch (error) {
            console.error("Location update error:", error.message);

            return res.status(500).json({
                message: "Server error while updating location."
            });
        }
    }
);


// GET /:requestId/location
router.get(
    "/:requestId/location",
    authMiddleware,
    authorizeRole("patient"),
    async (req, res) => {
        try {
            const { requestId } = req.params;

            if (!mongoose.Types.ObjectId.isValid(requestId)) {
                return res.status(400).json({
                    message: "Invalid request ID."
                });
            }

            const ambulanceRequest = await AmbulanceRequest.findOne({
                _id: requestId,
                patient: req.user.userId,
                status: { $in: ["accepted", "assigned"] }
            }).populate("assignedDriver", "name phone location");

            if (!ambulanceRequest) {
                return res.status(404).json({
                    message: "Assigned ambulance request not found."
                });
            }

            if (!ambulanceRequest.assignedDriver) {
                return res.status(404).json({
                    message: "No driver assigned to this request."
                });
            }

            return res.status(200).json({
                message: "Driver location fetched successfully.",
                driver: ambulanceRequest.assignedDriver
            });

        } catch (error) {
            console.error("Fetch driver location error:", error.message);

            return res.status(500).json({
                message: "Server error while fetching driver location."
            });
        }
    }
);


module.exports = router;