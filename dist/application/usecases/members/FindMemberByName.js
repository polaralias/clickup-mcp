import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(config, teamId) {
    if (teamId?.trim()) {
        return teamId;
    }
    return requireTeamId(config, "teamId is required to search members");
}
export async function findMemberByName(input, client, config, directory) {
    const teamId = resolveTeamId(config, input.teamId);
    const limit = input.limit && input.limit > 0 ? input.limit : 5;
    const { matches, cache } = await directory.search(teamId, input.query, () => client.listMembers(teamId), {
        forceRefresh: Boolean(input.refresh),
        limit
    });
    return { query: input.query, matches, cache };
}
