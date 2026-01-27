import { getMasterKeyBytes } from "../application/security/masterKey.js"

export const config = {
    // Server
    port: Number(process.env.PORT ?? 3000),
    baseUrl: process.env.BASE_URL,
    isDev: process.env.NODE_ENV === "development",

    // Auth & Security
    // API Key Mode: "disabled" | "global" | "user_bound"
    // Default: "disabled" - requires explicit opt-in for API key authentication
    // Note: docker-compose.yml defaults to "user_bound" for demo purposes
    apiKeyMode: (process.env.API_KEY_MODE ?? "disabled") as "disabled" | "global" | "user_bound",
    masterKey: process.env.MASTER_KEY, // Raw value, use getMasterKeyBytes() for crypto operations

    // Turnstile (Optional)
    turnstile: {
        siteKey: process.env.TURNSTILE_SITE_KEY,
        secretKey: process.env.TURNSTILE_SECRET_KEY,
    },

    // Rate Limits
    rateLimits: {
        apiKeyIssue: {
            limit: Number(process.env.API_KEY_ISSUE_RATELIMIT ?? 3),
            windowMs: Number(process.env.API_KEY_ISSUE_WINDOW_SECONDS ?? 3600) * 1000,
        },
        mcpPerKey: {
            limit: Number(process.env.MCP_RATELIMIT_PER_KEY ?? 60),
            windowMs: Number(process.env.MCP_RATELIMIT_WINDOW_SECONDS ?? 60) * 1000,
        }
    },

    // Proxy settings
    // Default to '1' (trust first proxy), or set to 'true' to trust all, or specify IPs
    trustProxy: process.env.TRUST_PROXY ?? "1"
}

// Validation helper
export function validateConfig() {
    if (config.apiKeyMode === "user_bound") {
        try {
            getMasterKeyBytes() // Will throw if missing/invalid
        } catch (e) {
            throw new Error(`API_KEY_MODE=user_bound requires a valid MASTER_KEY. ${e instanceof Error ? e.message : ""}`)
        }
    }
}
