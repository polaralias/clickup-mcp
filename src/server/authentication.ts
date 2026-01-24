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

function extractApiKey(req: Request) {
  // Headers
  const xApiKey = lastHeaderValue(req.headers["x-api-key"])
  const apiKeyHeader = lastHeaderValue(req.headers["api-key"])
  const xApiToken = lastHeaderValue(req.headers["x-api-token"])
  const apiTokenHeader = lastHeaderValue(req.headers["api-token"])

  // Authorization: Key <key>
  const authHeader = lastHeaderValue(req.headers.authorization)
  let authKey: string | undefined
  if (authHeader) {
    const match = /^Key\s+(.+)$/i.exec(authHeader)
    authKey = match?.[1]?.trim()
  }

  // Query Params
  const query = req.query as Record<string, unknown> | undefined
  const qApiKey = lastQueryString(query?.apiKey)
  const qApi_key = lastQueryString(query?.api_key)
  const qKey = lastQueryString(query?.key)
  const qApiToken = lastQueryString(query?.api_token)
  const qToken = lastQueryString(query?.token)

  return (xApiKey || apiKeyHeader || xApiToken || apiTokenHeader || authKey || qApiKey || qApi_key || qKey || qApiToken || qToken)?.trim()
}

export function authenticationMiddleware(req: Request, res: Response, next: NextFunction, allowedSource?: 'bearer' | 'apikey') {
  const sessionHeader = lastHeaderValue(req.headers["mcp-session-id"])
  if (sessionHeader) {
    next()
    return
  }

  const authHeader = lastHeaderValue(req.headers.authorization)
  const bearerToken = extractBearerToken(authHeader)
  const providedApiKey = extractApiKey(req)

  // 1. If explicit bearer required or provided
  if (bearerToken && (!allowedSource || allowedSource === 'bearer')) {
    req.sessionCredential = { token: bearerToken, source: 'bearer' }
    next()
    return
  }

  // 2. If explicit apikey required or provided
  if (providedApiKey && (!allowedSource || allowedSource === 'apikey')) {
    const configuredKey = process.env.MCP_API_KEY
    const configuredKeys = process.env.MCP_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || []
    const allowedKeys = [configuredKey, ...configuredKeys].filter((k): k is string => !!k)

    const isValidGlobal = allowedKeys.length > 0 && allowedKeys.some(key => safeCompare(providedApiKey, key))
    if (isValidGlobal) {
      req.sessionCredential = { token: providedApiKey, source: 'apikey' }
      next()
      return
    }

    if (config.apiKeyMode === "user_bound") {
      apiKeyAuth(req, res, (err: any) => {
        if (err) return next(err)
        req.sessionCredential = { token: providedApiKey, source: 'apikey' }
        next()
      }).catch(next)
      return
    }

    return unauthorizedJson(req, res, { error: "Invalid API key" })
  }

  // 3. Handle Fallback/Failure
  const apiKeyHint = "Headers: 'x-api-key', 'api-key', or 'Authorization: Key <key>'. Query: 'apiKey', 'api_key', or 'key'."

  if (allowedSource === 'bearer') {
    return unauthorizedJson(req, res, { error: "OAuth authentication required. Provide 'Authorization: Bearer <token>'." })
  }
  if (allowedSource === 'apikey') {
    return unauthorizedJson(req, res, { error: `API key authentication required. Supported methods: ${apiKeyHint}` })
  }

  const message = `Authentication required. Provide 'Authorization: Bearer <token>', or an API Key. ${apiKeyHint}`
  return unauthorizedJson(req, res, { error: message })
}
