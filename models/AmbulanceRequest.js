
const mongoose = require("mongoose");

const ambulanceRequestSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        assignedDriver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        pickupLocation: {
            type: String,
            required: true,
            trim: true
        },

        pickupCoordinates: {
            type: {
                type: String,
                enum: ["Point"],
                required: true
            },
            coordinates: {
                type: [Number],
                required: true
            }
        },

        destination: {
            type: String,
            required: true,
            trim: true
        },

        emergencyType: {
            type: String,
            enum: [
                "Medical Emergency",
                "Accident",
                "Critical Care",
                "Other"
            ],
            required: true
        },

        description: {
            type: String,
            trim: true,
            default: "",
            maxlength: [
                1000,
                "Description cannot exceed 1000 characters."
            ]
        },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "assigned",
                "completed",
                "cancelled"
            ],
            default: "pending"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "AmbulanceRequest",
    ambulanceRequestSchema
);
