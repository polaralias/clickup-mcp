import { Request, Response, NextFunction } from "express"
import { randomUUID } from "crypto"
import { logger } from "../../infrastructure/logging/logger.js"
import { incrementCounter, recordHistogram } from "../../infrastructure/metrics/metrics.js"

declare global {
  namespace Express {
    interface Request {
      requestId?: string
      startTime?: number
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID()
  req.startTime = Date.now()

  res.on("finish", () => {
    const duration = Date.now() - (req.startTime ?? Date.now())
    const labels = {
      method: req.method,
      path: req.path,
      status: String(res.statusCode)
    }

    incrementCounter("http_requests_total", labels)
    recordHistogram("http_request_duration_ms", duration, labels)

    logger.info("request", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get("user-agent"),
      ip: req.ip,
      apiKeyId: req.apiKeyId
    })
  })

  next()
}
