import { truncateList } from "../../limits/truncation.js";
import { resolveTaskReference, normaliseTaskRecord } from "./resolveTaskReference.js";
function toIsoDate(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return new Date(value).toISOString();
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
            return new Date(parsed).toISOString();
        }
    }
    return undefined;
}
function mapMember(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const raw = candidate;
    const id = raw.id ?? raw.user_id ?? raw.member_id ?? raw.userId;
    if (!id) {
        return undefined;
    }
    const username = typeof raw.username === "string"
        ? raw.username
        : typeof raw.name === "string"
            ? raw.name
            : undefined;
    const email = typeof raw.email === "string"
        ? raw.email
        : typeof raw.user_email === "string"
            ? raw.user_email
            : undefined;
    return { id: String(id), username, email };
}
function mapTask(task, assigneeLimit) {
    const id = task?.id ?? task?.task_id;
    if (!id) {
        return undefined;
    }
    const assigneeCandidates = Array.isArray(task?.assignees) ? task.assignees : [];
    const assigneeRecords = assigneeCandidates
        .map((member) => mapMember(member))
        .filter((member) => Boolean(member));
    const { items: assignees, truncated: assigneesTruncated } = truncateList(assigneeRecords, assigneeLimit);
    const status = typeof task?.status === "string"
        ? task.status
        : typeof task?.status === "object" && task.status && typeof task.status.status === "string"
            ? task.status.status
            : undefined;
    const priority = typeof task?.priority === "string"
        ? task.priority
        : typeof task?.priority === "object" && task.priority
            ? task.priority.priority ?? task.priority.label
            : undefined;
    const url = typeof task?.url === "string" ? task.url : `https://app.clickup.com/t/${id}`;
    const parentId = typeof task?.parent === "string" ? task.parent : undefined;
    const subtaskEntries = Array.isArray(task?.subtasks) ? task.subtasks : [];
    const subtaskCountFromPayload = typeof task?.subtask_count === "number"
        ? task.subtask_count
        : typeof task?.subtasks_count === "number"
            ? task.subtasks_count
            : undefined;
    const subtaskCount = subtaskEntries.length > 0
        ? subtaskEntries.length
        : typeof subtaskCountFromPayload === "number"
            ? subtaskCountFromPayload
            : undefined;
    return {
        id: String(id),
        name: typeof task?.name === "string" ? task.name : undefined,
        status,
        dueDate: toIsoDate(task?.due_date ?? task?.dueDate),
        startDate: toIsoDate(task?.start_date ?? task?.date_started),
        createdDate: toIsoDate(task?.date_created ?? task?.dateCreated),
        priority,
        url,
        assignees,
        assigneesTruncated,
        isSubtask: Boolean(parentId),
        parentId,
        hasSubtasks: typeof subtaskCount === "number" ? subtaskCount > 0 : undefined,
        subtaskCount
    };
}
async function resolveListDetails(input, client, catalogue) {
    if (input.listId) {
        return { listId: input.listId, method: "direct" };
    }
    const resolution = resolveTaskReference({
        taskId: input.taskId,
        taskName: input.taskName,
        context: input.context
    }, catalogue);
    if (resolution.record?.listId) {
        return {
            listId: resolution.record.listId,
            listName: resolution.record.listName,
            listUrl: resolution.record.listUrl,
            method: "task-context",
            taskResolution: resolution
        };
    }
    const taskResponse = await client.getTask(resolution.taskId, {});
    const payload = taskResponse?.task ?? taskResponse ?? {};
    const listSource = payload?.list;
    const listId = (listSource && typeof listSource.id === "string" && listSource.id) ??
        (typeof payload?.list_id === "string" && payload.list_id) ??
        (typeof payload?.listId === "string" && payload.listId);
    if (!listId) {
        throw new Error("Unable to determine listId from task reference");
    }
    const listName = (listSource && typeof listSource.name === "string" && listSource.name) ??
        resolution.record?.listName;
    const listUrl = (listSource && typeof listSource.url === "string" && listSource.url) ??
        resolution.record?.listUrl;
    return {
        listId: String(listId),
        listName,
        listUrl,
        method: "task-fetch",
        taskResolution: resolution
    };
}
export async function listTasksInList(input, client, _config, catalogue) {
    const listResolution = await resolveListDetails(input, client, catalogue);
    const includeTiml = input.includeTasksInMultipleLists !== false;
    const includeSubtasks = input.includeSubtasks !== false;
    const filters = {
        includeClosed: input.includeClosed,
        includeSubtasks,
        includeTasksInMultipleLists: includeTiml
    };
    let listName = listResolution.listName;
    let listUrl = listResolution.listUrl;
    const pageSize = Math.min(input.limit, 100);
    async function loadListPage(page) {
        const cached = catalogue?.getListPage(listResolution.listId, filters, page);
        if (cached) {
            const tasks = Array.isArray(cached.items)
                ? cached.items
                : cached.tasks.map((task) => ({
                    id: task.id,
                    name: task.name,
                    status: task.status,
                    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
                    assignees: [],
                    assigneesTruncated: false,
                    isSubtask: Boolean(task.parent ?? task.parentId),
                    parentId: task.parent ?? task.parentId,
                    hasSubtasks: undefined,
                    subtaskCount: undefined
                }));
            return {
                tasks,
                listName: cached.listName,
                listUrl: cached.listUrl
            };
        }
        const query = {
            page,
            include_closed: input.includeClosed ? true : undefined,
            subtasks: includeSubtasks ? true : undefined,
            include_timl: includeTiml ? true : undefined,
            page_size: pageSize
        };
        const response = await client.listTasksInList(listResolution.listId, query);
        const rawTasks = Array.isArray(response?.tasks)
            ? response.tasks
            : Array.isArray(response)
                ? response
                : [];
        const mappedTasks = rawTasks
            .map((task) => mapTask(task, input.assigneePreviewLimit))
            .filter((task) => Boolean(task));
        const listCarrier = rawTasks.find((task) => {
            if (!task || typeof task !== "object") {
                return false;
            }
            const candidate = task.list;
            if (!candidate || typeof candidate !== "object") {
                return false;
            }
            const listRecord = candidate;
            return typeof listRecord.name === "string" || typeof listRecord.url === "string";
        });
        const resolvedListName = listCarrier && typeof listCarrier.list?.name === "string" ? listCarrier.list.name : undefined;
        const resolvedListUrl = listCarrier && typeof listCarrier.list?.url === "string" ? listCarrier.list.url : undefined;
        const records = rawTasks
            .map((task) => normaliseTaskRecord(task))
            .filter((task) => Boolean(task));
        catalogue?.storeListPage({
            listId: listResolution.listId,
            filters,
            page,
            tasks: records,
            items: mappedTasks,
            total: mappedTasks.length,
            listName: resolvedListName,
            listUrl: resolvedListUrl
        });
        return {
            tasks: mappedTasks,
            listName: resolvedListName,
            listUrl: resolvedListUrl
        };
    }
    const aggregatedTasks = [];
    let currentPage = input.page;
    while (true) {
        const page = await loadListPage(currentPage);
        if (page.listName && !listName) {
            listName = page.listName;
        }
        if (page.listUrl && !listUrl) {
            listUrl = page.listUrl;
        }
        if (page.tasks.length === 0) {
            break;
        }
        aggregatedTasks.push(...page.tasks);
        currentPage += 1;
        if (aggregatedTasks.length > input.limit) {
            break;
        }
    }
    const total = aggregatedTasks.length;
    const { items, truncated } = truncateList(aggregatedTasks, input.limit);
    const guidance = truncated
        ? "Task list truncated for token safety. Increase limit or paginate with page to see more results."
        : undefined;
    return {
        list: {
            id: listResolution.listId,
            name: listName,
            url: listUrl
        },
        tasks: items,
        truncated,
        total,
        page: input.page,
        resolution: {
            method: listResolution.method,
            task: listResolution.taskResolution
                ? {
                    id: listResolution.taskResolution.taskId,
                    method: listResolution.taskResolution.method,
                    matchedName: listResolution.taskResolution.matchedName,
                    score: listResolution.taskResolution.score,
                    usedContext: listResolution.taskResolution.method === "fuzzy"
                }
                : undefined
        },
        filters: {
            includeClosed: input.includeClosed,
            includeSubtasks,
            includeTasksInMultipleLists: includeTiml
        },
        guidance
    };
}
