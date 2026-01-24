import { requireTeamId } from "../../config/applicationConfig.js";
import { buildTimeReport } from "./TimeReportUtils.js";
function resolveTeamId(config) {
    return requireTeamId(config, "teamId is required for time reporting");
}
export async function reportTimeForTag(input, client, config) {
    const teamId = input.teamId ?? resolveTeamId(config);
    return buildTimeReport({
        client,
        teamId,
        context: {
            contextType: "workspace",
            contextId: teamId,
            tag: input.tag,
            includeSubtasks: input.includeSubtasks !== false,
            includeTasksInMultipleLists: true,
            providedContexts: { tag: input.tag }
        },
        timeRange: { from: input.from, to: input.to },
        entryPageSize: 100,
        entryPageLimit: 10
    });
}
