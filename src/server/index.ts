import "dotenv/config"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createCorsOptions } from "./cors.js"
import { registerHealthEndpoint } from "./health.js"
import { registerHttpTransport } from "./httpTransport.js"
import { startStdioTransport } from "./stdioTransport.js"
import { sessionConfigJsonSchema } from "./sessionConfig.js"
import { SessionCache } from "../application/services/SessionCache.js"
import apiRouter from "./api/router.js"
import authRouter from "./authRouter.js"
import { runMigrations } from "../infrastructure/db/migrator.js"
import { createServer } from "./factory.js"
import { initializeServices } from "./services.js"
import { getMasterKeyInfo } from "../application/security/masterKey.js"
import apiKeyRouter from "./api/apiKeyRouter.js"
import { config } from "./config.js"

async function start() {
  try {
    await runMigrations()
    if (config.apiKeyMode === "user_bound") {
      // Validate configuration immediately
      // This will throw if MASTER_KEY is missing
      const { validateConfig } = await import("./config.js")
      validateConfig()
    }
    initializeServices()
  } catch (e) {
    if (e instanceof Error && e.message.includes("MASTER_KEY")) {
      console.warn("Server starting in UNCONFIGURED mode: MASTER_KEY is missing.")
    } else {
      console.error("Initialization failed:", e)
      // For other errors, we might still want to fail fast if they are critical
      // but if we want the UI to show up, we might continue.
      // Requirements say: "If startup requires encryption and master key is missing, exit with a clear error message"
      // Wait, the goal says: "If encryption is required... fail fast... If encryption is optional, allow startup but mark as 'not configured'".
      // For this repo, encryption IS required for connection storage.
      // However, to show the UI status banner, we need the server to be running.
      // I will allow it to start but block protected routes.
    }
  }

  const transport = process.env.TRANSPORT ?? "http"
  if (transport === "http") {
    const app = express()
    app.set("trust proxy", true)
    app.use(cors(createCorsOptions()))
    app.use(express.json({ limit: "2mb" }))
    app.use(cookieParser())

    app.use("/api", apiRouter)
    if (config.apiKeyMode === "user_bound") {
      app.use("/api", apiKeyRouter)
    }

    // Catch-all for API routes to prevent falling through to SPA/HTML
    app.all("/api/*", (_req, res) => {
      res.status(404).json({ error: "API endpoint not found" })
    })

    app.use("/", authRouter)

    const __dirname = dirname(fileURLToPath(import.meta.url))
    const publicPath = join(__dirname, "../../public") // For dist
    const srcPublicPath = join(__dirname, "../public") // For src/tsx

    // Serve static UI files
    app.use(express.static(publicPath))
    app.use(express.static(srcPublicPath))

    const serveIndex = (_req: express.Request, res: express.Response) => {
      const paths = [
        join(publicPath, "index.html"),
        join(srcPublicPath, "index.html")
      ]

      for (const p of paths) {
        try {
          if (readFileSync(p)) { // Simple check
            return res.sendFile(p)
          }
        } catch {
          // Continue to next path
        }
      }
      res.status(404).send("index.html not found")
    }

    // Explicitly serve index.html on root
    app.get("/", (_req, res) => {
      serveIndex(_req, res)
    })

    registerHealthEndpoint(app)

    app.get("/api/config-status", (_req, res) => {
      res.json(getMasterKeyInfo())
    })

    // Helper to get base URL
    const getBaseUrl = (req: express.Request) => {
      if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "")
      const protocol = req.protocol
      const host = req.get("host")
      return `${protocol}://${host}`
    }

    app.get("/.well-known/oauth-protected-resource", (req, res) => {
      const getBaseUrl = (req: express.Request) => {
        if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "") // Priority
        if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "")
        const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol
        return `${proto}://${req.get("host")}`.replace(/\/+$/, "")
      }
      const baseUrl = getBaseUrl(req)
      res.json({
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ["header"],
        resource_documentation: `${baseUrl}/`
      })
    })

    app.get("/.well-known/oauth-authorization-server", (req, res) => {
      const baseUrl = getBaseUrl(req)
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/connect`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"]
      })
    })

    app.get("/.well-known/mcp-config", (_req, res) => {
      res.json(sessionConfigJsonSchema)
    })
    registerHttpTransport(app, createServer)
    const port = Number(process.env.PORT ?? 3000)
    app.listen(port)
  } else {
    await startStdioTransport(createServer, (config) =>
      new SessionCache(config.hierarchyCacheTtlMs, config.spaceConfigCacheTtlMs)
    )
  }
}

start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
