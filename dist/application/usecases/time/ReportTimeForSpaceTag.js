import { requireTeamId } from "../../config/applicationConfig.js";
import { buildTimeReport } from "./TimeReportUtils.js";
function resolveTeamId(config) {
    return requireTeamId(config, "teamId is required for time reporting");
}
export async function reportTimeForSpaceTag(input, client, config) {
    const teamId = resolveTeamId(config);
    return buildTimeReport({
        client,
        teamId,
        context: {
            contextType: "space",
            contextId: input.spaceId,
            tag: input.tag,
            includeSubtasks: input.includeSubtasks !== false,
            includeTasksInMultipleLists: true,
            providedContexts: { spaceId: input.spaceId, tag: input.tag }
        },
        timeRange: { from: input.from, to: input.to },
        entryPageSize: 100,
        entryPageLimit: 10
    });
}
