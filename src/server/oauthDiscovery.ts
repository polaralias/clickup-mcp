import type { Request, Response } from "express";
import { config } from "./config.js";

export function getBaseUrl(req: Request): string {
    const configured = process.env.PUBLIC_BASE_URL || config.baseUrl;
    if (configured && configured.startsWith("http")) return configured.replace(/\/+$/, "");
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    return `${proto}://${req.get("host")}`.replace(/\/+$/, "");
}

export function sendOAuthDiscovery401(req: Request, res: Response, message = "Unauthorized") {
    const baseUrl = getBaseUrl(req);
    const md = `${baseUrl}/.well-known/oauth-protected-resource`;
    res.setHeader("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${md}"`);
    res.status(401).json({ error: "Unauthorized", message });
}

// Backwards compatibility/Alias for the plan which used `unauthorizedJson`
export const unauthorizedJson = (req: Request, res: Response, body: any) => {
    const baseUrl = getBaseUrl(req);
    const md = `${baseUrl}/.well-known/oauth-protected-resource`;
    res.setHeader("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${md}"`);
    return res.status(401).json(body);
}
