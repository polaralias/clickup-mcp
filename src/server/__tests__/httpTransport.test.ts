import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction, Express } from "express"
import { registerHttpTransport } from "../httpTransport.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApplicationConfig } from "../../application/config/applicationConfig.js"
import { config } from "../config.js"

type TransportInstance = {
  sessionId?: string
  handleRequest: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

const transportInstances: TransportInstance[] = []

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => {
  class MockTransport {
    options: any
    sessionId?: string
    handleRequest: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    onclose?: () => void

    constructor(options: any) {
      this.options = options
      this.handleRequest = vi.fn(async (_req: Request, _res: Response) => {
        if (!this.sessionId) {
          this.sessionId = this.options.sessionIdGenerator()
          this.options.onsessioninitialized?.(this.sessionId)
        }
      })
      this.close = vi.fn(async () => {
        if (this.sessionId) {
          this.options.onsessionclosed?.(this.sessionId)
        }
      })
      transportInstances.push(this)
    }
  }

  return { StreamableHTTPServerTransport: MockTransport }
})

type Handler = (req: Request, res: Response, next: NextFunction) => unknown
type MutableRequest = Request & { sessionCredential?: { token: string } }

describe("registerHttpTransport", () => {
  beforeEach(() => {
    transportInstances.length = 0
    process.env.MCP_API_KEY = "token-123"
    process.env.MCP_API_KEYS = "pk_456"
      ; (config as any).apiKeyMode = "global"
  })

  it("reuses an existing session when the request lacks authorization but includes the session id", async () => {
    const handlers: Handler[] = []
    const app = {
      all: vi.fn((_path: string, ...routeHandlers: Handler[]) => {
        handlers.push(...routeHandlers)
      })
    } as unknown as Express

    const connect = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)

    const createServer = vi.fn((_config: ApplicationConfig) => ({
      connect,
      close
    }) as unknown as McpServer)

    registerHttpTransport(app, createServer)

    expect(app.all).toHaveBeenCalled()
    // 2 handlers for /mcp and 1 for /
    expect(handlers).toHaveLength(3)

    const [authMiddleware, routeHandler] = handlers

    const initialReq = {
      headers: {
        authorization: "Bearer token-123",
        accept: "application/json"
      },
      query: { teamId: "team_1", apiKey: "token-123" },
      body: {},
      protocol: "http",
      get: (name: string) => name === "host" ? "localhost" : undefined
    } as unknown as MutableRequest
    const initialRes = createResponse()
    const next = vi.fn()

    authMiddleware(initialReq, initialRes, next)
    expect(next).toHaveBeenCalledOnce()

    await routeHandler(initialReq, initialRes, vi.fn())

    expect(transportInstances).toHaveLength(1)
    const sessionId = transportInstances[0].sessionId
    expect(sessionId).toBeDefined()
    expect(createServer).toHaveBeenCalledTimes(1)

    const followupReq = {
      headers: {
        "mcp-session-id": sessionId,
        accept: "application/json"
      },
      protocol: "http",
      get: (name: string) => name === "host" ? "localhost" : undefined
    } as unknown as MutableRequest
    const followupRes = createResponse()
    const followupNext = vi.fn()

    authMiddleware(followupReq, followupRes, followupNext)
    expect(followupNext).toHaveBeenCalledOnce()

    await routeHandler(followupReq, followupRes, vi.fn())

    expect(createServer).toHaveBeenCalledTimes(1)
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(2)
    expect(followupReq.sessionCredential?.token).toBe("token-123")
  })

  it("creates a session using the apiKey from the request when Authorization is absent", async () => {
    const handlers: Handler[] = []
    const app = {
      all: vi.fn((_path: string, ...routeHandlers: Handler[]) => {
        handlers.push(...routeHandlers)
      })
    } as unknown as Express

    const connect = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)

    const createServer = vi.fn((_config: ApplicationConfig) => ({
      connect,
      close
    }) as unknown as McpServer)

    registerHttpTransport(app, createServer)

    const [authMiddleware, routeHandler] = handlers

    const initialReq = {
      headers: {
        accept: "application/json"
      },
      query: { teamId: "team_1", apiKey: "pk_456" },
      body: {},
      protocol: "http",
      get: (name: string) => name === "host" ? "localhost" : undefined
    } as unknown as MutableRequest
    const initialRes = createResponse()
    const next = vi.fn()

    authMiddleware(initialReq, initialRes, next)
    expect(next).toHaveBeenCalledOnce()
    expect(initialReq.sessionCredential?.token).toBe("pk_456")

    await routeHandler(initialReq, initialRes, vi.fn())

    expect(createServer).toHaveBeenCalledTimes(1)
    expect(transportInstances).toHaveLength(1)
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(1)
  })
})

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    status(this: Response, code: number) {
      this.statusCode = code
      return this
    },
    json(this: Response, body: unknown) {
      this.headersSent = true
      return body
    },
    setHeader: vi.fn(),
    end: vi.fn()
  } as unknown as Response
}
