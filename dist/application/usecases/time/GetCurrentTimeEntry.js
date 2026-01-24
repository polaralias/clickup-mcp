import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(input, config) {
    if (input.teamId) {
        return input.teamId;
    }
    return requireTeamId(config, "teamId is required to resolve the current timer");
}
function normaliseEntry(value) {
    if (value && typeof value === "object") {
        return value;
    }
    return null;
}
export async function getCurrentTimeEntry(input, client, config) {
    const teamId = resolveTeamId(input, config);
    const response = await client.getCurrentTimeEntry(teamId);
    const entry = normaliseEntry(response?.data);
    const active = entry !== null && Object.keys(entry).length > 0;
    const guidance = active
        ? "Active timer returned. Stop or update it before starting another timer for the same user."
        : "No active timer for this workspace. Start a timer or create a manual entry if needed.";
    return { teamId, entry, active, guidance };
}
