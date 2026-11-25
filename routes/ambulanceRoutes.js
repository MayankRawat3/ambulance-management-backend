const express = require("express");
const AmbulanceRequest = require("../models/AmbulanceRequest");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRole = require("../middleware/roleMiddleware");
const User = require("../models/User");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");


const router = express.Router();
const ACTIVE_REQUEST_STATUSES = ["accepted", "assigned"];
const requestCreationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: (req) => req.user.userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        message: "Too many ambulance requests. Please try again in one minute."
    }
});


// Create a new ambulance request


router.post(
    "/request",
    authMiddleware,
    authorizeRole("patient"),
    requestCreationLimiter,
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
                cleanPickupLocation.length > 200 ||
                cleanDestination.length > 200
            ) {
                return res.status(400).json({
                    message: "Pickup location and destination cannot exceed 200 characters."
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

            const cleanDescription = description?.trim() || "";

            if (cleanDescription.length > 1000) {
                return res.status(400).json({
                    message: "Description cannot exceed 1000 characters."
                });
            }

            if (
                typeof longitude !== "number" ||
                typeof latitude !== "number" ||
                !Number.isFinite(longitude) ||
                !Number.isFinite(latitude) ||
                longitude < -180 ||
                longitude > 180 ||
                latitude < -90 ||
                latitude > 90
            ) {
                return res.status(400).json({
                    message: "Valid numeric longitude and latitude are required."
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
                    coordinates: [longitude, latitude]
                },
                destination: cleanDestination,
                emergencyType: cleanEmergencyType,
                description: cleanDescription
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

        const session = await mongoose.startSession();

        try {
            let acceptedRequest = null;

            await session.withTransaction(async () => {

                // Step 1: Check existing active request
                const activeRequest = await AmbulanceRequest.findOne({
                    assignedDriver: req.user.userId,
                    status: { $in: ACTIVE_REQUEST_STATUSES }
                }).session(session);

                if (activeRequest) {
                    const error = new Error(
                        "You already have an active ambulance request."
                    );
                    error.statusCode = 409;
                    error.responseBody = {
                        message: error.message,
                        activeRequestId: activeRequest._id
                    };
                    throw error;
                }

                // Step 2: Lock driver availability
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
                        runValidators: true,
                        session
                    }
                );

                if (!driver) {
                    const error = new Error(
                        "You must be online and available to accept a request."
                    );
                    error.statusCode = 409;
                    throw error;
                }

                // Step 3: Accept pending request
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
                        runValidators: true,
                        session
                    }
                );

                if (!request) {
                    const error = new Error(
                        "Request is unavailable or already accepted."
                    );
                    error.statusCode = 409;
                    throw error;
                }

                acceptedRequest = request;
            });

            return res.status(200).json({
                message: "Ambulance request accepted successfully.",
                request: acceptedRequest
            });

        } catch (error) {
            console.error("Accept request error:", error.message);

            if (error.statusCode === 409) {
                return res.status(409).json(
                    error.responseBody || {
                        message: error.message
                    }
                );
            }

            return res.status(500).json({
                message: "Server error while accepting ambulance request."
            });

        } finally {
            await session.endSession();
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
        const { requestId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({
                message: "Invalid ambulance request ID."
            });
        }

        try {
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
                const session = await mongoose.startSession();

                try {
                    let result = null;

                    await session.withTransaction(async () => {
                        result = null;

                        const activeRequest =
                            await AmbulanceRequest.findOne({
                                assignedDriver: candidate._id,
                                status: { $in: ACTIVE_REQUEST_STATUSES }
                            }).session(session);

                        if (activeRequest) {
                            await User.updateOne(
                                {
                                    _id: candidate._id,
                                    role: "driver"
                                },
                                {
                                    $set: { isAvailable: false }
                                },
                                { session }
                            );

                            result = { skipped: true };
                            return;
                        }

                        const lockedDriver =
                            await User.findOneAndUpdate(
                                {
                                    _id: candidate._id,
                                    role: "driver",
                                    isAvailable: true
                                },
                                {
                                    $set: { isAvailable: false }
                                },
                                {
                                    returnDocument: "after",
                                    session
                                }
                            );

                        if (!lockedDriver) {
                            result = { skipped: true };
                            return;
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
                                    runValidators: true,
                                    session
                                }
                            );

                        if (!assignedRequest) {
                            const error = new Error(
                                "Request was assigned or changed by another process."
                            );
                            error.statusCode = 409;
                            throw error;
                        }

                        result = {
                            request: assignedRequest,
                            driver: lockedDriver
                        };
                    });

                    if (result?.request) {
                        return res.status(200).json({
                            message: "Nearest driver assigned successfully.",
                            distanceInMeters: candidate.distanceInMeters,
                            distanceInKm: Number(
                                (candidate.distanceInMeters / 1000).toFixed(2)
                            ),
                            request: result.request,
                            driver: {
                                _id: result.driver._id,
                                name: result.driver.name,
                                phone: result.driver.phone,
                                isAvailable: result.driver.isAvailable
                            }
                        });
                    }

                } catch (error) {
                    if (error.statusCode === 409) {
                        return res.status(409).json({
                            message: error.message
                        });
                    }

                    throw error;

                } finally {
                    await session.endSession();
                }
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

            const activeRequests = requests.filter((request) =>
                ACTIVE_REQUEST_STATUSES.includes(request.status)
            );

            return res.status(200).json({
                message: "Your assigned ambulance requests fetched successfully",
                requests,
                activeRequests,
                activeTripCount: activeRequests.length
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

        const session = await mongoose.startSession();

        try {
            let completedRequest = null;
            let driverAvailability = null;

            await session.withTransaction(async () => {

                // Step 1: Complete only the driver's active request
                completedRequest = await AmbulanceRequest.findOneAndUpdate(
                    {
                        _id: req.params.requestId,
                        assignedDriver: req.user.userId,
                        status: { $in: ACTIVE_REQUEST_STATUSES }
                    },
                    {
                        $set: {
                            status: "completed"
                        }
                    },
                    {
                        new: true,
                        runValidators: true,
                        session
                    }
                );

                if (!completedRequest) {
                    return;
                }

                // Step 2: Check whether driver has another active request
                const otherActiveRequest = await AmbulanceRequest.findOne({
                    assignedDriver: req.user.userId,
                    _id: { $ne: completedRequest._id },
                    status: { $in: ACTIVE_REQUEST_STATUSES }
                }).session(session);

                // Step 3: Update driver availability
                const driverUpdate = await User.updateOne(
                    {
                        _id: req.user.userId,
                        role: "driver"
                    },
                    {
                        $set: {
                            isAvailable: !otherActiveRequest
                        }
                    },
                    { session }
                );

                if (driverUpdate.matchedCount === 0) {
                    throw new Error("Driver not found.");
                }

                driverAvailability = !otherActiveRequest;
            });

            if (!completedRequest) {
                return res.status(404).json({
                    message: "Request not found or cannot be completed."
                });
            }

            return res.status(200).json({
                message: "Ambulance request completed successfully.",
                request: completedRequest,
                driverAvailability: driverAvailability
            });

        } catch (error) {
            console.error("Complete request error:", error.message);

            return res.status(500).json({
                message: "Server error while completing ambulance request."
            });

        } finally {
            await session.endSession();
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

        const session = await mongoose.startSession();

        try {
            let cancelledRequest = null;
            let driverAvailability = null;

            await session.withTransaction(async () => {

                // Step 1: Cancel only patient's pending or active request
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
                        new: true,
                        runValidators: true,
                        session
                    }
                );

                if (!cancelledRequest) {
                    return;
                }

                // Step 2: Release assigned driver safely
                if (cancelledRequest.assignedDriver) {

                    // Check whether driver has another active request
                    const otherActiveRequest = await AmbulanceRequest.findOne({
                        assignedDriver: cancelledRequest.assignedDriver,
                        _id: { $ne: cancelledRequest._id },
                        status: {
                            $in: ["accepted", "assigned"]
                        }
                    }).session(session);

                    // Driver is available only if no other active request exists
                    const driverUpdate = await User.updateOne(
                        {
                            _id: cancelledRequest.assignedDriver,
                            role: "driver"
                        },
                        {
                            $set: {
                                isAvailable: !otherActiveRequest
                            }
                        },
                        { session }
                    );

                    if (driverUpdate.matchedCount === 0) {
                        throw new Error("Assigned driver not found.");
                    }
                    driverAvailability = !otherActiveRequest;
                }
            });

            if (!cancelledRequest) {
                return res.status(404).json({
                    message: "Request not found or cannot be cancelled."
                });
            }

            return res.status(200).json({
                message: "Ambulance request cancelled successfully.",
                request: cancelledRequest,
                driverAvailability: driverAvailability

            });

        } catch (error) {
            console.error("Cancel request error:", error.message);

            return res.status(500).json({
                message: "Server error while cancelling ambulance request."
            });

        } finally {
            await session.endSession();
        }
    }
);

router.patch(
    "/availability",
    authMiddleware,
    authorizeRole("driver"),
    async (req, res) => {
        const { isAvailable } = req.body;

        if (typeof isAvailable !== "boolean") {
            return res.status(400).json({
                message: "isAvailable must be true or false."
            });
        }

        const session = await mongoose.startSession();

        try {
            let updatedDriver = null;

            await session.withTransaction(async () => {

                // Prevent going online with an active request
                if (isAvailable === true) {
                    const activeRequest = await AmbulanceRequest.findOne({
                        assignedDriver: req.user.userId,
                        status: { $in: ACTIVE_REQUEST_STATUSES }
                    }).session(session);

                    if (activeRequest) {
                        const error = new Error(
                            "You cannot become available while an ambulance request is active."
                        );
                        error.statusCode = 409;
                        throw error;
                    }
                }

                updatedDriver = await User.findOneAndUpdate(
                    {
                        _id: req.user.userId,
                        role: "driver"
                    },
                    {
                        $set: { isAvailable }
                    },
                    {
                        returnDocument: "after",
                        runValidators: true,
                        session
                    }
                ).select("-password");

                if (!updatedDriver) {
                    const error = new Error("Driver not found.");
                    error.statusCode = 404;
                    throw error;
                }
            });

            return res.status(200).json({
                message: "Driver availability updated successfully.",
                driver: updatedDriver
            });

        } catch (error) {
            console.error("Availability update error:", error.message);

            return res.status(error.statusCode || 500).json({
                message: error.statusCode
                    ? error.message
                    : "Server error while updating driver availability."
            });

        } finally {
            await session.endSession();
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
                status: { $in: ACTIVE_REQUEST_STATUSES }
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