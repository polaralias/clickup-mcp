import { requireTeamId } from "../../config/applicationConfig.js";
import { truncateList } from "../../limits/truncation.js";
import { toEpochMilliseconds } from "../../../shared/time.js";
function resolveTeamId(config) {
    return requireTeamId(config, "teamId is required for time entry listing");
}
export async function listTimeEntries(input, client, config) {
    const teamId = resolveTeamId(config);
    const query = {
        page: input.page,
        include_task_details: true
    };
    if (input.taskId)
        query.task_id = input.taskId;
    if (input.from !== undefined) {
        query.start_date = toEpochMilliseconds(input.from, "from");
    }
    if (input.to !== undefined) {
        query.end_date = toEpochMilliseconds(input.to, "to");
    }
    const response = await client.listTimeEntries(teamId, query);
    const entries = Array.isArray(response?.data) ? response.data : [];
    const { items, truncated } = truncateList(entries, input.pageSize);
    return { entries: items, truncated };
}
