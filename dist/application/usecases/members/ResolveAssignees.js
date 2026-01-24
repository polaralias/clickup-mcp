import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(config, teamId) {
    if (teamId?.trim()) {
        return teamId;
    }
    return requireTeamId(config, "teamId is required to resolve assignees");
}
export async function resolveAssignees(input, client, config, directory) {
    const teamId = resolveTeamId(config, input.teamId);
    const limit = input.limitPerIdentifier && input.limitPerIdentifier > 0 ? input.limitPerIdentifier : 5;
    const { entry, cache } = await directory.prepare(teamId, () => client.listMembers(teamId), {
        forceRefresh: Boolean(input.refresh)
    });
    const results = input.identifiers.map((identifier) => ({
        identifier,
        matches: directory.rank(entry, identifier, limit)
    }));
    return { results, cache };
}
