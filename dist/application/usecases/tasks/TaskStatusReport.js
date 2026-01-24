import { requireTeamId } from "../../config/applicationConfig.js";
import { truncateList } from "../../limits/truncation.js";
import { TaskSearchIndex } from "../../services/TaskSearchIndex.js";
import { resolveIdsFromPath } from "../hierarchy/structureShared.js";
import { normaliseTaskRecord } from "./resolveTaskReference.js";
function readString(candidate) {
    if (typeof candidate === "string") {
        return candidate;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return String(candidate);
    }
    return undefined;
}
function toIsoDate(value) {
    const parsed = typeof value === "number" && Number.isFinite(value)
        ? value
        : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : undefined;
    if (parsed && Number.isFinite(parsed) && parsed > 0) {
        return new Date(parsed).toISOString();
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
    const username = readString(raw.username ?? raw.name);
    const email = readString(raw.email ?? raw.user_email);
    return { id: String(id), username: username ?? undefined, email: email ?? undefined };
}
function mapTags(candidate) {
    if (!Array.isArray(candidate)) {
        return [];
    }
    return candidate
        .map((entry) => {
        if (typeof entry === "string") {
            return entry;
        }
        if (entry && typeof entry === "object") {
            const raw = entry;
            const name = raw.name ?? raw.tag ?? raw.label;
            if (typeof name === "string" && name.length > 0) {
                return name;
            }
        }
        return undefined;
    })
        .filter((value) => Boolean(value));
}
function readPriority(task) {
    const raw = task?.priority;
    if (typeof raw === "string" && raw.length > 0) {
        return raw;
    }
    if (raw && typeof raw === "object") {
        const value = raw.label ?? raw.priority ?? raw.text;
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function readStatus(task) {
    if (typeof task?.status === "string") {
        return { status: task.status };
    }
    if (task?.status && typeof task.status === "object") {
        const value = task.status;
        const status = readString(value.status ?? value.name ?? value.text);
        const type = readString(value.type);
        return { status: status ?? undefined, type: type ?? undefined };
    }
    return { status: undefined, type: undefined };
}
function mapTask(task, assigneeLimit) {
    const id = task?.id ?? task?.task_id;
    if (!id) {
        return undefined;
    }
    const assigneesRaw = Array.isArray(task?.assignees) ? task.assignees : [];
    const assigneeRecords = assigneesRaw
        .map((member) => mapMember(member))
        .filter((member) => Boolean(member));
    const { items: assignees, truncated: assigneesTruncated } = truncateList(assigneeRecords, assigneeLimit);
    const { status } = readStatus(task);
    const priority = readPriority(task);
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
        priority,
        dueDate: toIsoDate(task?.due_date ?? task?.dueDate),
        url,
        assignees,
        assigneesTruncated,
        tags: mapTags(task?.tags),
        isSubtask: Boolean(parentId),
        parentId,
        hasSubtasks: typeof subtaskCount === "number" ? subtaskCount > 0 : undefined,
        subtaskCount
    };
}
async function fetchSearchPage(teamId, query, client, catalogue) {
    const cached = catalogue?.getSearchEntry(teamId, query);
    if (cached) {
        return cached.tasks;
    }
    const response = await client.searchTasks(teamId, query);
    const tasks = Array.isArray(response?.tasks) ? response.tasks : [];
    const records = tasks
        .map((task) => normaliseTaskRecord(task))
        .filter((task) => Boolean(task));
    const index = new TaskSearchIndex();
    index.index(records);
    catalogue?.storeSearchEntry({ teamId, params: query, tasks, records, index });
    return tasks;
}
function buildContainer(input, pathResolution) {
    return {
        workspaceId: input.workspaceId ?? pathResolution?.workspaceId,
        spaceId: input.spaceId ?? pathResolution?.spaceId,
        folderId: input.folderId ?? pathResolution?.folderId,
        listId: input.listId ?? pathResolution?.listId,
        path: input.path ?? undefined
    };
}
function buildQuery(container, input, page, pageSize, limit) {
    const includeTiml = input.includeTasksInMultipleLists !== false;
    const query = {
        page,
        page_size: pageSize,
        include_closed: input.includeClosed,
        subtasks: input.includeSubtasks !== false ? true : undefined,
        include_timl: includeTiml ? true : undefined,
        order_by: "updated",
        reverse: true
    };
    if (container.listId)
        query.list_ids = [container.listId];
    if (container.folderId)
        query.project_ids = [container.folderId];
    if (container.spaceId)
        query.space_ids = [container.spaceId];
    if (input.tags && input.tags.length > 0)
        query.tags = input.tags;
    if (input.assignees && input.assignees.length > 0)
        query.assignees = input.assignees;
    if (input.statusFilter && input.statusFilter.length > 0)
        query.statuses = input.statusFilter;
    query.page_size = Math.min(query.page_size, limit);
    return query;
}
function matchesAssignees(task, filters) {
    if (!filters || filters.length === 0)
        return true;
    const normalised = filters.map((entry) => entry.toLowerCase());
    return task.assignees.some((assignee) => {
        const candidates = [assignee.id, assignee.username, assignee.email];
        return candidates.some((value) => typeof value === "string" && normalised.includes(value.toLowerCase()));
    });
}
function matchesTags(task, filters) {
    if (!filters || filters.length === 0)
        return true;
    const set = new Set(task.tags.map((tag) => tag.toLowerCase()));
    return filters.every((tag) => set.has(tag.toLowerCase()));
}
function matchesStatus(task, filters) {
    if (!filters || filters.length === 0)
        return true;
    const status = task.status?.toLowerCase();
    return status ? filters.some((entry) => entry.toLowerCase() === status) : false;
}
function matchesDueWindow(task, days) {
    if (!days)
        return true;
    if (!task.dueDate)
        return false;
    const due = Date.parse(task.dueDate);
    if (!Number.isFinite(due))
        return false;
    const now = Date.now();
    return due >= now && due <= now + days * 24 * 60 * 60 * 1000;
}
function applyCharLimit(result, config) {
    const initial = JSON.stringify(result);
    if (initial.length <= config.charLimit) {
        return result;
    }
    const trimmed = {
        ...result,
        samples: { byStatus: [], byPriority: [] },
        truncated: true
    };
    const fallback = JSON.stringify(trimmed);
    if (fallback.length <= config.charLimit) {
        return trimmed;
    }
    return {
        ...trimmed,
        statusCounts: {},
        priorityCounts: {}
    };
}
export async function taskStatusReport(input, client, config, directory, catalogue) {
    const teamId = requireTeamId(config, "teamId is required for status reporting");
    const pathResolution = await resolveIdsFromPath(input.path, client, directory, {
        forceRefresh: input.forceRefresh
    });
    const container = buildContainer(input, pathResolution);
    const limit = Math.max(1, config.reportingMaxTasks);
    const pageSize = Math.min(limit, 100);
    const assigneeLimit = 5;
    const tasks = [];
    let truncated = false;
    let page = 0;
    while (tasks.length < limit) {
        const query = buildQuery(container, input, page, Math.min(pageSize, limit - tasks.length), limit);
        const pageTasks = await fetchSearchPage(teamId, query, client, catalogue);
        const mapped = pageTasks
            .map((task) => mapTask(task, assigneeLimit))
            .filter((task) => Boolean(task))
            .filter((task) => matchesAssignees(task, input.assignees))
            .filter((task) => matchesTags(task, input.tags))
            .filter((task) => matchesStatus(task, input.statusFilter))
            .filter((task) => matchesDueWindow(task, input.dueWithinDays));
        tasks.push(...mapped);
        if (pageTasks.length < pageSize) {
            break;
        }
        page += 1;
        if (tasks.length >= limit) {
            truncated = true;
            break;
        }
    }
    if (tasks.length > limit) {
        tasks.length = limit;
        truncated = true;
    }
    const statusCounts = new Map();
    const priorityCounts = new Map();
    const statusSamples = new Map();
    const prioritySamples = new Map();
    const sampleLimit = 3;
    tasks.forEach((task) => {
        const statusKey = task.status ?? "unknown";
        const priorityKey = task.priority ?? "none";
        statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);
        priorityCounts.set(priorityKey, (priorityCounts.get(priorityKey) ?? 0) + 1);
        const existingStatusSamples = statusSamples.get(statusKey) ?? [];
        if (existingStatusSamples.length < sampleLimit) {
            existingStatusSamples.push(task);
            statusSamples.set(statusKey, existingStatusSamples);
        }
        const existingPrioritySamples = prioritySamples.get(priorityKey) ?? [];
        if (existingPrioritySamples.length < sampleLimit) {
            existingPrioritySamples.push(task);
            prioritySamples.set(priorityKey, existingPrioritySamples);
        }
    });
    const statusBuckets = Array.from(statusCounts.entries()).map(([status, count]) => {
        const samples = statusSamples.get(status) ?? [];
        const { items, truncated: samplesTruncated } = truncateList(samples, sampleLimit);
        return { status, count, samples: items, samplesTruncated };
    });
    const priorityBuckets = Array.from(priorityCounts.entries()).map(([priority, count]) => {
        const samples = prioritySamples.get(priority) ?? [];
        const { items, truncated: samplesTruncated } = truncateList(samples, sampleLimit);
        return { priority, count, samples: items, samplesTruncated };
    });
    const base = {
        container,
        totals: {
            inspected: tasks.length,
            limit,
            truncated
        },
        statusCounts: Object.fromEntries(statusCounts.entries()),
        priorityCounts: Object.fromEntries(priorityCounts.entries()),
        samples: {
            byStatus: statusBuckets,
            byPriority: priorityBuckets
        },
        filters: {
            includeClosed: Boolean(input.includeClosed),
            includeSubtasks: input.includeSubtasks !== false,
            includeTasksInMultipleLists: input.includeTasksInMultipleLists !== false,
            tags: input.tags ?? [],
            assignees: input.assignees ?? [],
            statusFilter: input.statusFilter ?? [],
            dueWithinDays: input.dueWithinDays
        },
        truncated: false,
        guidance: input.includeSubtasks !== false
            ? "Subtasks were included; check isSubtask and parentId flags before assuming hierarchy."
            : "Subtasks were excluded from this summary; enable includeSubtasks to incorporate child tasks."
    };
    return applyCharLimit(base, config);
}
