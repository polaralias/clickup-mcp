import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock config before importing the middleware
vi.mock("../config.js", () => ({
  config: {
    apiKeyMode: "disabled"
  }
}))

import { config } from "../config.js"
import { authenticationMiddleware } from "../authentication.js"

function createResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis()
  } as unknown as Response
  return res
}

describe("authenticationMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MCP_API_KEY
    delete process.env.MCP_API_KEYS
      ; (config as any).apiKeyMode = "disabled"
  })

  it("attaches the bearer token to the request", () => {
    const req = { headers: { authorization: "Bearer test-token" }, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential?.token).toBe("test-token")
    expect(req.sessionCredential?.source).toBe("bearer")
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it("rejects requests without any auth when no keys configured", () => {
    const req = { headers: {}, query: {}, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("Authentication required") }))
  })

  it("rejects API key if server has no keys configured", () => {
    ; (config as any).apiKeyMode = "global"
    const req = { headers: {}, query: { apiKey: "pk_123" }, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("not configured") }))
  })

  it("allows API key from query if it matches MCP_API_KEY", () => {
    ; (config as any).apiKeyMode = "global"
    process.env.MCP_API_KEY = "pk_123"
    const req = { headers: {}, query: { apiKey: "pk_123" }, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential?.token).toBe("pk_123")
    expect(req.sessionCredential?.source).toBe("apikey")
    expect(next).toHaveBeenCalledOnce()
  })

  it("allows API key from x-api-key header if it matches MCP_API_KEY", () => {
    ; (config as any).apiKeyMode = "global"
    process.env.MCP_API_KEY = "pk_123"
    const req = { headers: { "x-api-key": "pk_123" }, query: {}, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential?.token).toBe("pk_123")
    expect(next).toHaveBeenCalledOnce()
  })

  it("rejects API key if it does not match MCP_API_KEY", () => {
    ; (config as any).apiKeyMode = "global"
    process.env.MCP_API_KEY = "secret"
    const req = { headers: {}, query: { apiKey: "wrong" }, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid API key" })
  })

  it("allows API key if it matches one of MCP_API_KEYS", () => {
    ; (config as any).apiKeyMode = "global"
    process.env.MCP_API_KEYS = "key1, key2 ,key3"
    const req = { headers: { "x-api-key": "key2" }, query: {}, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential?.token).toBe("key2")
    expect(next).toHaveBeenCalledOnce()
  })

  it("allows requests that include a session header", () => {
    const req = { headers: { "mcp-session-id": "session-123" }, query: {}, protocol: "http", get: () => "localhost" } as unknown as Request
    const res = createResponse()
    const next = vi.fn()

    authenticationMiddleware(req, res, next)

    expect(req.sessionCredential).toBeUndefined()
    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
