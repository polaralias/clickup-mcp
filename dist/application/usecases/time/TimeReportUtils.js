import { toEpochMilliseconds } from "../../../shared/time.js";
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}
function extractDuration(entry) {
    if (!entry || typeof entry !== "object") {
        return 0;
    }
    const record = entry;
    const candidates = ["duration", "durationMs", "duration_ms"];
    for (const key of candidates) {
        const duration = toNumber(record[key]);
        if (duration !== undefined) {
            return duration;
        }
    }
    return 0;
}
function normaliseTask(entry) {
    if (!entry || typeof entry !== "object") {
        return undefined;
    }
    const record = entry;
    const task = record.task;
    if (!task || typeof task !== "object") {
        return undefined;
    }
    const taskRecord = task;
    const taskId = taskRecord.id ?? taskRecord.task_id;
    if (!taskId) {
        return undefined;
    }
    const list = taskRecord.list && typeof taskRecord.list === "object" ? taskRecord.list : undefined;
    const space = taskRecord.space && typeof taskRecord.space === "object" ? taskRecord.space : undefined;
    const folder = taskRecord.folder && typeof taskRecord.folder === "object" ? taskRecord.folder : undefined;
    const tags = Array.isArray(taskRecord.tags)
        ? taskRecord.tags
            .map((tag) => {
            if (!tag || typeof tag !== "object")
                return undefined;
            const tagRecord = tag;
            if (typeof tagRecord.name === "string")
                return tagRecord.name;
            if (typeof tagRecord.tag === "string")
                return tagRecord.tag;
            if (typeof tagRecord.id === "string")
                return tagRecord.id;
            return undefined;
        })
            .filter((name) => Boolean(name))
        : undefined;
    return {
        taskId: String(taskId),
        taskName: typeof taskRecord.name === "string" ? taskRecord.name : undefined,
        listId: list?.id ? String(list.id) : undefined,
        spaceId: space?.id ? String(space.id) : undefined,
        folderId: folder?.id ? String(folder.id) : undefined,
        parentId: taskRecord.parent ? String(taskRecord.parent) : undefined,
        isSubtask: Boolean(taskRecord.parent),
        tags
    };
}
function matchesPrimaryContext(task, context) {
    if (!task)
        return false;
    if (context.contextType === "workspace") {
        return true;
    }
    if (context.contextType === "space") {
        return task.spaceId === context.contextId;
    }
    if (context.contextType === "folder") {
        return task.folderId === context.contextId;
    }
    if (context.contextType === "list") {
        return task.listId === context.contextId;
    }
    if (context.contextType === "task") {
        if (task.taskId === context.contextId)
            return true;
        if (context.includeSubtasks && task.parentId === context.contextId)
            return true;
        return false;
    }
    return false;
}
function buildEntryQuery({ page, pageSize, timeRange }) {
    const query = {
        page,
        page_size: pageSize,
        include_task_details: true
    };
    if (timeRange.from !== undefined) {
        query.start_date = toEpochMilliseconds(timeRange.from, "from");
    }
    if (timeRange.to !== undefined) {
        query.end_date = toEpochMilliseconds(timeRange.to, "to");
    }
    return query;
}
export async function buildTimeReport(options) {
    const { client, teamId, context, timeRange, allowedTaskIds, entryPageLimit, entryPageSize } = options;
    if (!context.contextId) {
        return {
            error: {
                type: "invalid_context",
                message: "contextId is required to compute a time report"
            }
        };
    }
    const perTask = new Map();
    const partialReasons = [];
    let page = 0;
    let inspectedEntryCount = 0;
    let matchedEntryCount = 0;
    let missingTaskContextEntries = 0;
    let totalDurationMs = 0;
    let lastPageSize = 0;
    try {
        while (page < entryPageLimit) {
            const query = buildEntryQuery({ page, pageSize: entryPageSize, timeRange });
            const response = await client.listTimeEntries(teamId, query);
            const entries = Array.isArray(response?.data) ? response.data : [];
            lastPageSize = entries.length;
            inspectedEntryCount += entries.length;
            for (const entry of entries) {
                const taskContext = normaliseTask(entry);
                if (!taskContext) {
                    missingTaskContextEntries += 1;
                    continue;
                }
                if (!context.includeSubtasks && taskContext.isSubtask) {
                    continue;
                }
                if (context.tag && !(taskContext.tags ?? []).includes(context.tag)) {
                    continue;
                }
                if (allowedTaskIds && !allowedTaskIds.has(taskContext.taskId)) {
                    continue;
                }
                if (!matchesPrimaryContext(taskContext, context)) {
                    continue;
                }
                matchedEntryCount += 1;
                const durationMs = extractDuration(entry);
                totalDurationMs += durationMs;
                const existing = perTask.get(taskContext.taskId);
                if (existing) {
                    existing.durationMs += durationMs;
                    existing.entryCount += 1;
                }
                else {
                    perTask.set(taskContext.taskId, {
                        taskId: taskContext.taskId,
                        taskName: taskContext.taskName,
                        listId: taskContext.listId,
                        spaceId: taskContext.spaceId,
                        folderId: taskContext.folderId,
                        parentId: taskContext.parentId,
                        isSubtask: taskContext.isSubtask,
                        durationMs,
                        entryCount: 1
                    });
                }
            }
            if (entries.length < entryPageSize) {
                break;
            }
            page += 1;
        }
    }
    catch (error) {
        return {
            error: {
                type: "upstream_error",
                message: error instanceof Error ? error.message : "Failed to build time report",
                details: error
            }
        };
    }
    if (page >= entryPageLimit && lastPageSize === entryPageSize) {
        partialReasons.push("Time entries truncated by entryPageLimit; request a narrower range or increase entryPageLimit");
    }
    if (missingTaskContextEntries > 0) {
        partialReasons.push("Some ClickUp time entries were missing task context and were skipped");
    }
    const report = {
        context,
        timeRange: { ...timeRange },
        totals: {
            totalDurationMs,
            taskCount: perTask.size,
            entryCount: matchedEntryCount
        },
        perTask: Array.from(perTask.values()).sort((a, b) => b.durationMs - a.durationMs),
        partial: partialReasons.length > 0,
        partialReasons: partialReasons.length > 0 ? partialReasons : undefined,
        missingTaskContextEntries,
        inspectedEntryCount,
        entrySampling: {
            pagesLoaded: page + 1,
            pageSize: entryPageSize
        },
        guidance: context.guidance
    };
    if (matchedEntryCount === 0) {
        return {
            error: {
                type: "no_results",
                message: "No time entries matched the requested context or filters",
                details: report
            }
        };
    }
    return report;
}
