import { randomBytes, createHash } from "node:crypto";
export class AuthService {
    authCodeRepo;
    sessionManager;
    constructor(authCodeRepo, sessionManager) {
        this.authCodeRepo = authCodeRepo;
        this.sessionManager = sessionManager;
    }
    async generateCode(connectionId, redirectUri, codeChallenge, codeChallengeMethod, clientId) {
        const code = randomBytes(16).toString("hex"); // 32 chars
        const codeHash = createHash("sha256").update(code).digest("hex");
        const ttl = parseInt(process.env.CODE_TTL_SECONDS || "90", 10);
        const expiresAt = new Date(Date.now() + ttl * 1000);
        await this.authCodeRepo.create({
            code: codeHash,
            connectionId,
            expiresAt,
            redirectUri,
            codeChallenge,
            codeChallengeMethod,
            clientId
        });
        return code;
    }
    async exchangeCode(code, redirectUri, codeVerifier, clientId) {
        const codeHash = createHash("sha256").update(code).digest("hex");
        const authCode = await this.authCodeRepo.get(codeHash);
        if (!authCode) {
            throw new Error("Invalid authorization code");
        }
        if (authCode.expiresAt < new Date()) {
            await this.authCodeRepo.delete(codeHash);
            throw new Error("Authorization code expired");
        }
        // Verify clientId if one was associated with the code
        if (authCode.clientId) {
            if (!clientId) {
                throw new Error("Missing client_id");
            }
            if (authCode.clientId !== clientId) {
                throw new Error("Invalid client_id");
            }
        }
        // Verify redirectUri if one was associated with the code
        if (authCode.redirectUri) {
            if (!redirectUri) {
                throw new Error("Missing redirect_uri");
            }
            if (authCode.redirectUri !== redirectUri) {
                throw new Error("Invalid redirect_uri");
            }
        }
        // PKCE Verification
        if (authCode.codeChallenge) {
            if (!codeVerifier) {
                throw new Error("Missing code_verifier");
            }
            if (authCode.codeChallengeMethod === "S256") {
                const hash = createHash("sha256")
                    .update(codeVerifier)
                    .digest("base64url");
                if (hash !== authCode.codeChallenge) {
                    throw new Error("Invalid code_verifier");
                }
            }
            else {
                // Fallback for 'plain'
                if (codeVerifier !== authCode.codeChallenge) {
                    throw new Error("Invalid code_verifier");
                }
            }
        }
        // One-time use: delete immediately
        await this.authCodeRepo.delete(codeHash);
        // Create session
        const { accessToken } = await this.sessionManager.createSession(authCode.connectionId);
        return accessToken;
    }
}
