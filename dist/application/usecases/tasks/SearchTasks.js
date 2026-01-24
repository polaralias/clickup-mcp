import { requireTeamId } from "../../config/applicationConfig.js";
import { truncateList } from "../../limits/truncation.js";
import { TaskSearchIndex } from "../../services/TaskSearchIndex.js";
import { normaliseTaskRecord } from "./resolveTaskReference.js";
function resolveTeamId(config) {
    return requireTeamId(config, "teamId is required for task search");
}
function normaliseStatuses(input) {
    if (input.statuses && input.statuses.length > 0) {
        return input.statuses;
    }
    if (input.status) {
        return [input.status];
    }
    return undefined;
}
export async function searchTasks(input, client, config, catalogue) {
    const teamId = resolveTeamId(config);
    const includeTiml = input.includeTasksInMultipleLists !== false;
    const query = {
        page: input.page,
        order_by: "updated",
        reverse: true,
        include_timl: includeTiml ? true : undefined,
        subtasks: input.includeSubtasks ? true : undefined
    };
    if (input.query)
        query.search = input.query;
    if (input.listIds)
        query.list_ids = input.listIds.join(",");
    if (input.tagIds && input.tagIds.length > 0)
        query.tags = input.tagIds;
    const statuses = normaliseStatuses(input);
    if (statuses)
        query.statuses = statuses;
    const cached = catalogue?.getSearchEntry(teamId, query);
    let tasks;
    if (cached) {
        tasks = cached.tasks;
    }
    else {
        const response = await client.searchTasks(teamId, query);
        tasks = Array.isArray(response?.tasks) ? response.tasks : [];
        const records = tasks
            .map((task) => normaliseTaskRecord(task))
            .filter((task) => Boolean(task));
        const index = new TaskSearchIndex();
        index.index(records);
        catalogue?.storeSearchEntry({ teamId, params: query, tasks, records, index });
    }
    const { items, truncated } = truncateList(tasks, input.pageSize);
    return { results: items, truncated };
}
