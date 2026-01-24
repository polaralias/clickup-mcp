import { requireTeamId } from "../../config/applicationConfig.js";
function resolveTeamId(config, teamId) {
    if (teamId?.trim()) {
        return teamId;
    }
    return requireTeamId(config, "teamId is required to resolve members");
}
export async function resolveMembers(input, client, config, directory) {
    const teamId = resolveTeamId(config, input.teamId);
    const { entry, cache } = await directory.prepare(teamId, () => client.listMembers(teamId), {
        forceRefresh: Boolean(input.refresh)
    });
    const limit = input.limit && input.limit > 0 ? input.limit : 5;
    const matches = input.identifiers.map((identifier) => {
        const candidates = directory.rank(entry, identifier, limit);
        const bestCandidate = candidates[0];
        return {
            identifier,
            member: bestCandidate?.member,
            best: bestCandidate,
            candidates
        };
    });
    return { matches, cache };
}
