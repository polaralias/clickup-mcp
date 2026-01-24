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

export function authenticationMiddlewareVariant(allowedSource?: 'bearer' | 'apikey') {
  return (req: Request, res: Response, next: NextFunction) => {
    authenticationMiddleware(req, res, next, allowedSource)
  }
}

export function authenticationMiddleware(req: Request, res: Response, next: NextFunction, allowedSource?: 'bearer' | 'apikey') {
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
    // If we only allow bearer (OAuth) and we are in user_bound mode,
    // we should still allow OAuth if we have a session manager.
    // However, user_bound mode usually means everything is an API key.
    // But the requirements say /oauth should be for OAuth.
    
    // If allowedSource is 'bearer', we should SKIP apiKeyAuth and look for Bearer token.
    if (allowedSource === 'apikey') {
      // Proceed to apiKeyAuth
    } else if (allowedSource === 'bearer') {
      // Proceed to bearer check
      const authHeader = lastHeaderValue(req.headers.authorization)
      const bearerToken = extractBearerToken(authHeader)
      if (bearerToken) {
        req.sessionCredential = { token: bearerToken, source: 'bearer' }
        next()
        return
      }
      return unauthorizedJson(req, res, { error: "OAuth authentication required at this endpoint. Provide 'Authorization: Bearer <token>'." })
    }
    
    // Default or 'apikey'
    apiKeyAuth(req, res, (err) => {
      if (err) return next(err)
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
  if (bearerToken && (!allowedSource || allowedSource === 'bearer')) {
    req.sessionCredential = { token: bearerToken, source: 'bearer' }
    next()
    return
  }

  // 3. Check for API Key
  const apiKeyHeader = lastHeaderValue(req.headers["x-api-key"])
  const apiKeyQuery = lastQueryString((req.query as Record<string, unknown> | undefined)?.apiKey)
  const providedApiKey = (apiKeyHeader || apiKeyQuery)?.trim()

  if (providedApiKey && (!allowedSource || allowedSource === 'apikey')) {
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

    return unauthorizedJson(req, res, { error: "API key authentication is not configured on this server" })
  }

  const message = allowedSource === 'bearer' 
    ? "OAuth authentication required. Provide 'Authorization: Bearer <token>' header."
    : allowedSource === 'apikey' 
    ? "API key authentication required. Provide 'x-api-key' header or 'apiKey' query parameter."
    : "Authentication required. Provide 'Authorization: Bearer <token>' or 'x-api-key: <key>' header or 'apiKey' query parameter."

  return unauthorizedJson(req, res, { error: message })
}
