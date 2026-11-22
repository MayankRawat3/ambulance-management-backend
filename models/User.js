
const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
    {
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
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ["patient", "driver", "hospital"],
            required: true
        },
        isAvailable: {
            type: Boolean,
            default: false
        },
        location: {
            type: locationSchema,
            default: undefined
        }
    },
    { timestamps: true }
);



userSchema.index({ location: "2dsphere" });
module.exports = mongoose.model("User", userSchema);


