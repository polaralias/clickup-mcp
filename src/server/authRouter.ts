import { Router, json, urlencoded } from "express"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "fs"
import { randomBytes } from "node:crypto"
import rateLimit from "express-rate-limit"
import { connectionManager, authService, clientRepository, ensureServices } from "./services.js"
import { resolveTeamIdFromApiKey } from "./teamResolution.js"

const router = Router()
const __dirname = dirname(fileURLToPath(import.meta.url))

// Rate limiters
const connectLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many connection requests, please try again later."
})

const tokenLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many token requests, please try again later."
})

const registerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many registration requests, please try again later."
})

// Middleware for parsing body
router.use(json())
router.use(urlencoded({ extended: true }))

// POST /register (RFC 7591)
router.post("/register", registerLimiter, ensureServices, async (req, res) => {
    try {
        const { redirect_uris, client_name, token_endpoint_auth_method, grant_types, response_types, scope } = req.body

        if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
            return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris is required and must be a non-empty array" })
        }

        // Validate redirect URIs
        for (const uri of redirect_uris) {
            try {
                const url = new URL(uri)
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    console.warn(`[OAuth Rejection] Invalid protocol: uri=${uri}, client_name=${client_name}, ip=${req.ip}, path=${req.path}`)
                    return res.status(400).json({ error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" })
                }
                // Enforce allowlist if configured
                const allowlist = (process.env.REDIRECT_URI_ALLOWLIST || "").split(",").map(s => s.trim()).filter(s => s.length > 0)
                if (allowlist.length > 0) {
                    const mode = process.env.REDIRECT_URI_ALLOWLIST_MODE === "prefix" ? "prefix" : "exact"
                    let allowed = false
                    if (mode === "exact") {
                        allowed = allowlist.includes(uri)
                    } else {
                        allowed = allowlist.some(allowedUri => uri.startsWith(allowedUri))
                    }
                    if (!allowed) {
                        console.warn(`[OAuth Rejection] Redirect URI not in allowlist: uri=${uri}, client_name=${client_name}, ip=${req.ip}, path=${req.path}`)
                        return res.status(400).json({ error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" })
                    }
                }
            } catch {
                console.warn(`[OAuth Rejection] Invalid URI format: uri=${uri}, client_name=${client_name}, ip=${req.ip}, path=${req.path}`)
                return res.status(400).json({ error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" })
            }
        }

        const clientId = randomBytes(16).toString("hex")
        const authMethod = token_endpoint_auth_method || "none"

        await clientRepository.create({
            clientId,
            clientName: client_name,
            redirectUris: redirect_uris,
            tokenEndpointAuthMethod: authMethod
        })

        res.status(201).json({
            client_id: clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            token_endpoint_auth_method: authMethod,
            redirect_uris: redirect_uris,
            client_name: client_name
        })
    } catch (err) {
        res.status(500).json({ error: "server_error", error_description: (err as Error).message })
    }
})

// GET /connect
router.get("/connect", ensureServices, async (req, res) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query

    if (!client_id || typeof client_id !== "string") {
        return res.status(400).send("client_id is required")
    }

    const client = await clientRepository.get(client_id)
    if (!client) {
        return res.status(400).send("Invalid client_id")
    }

    if (!redirect_uri || typeof redirect_uri !== "string") {
        return res.status(400).send("Invalid or missing redirect_uri")
    }

    // Validate redirect_uri against registered client
    if (!client.redirectUris.includes(redirect_uri)) {
        console.warn(`[OAuth Rejection] Redirect URI not registered for client: uri=${redirect_uri}, client_id=${client_id}, ip=${req.ip}, path=${req.path}`)
        return res.status(400).json({ error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" })
    }

    if (!code_challenge || !code_challenge_method) {
        return res.status(400).send("Missing PKCE parameters")
    }
    if (code_challenge_method !== 'S256') {
        return res.status(400).send("Only S256 supported")
    }

    const csrfToken = randomBytes(16).toString("hex")
    res.cookie("csrf_token", csrfToken, { httpOnly: true, sameSite: "strict" })

    const htmlPath = join(__dirname, "../public/connect.html")
    let html = readFileSync(htmlPath, "utf-8")
    html = html.replace("{{CSRF_TOKEN}}", csrfToken)

    res.send(html)
})

// POST /connect
router.post("/connect", connectLimiter, ensureServices, async (req, res) => {
    try {
        const { client_id, name, config, redirect_uri, state, code_challenge, code_challenge_method, csrf_token } = req.body

        const cookieHeader = req.headers.cookie || ""
        const match = cookieHeader.match(/csrf_token=([^;]+)/)
        const cookieToken = match ? match[1] : null

        if (!cookieToken || !csrf_token || cookieToken !== csrf_token) {
            return res.status(403).json({ error: "Invalid CSRF token" })
        }

        // Validate inputs
        if (!name || !config || !config.apiKey) {
            return res.status(400).json({ error: "Missing required fields" })
        }

        if (!client_id || typeof client_id !== "string") {
            return res.status(400).json({ error: "client_id is required" })
        }

        const client = await clientRepository.get(client_id)
        if (!client) {
            return res.status(400).json({ error: "Invalid client_id" })
        }

        if (!redirect_uri || !client.redirectUris.includes(redirect_uri)) {
            console.warn(`[OAuth Rejection] Invalid or unregistered redirect URI: uri=${redirect_uri}, client_id=${client_id}, name=${name}, ip=${req.ip}, path=${req.path}`)
            return res.status(400).json({ error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" })
        }

        // Resolve Team ID if missing
        if (!config.teamId) {
            try {
                config.teamId = await resolveTeamIdFromApiKey(config.apiKey)
            } catch (error) {
                return res.status(400).json({ error: "Failed to resolve team ID: " + (error instanceof Error ? error.message : String(error)) })
            }
        }

        // Create Connection
        const connection = await connectionManager.create({ name, config })

        // Create Auth Code
        const code = await authService.generateCode(connection.id, redirect_uri, code_challenge, code_challenge_method, client_id)

        // Construct Redirect URL
        const url = new URL(redirect_uri)
        url.searchParams.set("code", code)
        if (state) url.searchParams.set("state", state)

        res.json({ redirectUrl: url.toString() })

    } catch (err) {
        res.status(500).json({ error: (err as Error).message })
    }
})

// POST /token
router.post("/token", tokenLimiter, ensureServices, async (req, res) => {
    try {
        const { grant_type, code, redirect_uri, code_verifier, client_id } = req.body

        if (grant_type !== "authorization_code") {
            // Optional check
        }

        if (!code || !code_verifier || !client_id) {
            return res.status(400).json({ error: "invalid_request", error_description: "Missing code, code_verifier, or client_id" })
        }

        const client = await clientRepository.get(client_id)
        if (!client) {
            return res.status(400).json({ error: "invalid_client", error_description: "Invalid client_id" })
        }

        const accessToken = await authService.exchangeCode(code, redirect_uri, code_verifier, client_id)

        // Determine expires_in
        const ttl = parseInt(process.env.TOKEN_TTL_SECONDS || "3600", 10)

        res.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: ttl
        })
    } catch (err) {
        res.status(400).json({ error: "invalid_grant", error_description: (err as Error).message })
    }
})

export default router
