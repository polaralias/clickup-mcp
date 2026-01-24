import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(input, config) {
    if (input.teamId?.trim()) {
        return input.teamId;
    }
    return requireTeamId(config, "teamId is required to delete a time entry");
}
export async function deleteTimeEntry(input, client, config) {
    const teamId = resolveTeamId(input, config);
    if (input.dryRun) {
        return { preview: { entryId: input.entryId, teamId } };
    }
    await client.deleteTimeEntry(teamId, input.entryId);
    return { status: "deleted" };
}
