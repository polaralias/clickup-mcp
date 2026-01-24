export function createCorsOptions() {
    return {
        origin: "*",
        credentials: false,
        allowedHeaders: ["content-type", "mcp-session-id", "authorization"],
        exposedHeaders: ["mcp-session-id", "mcp-protocol-version", "WWW-Authenticate"],
        methods: ["GET", "POST", "OPTIONS"],
        preflightContinue: false
    };
}
