import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(input, config) {
    if (input.teamId?.trim()) {
        return input.teamId;
    }
    return requireTeamId(config, "teamId is required to update a time entry");
}
export async function updateTimeEntry(input, client, config) {
    const teamId = resolveTeamId(input, config);
    const payload = {};
    if (input.start !== undefined)
        payload.start = input.start;
    if (input.end !== undefined)
        payload.end = input.end;
    if (input.durationMs !== undefined)
        payload.duration = input.durationMs;
    if (input.description !== undefined)
        payload.description = input.description;
    if (input.dryRun) {
        return { preview: { entryId: input.entryId, teamId, fields: Object.keys(payload) } };
    }
    const entry = await client.updateTimeEntry(teamId, input.entryId, payload);
    return { entry };
}
