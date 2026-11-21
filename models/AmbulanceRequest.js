
const mongoose = require("mongoose");

const ambulanceRequestSchema = new mongoose.Schema(
    {
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        pickupLocation: {
            type: String,
            required: true,
            trim: true
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
            default: ""
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
