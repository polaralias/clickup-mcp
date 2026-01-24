import { logger } from "../../infrastructure/logging/logger.js";
export class AppError extends Error {
    statusCode;
    code;
    isOperational;
    constructor(message, statusCode = 500, code, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.name = "AppError";
    }
}
export function errorHandler(err, req, res, _next) {
    const requestId = req.requestId;
    logger.error("Unhandled error", {
        requestId,
        path: req.path,
        method: req.method,
        error: err
    });
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            requestId
        });
    }
    const message = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
    return res.status(500).json({
        error: message,
        requestId
    });
}
