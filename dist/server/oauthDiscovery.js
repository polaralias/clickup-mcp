import { config } from "./config.js";
export function getBaseUrl(req) {
    const configured = process.env.PUBLIC_BASE_URL || config.baseUrl;
    if (configured && configured.startsWith("http"))
        return configured.replace(/\/+$/, "");
    const proto = req.headers["x-forwarded-proto"] || req.protocol;
    return `${proto}://${req.get("host")}`.replace(/\/+$/, "");
}
export function sendOAuthDiscovery401(req, res, message = "Unauthorized") {
    const baseUrl = getBaseUrl(req);
    const md = `${baseUrl}/.well-known/oauth-protected-resource`;
    res.setHeader("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${md}"`);
    res.status(401).json({ error: "Unauthorized", message });
}
// Backwards compatibility/Alias for the plan which used `unauthorizedJson`
export const unauthorizedJson = (req, res, body) => {
    const baseUrl = getBaseUrl(req);
    const md = `${baseUrl}/.well-known/oauth-protected-resource`;
    res.setHeader("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${md}"`);
    return res.status(401).json(body);
};
