import { Request, Response, NextFunction } from "express"
import { logger } from "../../infrastructure/logging/logger.js"

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = "AppError"
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.requestId

  logger.error("Unhandled error", {
    requestId,
    path: req.path,
    method: req.method,
    error: err
  })

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId
    })
  }

  const message =
    process.env.NODE_ENV === "production" ? "Internal server error" : err.message

  return res.status(500).json({
    error: message,
    requestId
  })
}
