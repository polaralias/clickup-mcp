import { createHash } from "crypto";
import { apiKeyRepository, userConfigRepository } from "../services.js";
import { config } from "../config.js";
import { sendOAuthDiscovery401 } from "../oauthDiscovery.js";
export async function apiKeyAuth(req, res, next) {
    if (config.apiKeyMode !== "user_bound") {
        return next();
    }
    // Extract key
    let key = req.headers["x-api-key"];
    if (!key && req.headers.authorization?.startsWith("Bearer ")) {
        key = req.headers.authorization.slice(7);
    }
    if (!key) {
        return sendOAuthDiscovery401(req, res, "Unauthorized: Missing API Key");
    }
    try {
        const keyHash = createHash("sha256").update(key).digest("hex");
        const apiKey = await apiKeyRepository.findByHash(keyHash);
        if (!apiKey) {
            console.log(JSON.stringify({
                event: "auth_failure",
                reason: "invalid_key",
                timestamp: new Date().toISOString(),
                path: req.path,
                requester_ip: req.ip
            }));
            return sendOAuthDiscovery401(req, res, "Unauthorized: Invalid API Key");
        }
        // Check for expiration (30 days inactivity)
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const lastActivity = apiKey.last_used_at || apiKey.created_at;
        const now = new Date();
        if (now.getTime() - lastActivity.getTime() > THIRTY_DAYS_MS) {
            console.log(JSON.stringify({
                event: "auth_failure",
                reason: "key_expired",
                timestamp: now.toISOString(),
                path: req.path,
                requester_ip: req.ip,
                api_key_id: apiKey.id,
                last_activity: lastActivity.toISOString()
            }));
            return sendOAuthDiscovery401(req, res, "Unauthorized: API Key expired due to 30 days of inactivity");
        }
        const userConfig = await userConfigRepository.getById(apiKey.user_config_id);
        if (!userConfig) {
            console.log(JSON.stringify({
                event: "auth_failure",
                reason: "config_missing",
                timestamp: new Date().toISOString(),
                path: req.path,
                requester_ip: req.ip,
                api_key_id: apiKey.id
            }));
            return sendOAuthDiscovery401(req, res, "Unauthorized: Configuration not found");
        }
        // Decrypt config
        // We need to access encryption service. connectionManager has it private...
        // But we instantiated EncryptionService in services.ts.
        // Ideally we should export encryptionService from services.ts.
        // For now, I will assume I can modify services.ts to export it or instantiate a new one (not ideal)
        // Actually, I can use the connectionManager's encryption service if exposed, or just export it.
        // I'll update services.ts to export encryptionService in a separate step or fix it now.
        // Wait, in my previous step I didn't export encryptionService.
        // I will use a quick hack or fixing services.ts is better.
        // Let's assume I will fix services.ts to export encryptionService.
        // ...
        // Actually, I can just import EncryptionService and instantiate it. It's stateless except for the key which it gets from env.
        const { EncryptionService } = await import("../../application/security/EncryptionService.js");
        const encryptionService = new EncryptionService();
        const configJson = encryptionService.decrypt(userConfig.config_enc);
        req.userConfig = JSON.parse(configJson);
        req.apiKeyId = apiKey.id;
        // Async record usage (don't await)
        void apiKeyRepository.recordUsage(apiKey.id, req.ip);
        next();
    }
    catch (err) {
        console.error(JSON.stringify({
            event: "auth_failure",
            timestamp: new Date().toISOString(),
            path: req.path,
            requester_ip: req.ip,
            error: err instanceof Error ? err.message : "Unknown error"
        }));
        return sendOAuthDiscovery401(req, res, "Unauthorized: Authentication failed");
    }
}
