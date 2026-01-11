import { randomUUID } from "node:crypto"
import type { Express, Request, Response } from "express"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApplicationConfig, SessionConfigInput } from "../application/config/applicationConfig.js"
import { createApplicationConfig } from "../application/config/applicationConfig.js"
import { extractSessionConfig } from "./sessionConfig.js"
import { authenticationMiddleware, type SessionCredential } from "./authentication.js"
import { SessionCache } from "../application/services/SessionCache.js"
import { sessionManager } from "./api/router.js"
import { PostgresSessionCache } from "../infrastructure/services/PostgresSessionCache.js"
import { CacheRepository } from "../infrastructure/repositories/CacheRepository.js"
import { resolveTeamIdFromApiKey } from "./teamResolution.js"

type Session = {
  server: McpServer
  transport: StreamableHTTPServerTransport
  connectPromise: Promise<void>
  sessionId?: string
  closed: boolean
  config: ApplicationConfig
  credential: SessionCredential
  sessionCache: SessionCache
}

export function registerHttpTransport(
  app: Express,
  createServer: (config: ApplicationConfig, sessionCache: SessionCache) => McpServer
) {
  const sessions = new Map<string, Session>()

  function removeSession(session: Session) {
    if (!session.sessionId) {
      return
    }
    const tracked = sessions.get(session.sessionId)
    if (tracked === session) {
      sessions.delete(session.sessionId)
    }
  }

  function createSession(configInput: SessionConfigInput, credential: SessionCredential, forcedSessionId?: string) {
    const config = createApplicationConfig(configInput, credential.token)
    let sessionCache: SessionCache
    if (process.env.MASTER_KEY) {
      sessionCache = new PostgresSessionCache(new CacheRepository(), config.hierarchyCacheTtlMs, config.spaceConfigCacheTtlMs)
    } else {
      sessionCache = new SessionCache(config.hierarchyCacheTtlMs, config.spaceConfigCacheTtlMs)
    }
    const server = createServer(config, sessionCache)
    let session: Session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => forcedSessionId || randomUUID(),
      onsessioninitialized: (sessionId) => {
        session.sessionId = sessionId
        sessions.set(sessionId, session)
      },
      onsessionclosed: (sessionId) => {
        if (session.sessionId === sessionId) {
          sessions.delete(sessionId)
        }
      }
    })
    const connectPromise = server.connect(transport)
    session = {
      server,
      transport,
      connectPromise,
      closed: false,
      config,
      credential,
      sessionCache
    }
    transport.onclose = () => {
      if (!session.closed) {
        session.closed = true
        removeSession(session)
        server.close().catch(() => undefined)
      }
    }
    return session
  }

  async function ensureSession(req: Request, res: Response) {
    const header = req.headers["mcp-session-id"]
    const sessionId = Array.isArray(header) ? header[header.length - 1] : header
    const credential = req.sessionCredential

    if (sessionId) {
      const existing = sessions.get(sessionId)
      if (!existing) {
        res.status(404).json({
          error: "Session not found"
        })
        return undefined
      }

      if (credential) {
        if (existing.credential.token !== credential.token) {
          res.status(401).json({
            error: "Session credential mismatch"
          })
          return undefined
        }
      } else {
        req.sessionCredential = existing.credential
      }

      return existing
    }

    if (!credential) {
      res.status(401).json({ error: "Authentication required" })
      return undefined
    }

    if (sessionManager && credential.token) {
      try {
        const result = await sessionManager.validateSession(credential.token)
        if (result) {
          const sessionId = result.session.id
          let existing = sessions.get(sessionId)
          if (!existing) {
            const configInput = result.config as SessionConfigInput
            configInput.authSource = credential.source
            existing = createSession(configInput, credential, sessionId)
          }
          return existing
        } else if (credential.source === "bearer") {
          res.status(401).json({ error: "Invalid session token" })
          return undefined
        }
      } catch (error) {
        console.error("Error validating session:", error)
      }
    }

    const config = await extractSessionConfig(req, res)
    if (!config) {
      return undefined
    }
    config.authSource = credential.source
    try {
      if (!config.teamId && config.apiKey) {
        config.teamId = await resolveTeamIdFromApiKey(config.apiKey)
      }

      return createSession(config, credential)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error initializing server"
      const lower = errorMessage.toLowerCase()
      const isConfigError = ["teamid", "apikey", "invalid configuration", "missing"].some(k => lower.includes(k))
      const statusCode = isConfigError ? 400 : 500
      res.status(statusCode).json({
        error: errorMessage
      })
      return undefined
    }
  }

  const mcpHandler = async (req: Request, res: Response) => {
    // Normalize Accept header to meet StreamableHTTP transport requirements
    // The transport requires both application/json and text/event-stream to be literally present
    // Even though */* should cover everything, the SDK checks for explicit strings
    const accept = req.headers.accept || ""
    const hasJson = accept.includes("application/json")
    const hasStream = accept.includes("text/event-stream")
    if (!hasJson || !hasStream) {
      // If either is missing, set both explicitly
      req.headers.accept = "application/json, text/event-stream"
    }

    const session = await ensureSession(req, res)
    if (!session) {
      return
    }

    try {
      await session.connectPromise
      await session.transport.handleRequest(req, res, req.body)
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" })
      }
      session.transport.close().catch(() => undefined)
    }
  }

  app.all("/mcp", authenticationMiddleware, mcpHandler)

  // Also handle root for clients that only have the base URL
  // We only intercept if it looks like an SSE request (Accept header includes text/event-stream)
  // or if it's a POST request (which index.html doesn't handle)
  app.all("/", (req, res, next) => {
    const accept = req.headers.accept || ""
    if (accept.includes("text/event-stream") || req.method === "POST") {
      return authenticationMiddleware(req, res, () => mcpHandler(req, res))
    }
    next()
  })
}
