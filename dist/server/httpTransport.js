import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createApplicationConfig } from "../application/config/applicationConfig.js";
import { extractSessionConfig } from "./sessionConfig.js";
import { authenticationMiddlewareVariant } from "./authentication.js";
import { SessionCache } from "../application/services/SessionCache.js";
import { sessionManager } from "./api/router.js";
import { PostgresSessionCache } from "../infrastructure/services/PostgresSessionCache.js";
import { CacheRepository } from "../infrastructure/repositories/CacheRepository.js";
import { resolveTeamIdFromApiKey } from "./teamResolution.js";
import { isMasterKeyConfigured } from "../application/security/masterKey.js";
export function registerHttpTransport(app, createServer) {
    const sessions = new Map();
    function removeSession(session) {
        if (!session.sessionId) {
            return;
        }
        const tracked = sessions.get(session.sessionId);
        if (tracked === session) {
            sessions.delete(session.sessionId);
        }
    }
    function createSession(configInput, credential, forcedSessionId) {
        const config = createApplicationConfig(configInput, credential.token);
        let sessionCache;
        if (isMasterKeyConfigured()) {
            sessionCache = new PostgresSessionCache(new CacheRepository(), config.hierarchyCacheTtlMs, config.spaceConfigCacheTtlMs);
        }
        else {
            sessionCache = new SessionCache(config.hierarchyCacheTtlMs, config.spaceConfigCacheTtlMs);
        }
        const server = createServer(config, sessionCache);
        let session;
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => forcedSessionId || randomUUID(),
            onsessioninitialized: (sessionId) => {
                session.sessionId = sessionId;
                sessions.set(sessionId, session);
            },
            onsessionclosed: (sessionId) => {
                if (session.sessionId === sessionId) {
                    sessions.delete(sessionId);
                }
            }
        });
        const connectPromise = server.connect(transport);
        session = {
            server,
            transport,
            connectPromise,
            closed: false,
            config,
            credential,
            sessionCache
        };
        transport.onclose = () => {
            if (!session.closed) {
                session.closed = true;
                removeSession(session);
                server.close().catch(() => undefined);
            }
        };
        return session;
    }
    async function ensureSession(req, res) {
        const header = req.headers["mcp-session-id"];
        const sessionId = Array.isArray(header) ? header[header.length - 1] : header;
        const credential = req.sessionCredential;
        if (sessionId) {
            const existing = sessions.get(sessionId);
            if (!existing) {
                res.status(404).json({
                    error: "Session not found"
                });
                return undefined;
            }
            if (credential) {
                if (existing.credential.token !== credential.token) {
                    res.status(401).json({
                        error: "Session credential mismatch"
                    });
                    return undefined;
                }
            }
            else {
                req.sessionCredential = existing.credential;
            }
            return existing;
        }
        if (!credential) {
            res.status(401).json({ error: "Authentication required" });
            return undefined;
        }
        if (sessionManager && credential.token) {
            try {
                const result = await sessionManager.validateSession(credential.token);
                if (result) {
                    const sessionId = result.session.id;
                    let existing = sessions.get(sessionId);
                    if (!existing) {
                        const configInput = result.config;
                        configInput.authSource = credential.source;
                        existing = createSession(configInput, credential, sessionId);
                    }
                    return existing;
                }
                else if (credential.source === "bearer") {
                    res.status(401).json({ error: "Invalid session token" });
                    return undefined;
                }
            }
            catch (error) {
                console.error("Error validating session:", error);
            }
        }
        const config = await extractSessionConfig(req, res);
        if (!config) {
            return undefined;
        }
        config.authSource = credential.source;
        try {
            if (!config.teamId && config.apiKey) {
                config.teamId = await resolveTeamIdFromApiKey(config.apiKey);
            }
            return createSession(config, credential);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error initializing server";
            const lower = errorMessage.toLowerCase();
            const isConfigError = ["teamid", "apikey", "invalid configuration", "missing"].some(k => lower.includes(k));
            const statusCode = isConfigError ? 400 : 500;
            res.status(statusCode).json({
                error: errorMessage
            });
            return undefined;
        }
    }
    const mcpHandler = async (req, res) => {
        // Normalize Accept header to meet StreamableHTTP transport requirements
        // The transport requires both application/json and text/event-stream to be literally present
        // Even though */* should cover everything, the SDK checks for explicit strings
        const accept = req.headers.accept || "";
        const hasJson = accept.includes("application/json");
        const hasStream = accept.includes("text/event-stream");
        if (!hasJson || !hasStream) {
            // If either is missing, set both explicitly
            req.headers.accept = "application/json, text/event-stream";
        }
        const session = await ensureSession(req, res);
        if (!session) {
            return;
        }
        try {
            await session.connectPromise;
            await session.transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            if (!res.headersSent) {
                res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
            }
            session.transport.close().catch(() => undefined);
        }
    };
    // Define authentication variants
    const defaultAuth = authenticationMiddlewareVariant();
    const oauthAuth = authenticationMiddlewareVariant('bearer');
    // Primary endpoint: The base URL itself handles everything automatically
    app.all("/", (req, res, next) => {
        const accept = req.headers.accept || "";
        // 1. Browser context? Serve Setup UI via static/authRouter
        if (req.method === "GET" && accept.includes("text/html")) {
            return next();
        }
        // 2. MCP context? Handle POST or SSE GET
        if (req.method === "POST" || accept.includes("text/event-stream")) {
            return defaultAuth(req, res, () => mcpHandler(req, res));
        }
        next();
    });
    // Fallback endpoint: /authorize handles UI flow and acts as an MCP fallback
    // Distinguish between MCP protocol and OAuth connection logic
    app.all("/authorize", (req, res, next) => {
        const accept = req.headers.accept || "";
        const isMcp = req.body?.jsonrpc === "2.0" || accept.includes("text/event-stream");
        // If it's a browser request for the UI
        if (req.method === "GET" && accept.includes("text/html") && !isMcp) {
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const authorizePath = join(__dirname, "../public/authorize.html");
            const fallbackPath = join(__dirname, "../public/connect.html");
            return res.sendFile(authorizePath, (err) => {
                if (err)
                    res.sendFile(fallbackPath);
            });
        }
        // If it's an MCP protocol request hitting the fallback endpoint
        if (isMcp) {
            return oauthAuth(req, res, () => mcpHandler(req, res));
        }
        // Otherwise (e.g. Connection creation POST), let authRouter handle it
        next();
    });
    // Legacy/Alias endpoints for compatibility
    app.all(["/mcp", "/oauth"], defaultAuth, (req, res) => mcpHandler(req, res));
}
