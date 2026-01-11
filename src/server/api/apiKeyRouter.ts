import { Router } from "express"
import { randomBytes, createHash } from "crypto"
import rateLimit from "express-rate-limit"
import { config } from "../config.js"
import { clickupSchema } from "../schemas/clickup.js"
import { userConfigRepository, apiKeyRepository } from "../services.js"
import { EncryptionService } from "../../application/security/EncryptionService.js"
import { getMasterKeyInfo } from "../../application/security/masterKey.js"

const router = Router()
const encryptionService = new EncryptionService()

// Use ClickUp schema for this server
// In a multi-server setup, this might be dynamic or configured
const activeSchema = clickupSchema

const issuanceLimiter = rateLimit({
    windowMs: config.rateLimits.apiKeyIssue.windowMs,
    max: config.rateLimits.apiKeyIssue.limit,
    message: "Too many API keys issued from this IP, please try again later."
})

// GET /api/config-schema
// Returns the schema for the frontend to render
router.get("/config-schema", (req, res) => {
    if (config.apiKeyMode !== "user_bound") {
        return res.status(404).json({ error: "Not in user_bound mode" })
    }

    // Return schema without validation logic
    const { validate, ...schemaJson } = activeSchema
    res.json(schemaJson)
})

// POST /api/api-keys
// Issues a new API Key
router.post("/api-keys", issuanceLimiter, async (req, res) => {
    if (config.apiKeyMode !== "user_bound") {
        return res.status(503).json({ error: "API Key provisioning is disabled" })
    }

    try {
        const userConfig = req.body

        // Validate config
        const validation = activeSchema.validate(userConfig)
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error })
        }

        // TODO: Verify Turnstile if configured

        // Encrypt config
        const configStr = JSON.stringify(userConfig)
        const configEnc = encryptionService.encrypt(configStr)
        const configFingerprint = createHash("sha256").update(configStr).digest("hex")

        // Store User Config
        // Check if fingerprint exists to dedupe? 
        // For now, always create new to allow rotation/updates without affecting others
        const savedConfig = await userConfigRepository.create({
            serverId: activeSchema.id,
            configEnc,
            fingerprint: configFingerprint
        })

        // Generate API Key
        // Format: mcp_sk_<random>
        const random = randomBytes(32).toString("hex")
        const rawKey = `mcp_sk_${random}`
        const keyHash = createHash("sha256").update(rawKey).digest("hex")

        // Store API Key
        const newKey = await apiKeyRepository.create({
            userConfigId: savedConfig.id,
            keyHash,
            ip: req.ip
        })

        console.log(JSON.stringify({
            event: "api_key_issued",
            timestamp: new Date().toISOString(),
            path: req.path,
            requester_ip: req.ip,
            server_id: savedConfig.server_id,
            api_key_id: newKey.id,
            user_config_id: savedConfig.id
        }))

        // Return key ONCE
        res.json({
            apiKey: rawKey,
            instructions: "Include this key in the 'Authorization: Bearer <key>' header or 'X-API-Key' header."
        })

    } catch (err) {
        console.error("Failed to issue API Key:", err)
        res.status(500).json({ error: "Internal Server Error" })
    }
})

// GET /api/config-status
// Returns the status of the master encryption key
router.get("/config-status", (req, res) => {
    res.json(getMasterKeyInfo())
})

export default router
