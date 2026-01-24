import { requireTeamId } from "../../config/applicationConfig.js";
import { buildTimeReport } from "./TimeReportUtils.js";
function resolveTeamId(config) {
    return requireTeamId(config, "teamId is required for time reporting");
}
export async function reportTimeForContainer(input, client, config) {
    const teamId = resolveTeamId(config);
    const context = {
        contextType: input.containerType,
        contextId: input.containerId,
        includeSubtasks: input.includeSubtasks !== false,
        includeTasksInMultipleLists: input.includeTasksInMultipleLists !== false,
        providedContexts: {
            containerId: input.containerId,
            containerType: input.containerType
        }
    };
    return buildTimeReport({
        client,
        teamId,
        context,
        timeRange: { from: input.from, to: input.to },
        entryPageSize: 100,
        entryPageLimit: 10
    });
}
