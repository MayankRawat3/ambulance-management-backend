
function notFound(req, res, next) {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.originalUrl}`
    });
}

function errorHandler(err, req, res, next) {
    console.error("Server Error:", err.message);

    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || "Internal server error.";

    // Invalid JSON body
    if (err.type === "entity.parse.failed") {
        statusCode = 400;
        message = "Invalid JSON format.";
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
        statusCode = 400;
        message = "Validation failed.";
    }

    // Invalid MongoDB ObjectId
    if (err.name === "CastError") {
        statusCode = 400;
        message = "Invalid resource ID.";
    }

    // Duplicate MongoDB field
    if (err.code === 11000) {
        statusCode = 409;
        message = "Duplicate value. This record already exists.";
    }

    res.status(statusCode).json({
        success: false,
        message
    });
}

module.exports = {
    notFound,
    errorHandler
};
