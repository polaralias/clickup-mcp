import { ClickUpRequestError } from "../../infrastructure/clickup/ClickUpClient.js";
export class DocsCapabilityUnavailableError extends Error {
    capability;
    constructor(capability) {
        super("Not supported in this environment");
        this.name = "DocsCapabilityUnavailableError";
        this.capability = capability;
    }
}
function extractStatus(error) {
    if (error instanceof ClickUpRequestError) {
        return error.statusCode;
    }
    if (!(error instanceof Error)) {
        return undefined;
    }
    const match = error.message.match(/^ClickUp\s+(\d+):/);
    if (!match) {
        return undefined;
    }
    const status = Number.parseInt(match[1], 10);
    return Number.isFinite(status) ? status : undefined;
}
function extractDiagnostics(error) {
    if (error instanceof ClickUpRequestError) {
        const parts = [`status=${error.statusCode}`];
        if (error.ecode) {
            parts.push(`code=${error.ecode}`);
        }
        return parts.join(" ");
    }
    const status = extractStatus(error);
    if (!status) {
        return undefined;
    }
    return `status=${status}`;
}
export async function ensureDocsCapability(teamId, client, tracker) {
    const cached = tracker.getDocsEndpoint(teamId);
    if (cached) {
        if (!cached.docsAvailable) {
            throw new DocsCapabilityUnavailableError(cached);
        }
        return cached;
    }
    try {
        await client.listDocuments(teamId, { limit: 1, page: 0 });
        return tracker.recordDocsEndpoint(teamId, true);
    }
    catch (error) {
        const status = extractStatus(error);
        if (status === 404) {
            const capability = tracker.recordDocsEndpoint(teamId, false, extractDiagnostics(error));
            throw new DocsCapabilityUnavailableError(capability);
        }
        throw error;
    }
}
export function buildDocCapabilityError(capability) {
    return {
        error: {
            type: "not_supported",
            message: "Not supported in this environment",
            capability
        }
    };
}
export function isDocCapabilityError(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.error?.type === "string" &&
        candidate.error.type === "not_supported" &&
        typeof candidate.error.message === "string" &&
        typeof candidate.error.capability === "object");
}
export function isDocsCapabilityUnavailableError(error) {
    return error instanceof DocsCapabilityUnavailableError;
}
export async function runWithDocsCapability(teamId, client, tracker, action) {
    try {
        await ensureDocsCapability(teamId, client, tracker);
    }
    catch (error) {
        if (error instanceof DocsCapabilityUnavailableError) {
            return buildDocCapabilityError(error.capability);
        }
        throw error;
    }
    return action();
}
