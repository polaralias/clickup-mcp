import { Router, json } from "express";
import { resolveTeamIdFromApiKey } from "../teamResolution.js";
import { connectionManager, sessionManager, authService, ensureServices } from "../services.js";
const router = Router();
router.use(json());
export { sessionManager };
// Connections
router.get("/connections", ensureServices, async (req, res) => {
    try {
        const list = await connectionManager.list();
        const safeList = list.map((c) => ({ ...c, encryptedSecrets: undefined }));
        res.json(safeList);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post("/connections", ensureServices, async (req, res) => {
    try {
        const input = req.body;
        if (!input.name || !input.config || !input.config.apiKey) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }
        if (!input.config.teamId) {
            try {
                input.config.teamId = await resolveTeamIdFromApiKey(input.config.apiKey);
            }
            catch (error) {
                res.status(400).json({ error: "Failed to resolve team ID: " + (error instanceof Error ? error.message : String(error)) });
                return;
            }
        }
        const connection = await connectionManager.create(input);
        res.status(201).json({ ...connection, encryptedSecrets: undefined });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get("/connections/:id", ensureServices, async (req, res) => {
    try {
        const connection = await connectionManager.get(req.params.id);
        if (!connection) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json({ ...connection, encryptedSecrets: undefined });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get("/connections/:id/sessions", ensureServices, async (req, res) => {
    try {
        const sessions = await sessionManager.listSessions(req.params.id);
        const safeSessions = sessions.map(s => ({
            id: s.id,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            revoked: s.revoked
        }));
        res.json(safeSessions);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete("/connections/:id", ensureServices, async (req, res) => {
    try {
        await connectionManager.delete(req.params.id);
        res.status(204).end();
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Sessions
router.post("/sessions", ensureServices, async (req, res) => {
    try {
        const { connectionId } = req.body;
        if (!connectionId) {
            res.status(400).json({ error: "connectionId is required" });
            return;
        }
        const result = await sessionManager.createSession(connectionId);
        res.status(201).json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post("/sessions/:id/revoke", ensureServices, async (req, res) => {
    try {
        await sessionManager.revokeSession(req.params.id);
        res.status(204).end();
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Auth
router.post("/auth/code", ensureServices, async (req, res) => {
    try {
        const { connectionId, redirectUri } = req.body;
        if (!connectionId) {
            res.status(400).json({ error: "connectionId is required" });
            return;
        }
        const code = await authService.generateCode(connectionId, redirectUri);
        res.json({ code });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post("/auth/token", ensureServices, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            res.status(400).json({ error: "code is required" });
            return;
        }
        // Support both snake_case (OAuth std) and camelCase
        const redirectUri = req.body.redirect_uri || req.body.redirectUri;
        // Also support code_verifier
        const codeVerifier = req.body.code_verifier || req.body.codeVerifier;
        const accessToken = await authService.exchangeCode(code, redirectUri, codeVerifier);
        res.json({ access_token: accessToken });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
export default router;
