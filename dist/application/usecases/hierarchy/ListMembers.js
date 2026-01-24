import { ClickUpMembersFallbackError } from "../../../infrastructure/clickup/ClickUpClient.js";
import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(config, teamId) {
    if (teamId?.trim()) {
        return teamId;
    }
    return requireTeamId(config, "teamId is required when a tool input does not provide one");
}
export async function listMembers(input, client, config, capabilityTracker) {
    const teamId = resolveTeamId(config, input.teamId);
    try {
        const response = await client.listMembers(teamId);
        const listing = normaliseListing(response);
        const capability = capabilityTracker.recordMemberEndpoint(teamId, listing.source === "direct", listing.diagnostics);
        const guidance = listing.source === "fallback"
            ? "Direct member listing returned 404, so these members came from the /team fallback. Share the workspace with the API token if names are missing."
            : undefined;
        return {
            members: listing.members,
            guidance,
            capabilities: { memberEndpoint: capability }
        };
    }
    catch (error) {
        if (error instanceof ClickUpMembersFallbackError) {
            const detail = safeErrorMessage(error.cause);
            capabilityTracker.recordMemberEndpoint(teamId, false, detail);
            const suffix = detail ? ` Underlying error: ${detail}` : "";
            throw new Error(`Failed to list members for workspace ${teamId}. Both the /team/${teamId}/member endpoint and the /team fallback failed. Verify the workspace exists and is shared with the configured ClickUp API token.${suffix}`);
        }
        throw error;
    }
}
function normaliseListing(response) {
    if (isClickUpMemberListing(response)) {
        return {
            members: response.members,
            source: response.source,
            diagnostics: response.diagnostics
        };
    }
    if (Array.isArray(response)) {
        return { members: response, source: "direct" };
    }
    const members = Array.isArray(response?.members)
        ? (response.members ?? [])
        : [];
    return { members, source: "direct" };
}
function isClickUpMemberListing(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return Array.isArray(candidate.members) && (candidate.source === "direct" || candidate.source === "fallback");
}
function safeErrorMessage(error) {
    if (!error) {
        return undefined;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return undefined;
    }
}
