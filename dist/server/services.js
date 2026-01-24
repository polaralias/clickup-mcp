import { ConnectionRepository } from "../infrastructure/repositories/ConnectionRepository.js";
import { SessionRepository } from "../infrastructure/repositories/SessionRepository.js";
import { AuthCodeRepository } from "../infrastructure/repositories/AuthCodeRepository.js";
import { ClientRepository } from "../infrastructure/repositories/ClientRepository.js";
import { UserConfigRepository } from "../infrastructure/repositories/UserConfigRepository.js";
import { ApiKeyRepository } from "../infrastructure/repositories/ApiKeyRepository.js";
import { EncryptionService } from "../application/security/EncryptionService.js";
import { PasswordService } from "../application/security/PasswordService.js";
import { ConnectionManager } from "../application/services/ConnectionManager.js";
import { SessionManager } from "../application/services/SessionManager.js";
import { AuthService } from "../application/services/AuthService.js";
export let connectionManager;
export let sessionManager;
export let authService;
export let clientRepository;
export let userConfigRepository;
export let apiKeyRepository;
export function initializeServices() {
    try {
        const encryptionService = new EncryptionService();
        const passwordService = new PasswordService();
        const connectionRepository = new ConnectionRepository();
        const sessionRepository = new SessionRepository();
        const authCodeRepository = new AuthCodeRepository();
        clientRepository = new ClientRepository();
        userConfigRepository = new UserConfigRepository();
        apiKeyRepository = new ApiKeyRepository();
        connectionManager = new ConnectionManager(connectionRepository, encryptionService);
        sessionManager = new SessionManager(sessionRepository, connectionManager, passwordService);
        authService = new AuthService(authCodeRepository, sessionManager);
    }
    catch (err) {
        console.error("Service initialization failed:", err);
        throw err; // Ensure we fail fast during startup
    }
}
import { getMasterKeyInfo } from "../application/security/masterKey.js";
export function ensureServices(req, res, next) {
    if (!connectionManager || !sessionManager || !authService) {
        const info = getMasterKeyInfo();
        if (info.status === 'missing') {
            return res.status(500).json({ error: "Server not configured: MASTER_KEY missing. Set MASTER_KEY in docker-compose environment or export it when running locally." });
        }
        else {
            return res.status(500).json({ error: "Server initialization failed. Check server logs for details." });
        }
    }
    next();
}
