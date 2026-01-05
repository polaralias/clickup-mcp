import { createHash, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export type SessionCredential = {
  token: string
  source: 'bearer' | 'apikey'
}

declare module "express-serve-static-core" {
  interface Request {
    sessionCredential?: SessionCredential
  }
}

function lastHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[value.length - 1]
  }
  return value
}

function extractBearerToken(headerValue: string | undefined) {
  if (!headerValue) {
    return undefined
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue)
  const token = match?.[1]?.trim()
  return token || undefined
}

function lastQueryString(value: unknown) {
  if (Array.isArray(value)) {
    return value[value.length - 1]
  }
  if (typeof value === "string") {
    return value
  }
  return undefined
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const hashA = createHash('sha256').update(a).digest()
  const hashB = createHash('sha256').update(b).digest()
  return timingSafeEqual(hashA, hashB)
}

import { config } from "./config.js"
import { apiKeyAuth } from "./middleware/apiKeyAuth.js"
import { unauthorizedJson } from "./oauthDiscovery.js"

export function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
  // If in user_bound mode, delegate to apiKeyAuth
  // But strictly, we might still want to support session continuation (mcp-session-id)
  // Logic: 
  // 1. Check Session ID (bypass)
  // 2. If user_bound: apiKeyAuth
  // 3. Else: Legacy logic

  const sessionHeader = lastHeaderValue(req.headers["mcp-session-id"])
  if (sessionHeader) {
    next()
    return
  }

  if (config.apiKeyMode === "user_bound") {
    // apiKeyAuth handles the response if it fails
    // We need to adapt it slightly because apiKeyAuth is async and this function is sync?
    // No, authenticationMiddleware is used as express middleware, so it can return promise/void.
    // However, apiKeyAuth expects (req, res, next).
    // We also need to set req.sessionCredential for httpTransport compatibility.

    // We wrap apiKeyAuth to inject sessionCredential on success
    apiKeyAuth(req, res, (err) => {
      if (err) return next(err)
      // If we are here, apiKeyAuth called next() successfully
      // req.userConfig is set.
      // We need to set req.sessionCredential
      // The token value doesn't matter much for user_bound as config is loaded from DB
      // But httpTransport checks for it.
      req.sessionCredential = {
        token: "user_bound_session",
        source: 'apikey'
      }
      next()
    }).catch(next)
    return
  }

  const authHeader = lastHeaderValue(req.headers.authorization)
  const bearerToken = extractBearerToken(authHeader)

  // 1. Check for Bearer token
  if (bearerToken) {
    req.sessionCredential = { token: bearerToken, source: 'bearer' }
    next()
    return
  }

  // 2. Check for Session ID (allows continuing existing sessions)
  // Moved to top for user_bound compatibility

  // 3. Check for API Key
  const apiKeyHeader = lastHeaderValue(req.headers["x-api-key"])
  const apiKeyQuery = lastQueryString((req.query as Record<string, unknown> | undefined)?.apiKey)
  const providedApiKey = (apiKeyHeader || apiKeyQuery)?.trim()

  if (providedApiKey) {
    const configuredKey = process.env.MCP_API_KEY
    const configuredKeys = process.env.MCP_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || []
    const allowedKeys = [configuredKey, ...configuredKeys].filter((k): k is string => !!k)

    if (allowedKeys.length > 0) {
      const isValid = allowedKeys.some(key => safeCompare(providedApiKey, key))
      if (isValid) {
        req.sessionCredential = { token: providedApiKey, source: 'apikey' }
        next()
        return
      }
      return unauthorizedJson(req, res, { error: "Invalid API key" })
    }

    // If no MCP_API_KEY/KEYS configured, we don't allow API key access by default
    // as we have nothing to validate against.
    return unauthorizedJson(req, res, { error: "API key authentication is not configured on this server" })
  }

  return unauthorizedJson(req, res, {
    error: "Authentication required. Provide 'Authorization: Bearer <token>' or 'x-api-key: <key>' header or 'apiKey' query parameter."
  })
}
