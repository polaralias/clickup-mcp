import type { Express, Request, Response } from "express"
import { checkDatabaseHealth } from "../infrastructure/db/index.js"
import { getMasterKeyInfo } from "../application/security/masterKey.js"

type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy"
  version: string
  uptime: number
  checks: {
    database: { status: "up" | "down"; latencyMs?: number }
    encryption: { status: "configured" | "missing" }
  }
}

async function getHealthStatus(): Promise<HealthStatus> {
  const startDb = Date.now()
  const dbHealthy = await checkDatabaseHealth()
  const dbLatency = Date.now() - startDb

  const masterKeyInfo = getMasterKeyInfo()
  const encryptionConfigured = masterKeyInfo.status === "present"

  const allHealthy = dbHealthy && encryptionConfigured
  const anyDown = !dbHealthy

  return {
    status: anyDown ? "unhealthy" : allHealthy ? "healthy" : "degraded",
    version: "1.0.0",
    uptime: process.uptime(),
    checks: {
      database: {
        status: dbHealthy ? "up" : "down",
        latencyMs: dbHealthy ? dbLatency : undefined
      },
      encryption: {
        status: encryptionConfigured ? "configured" : "missing"
      }
    }
  }
}

export function registerHealthEndpoint(app: Express) {
  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  app.get("/health", async (_req: Request, res: Response) => {
    const health = await getHealthStatus()
    const statusCode = health.status === "unhealthy" ? 503 : 200
    res.status(statusCode).json(health)
  })

  app.get("/ready", async (_req: Request, res: Response) => {
    const health = await getHealthStatus()
    if (health.status === "unhealthy") {
      return res.status(503).json({ ready: false })
    }
    res.json({ ready: true })
  })
}
