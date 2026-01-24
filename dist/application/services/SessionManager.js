import { randomUUID, randomBytes } from "node:crypto";
export class SessionManager {
    sessionRepo;
    connectionManager;
    passwordService;
    constructor(sessionRepo, connectionManager, passwordService) {
        this.sessionRepo = sessionRepo;
        this.connectionManager = connectionManager;
        this.passwordService = passwordService;
    }
    async createSession(connectionId) {
        const connection = await this.connectionManager.get(connectionId);
        if (!connection) {
            throw new Error("Connection not found");
        }
        const sessionId = randomUUID();
        const secret = randomBytes(32).toString("hex"); // 64 chars
        const accessToken = `${sessionId}:${secret}`;
        // Hash the secret
        const tokenHash = await this.passwordService.hash(secret);
        const ttlSeconds = parseInt(process.env.TOKEN_TTL_SECONDS || "3600", 10);
        const session = {
            id: sessionId,
            connectionId,
            tokenHash,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            revoked: false
        };
        await this.sessionRepo.create(session);
        return { session, accessToken };
    }
    async validateSession(accessToken) {
        const parts = accessToken.split(":");
        if (parts.length !== 2)
            return null;
        const [sessionId, secret] = parts;
        const session = await this.sessionRepo.getById(sessionId);
        if (!session)
            return null;
        if (session.revoked)
            return null;
        if (session.expiresAt < new Date())
            return null;
        const isValid = await this.passwordService.verify(secret, session.tokenHash);
        if (!isValid)
            return null;
        const connection = await this.connectionManager.get(session.connectionId);
        if (!connection)
            return null;
        const secrets = await this.connectionManager.getSecrets(connection);
        const fullConfig = { ...connection.config, ...secrets };
        return { session, config: fullConfig };
    }
    async revokeSession(sessionId) {
        await this.sessionRepo.revoke(sessionId);
    }
    async listSessions(connectionId) {
        return this.sessionRepo.listByConnectionId(connectionId);
    }
}
