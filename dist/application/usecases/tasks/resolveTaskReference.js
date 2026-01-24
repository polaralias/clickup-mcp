import { TaskSearchIndex } from "../../services/TaskSearchIndex.js";
const numericIdPattern = /^[0-9]+$/;
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}
export function normaliseTaskRecord(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const raw = candidate;
    const idValue = raw.id ?? raw.task_id ?? raw.taskId;
    if (!idValue) {
        return undefined;
    }
    const id = String(idValue);
    const name = typeof raw.name === "string" ? raw.name : "";
    const description = typeof raw.description === "string"
        ? raw.description
        : typeof raw.text_content === "string"
            ? raw.text_content
            : undefined;
    const status = typeof raw.status === "string"
        ? raw.status
        : typeof raw.status === "object" && raw.status && typeof raw.status.status === "string"
            ? raw.status.status
            : undefined;
    const parentId = typeof raw.parentId === "string"
        ? raw.parentId
        : typeof raw.parent === "string"
            ? raw.parent
            : undefined;
    const updatedAtCandidate = toNumber(raw.updatedAt) ?? toNumber(raw.date_updated) ?? toNumber(raw.dateUpdated);
    const list = typeof raw.list === "object" && raw.list ? raw.list : undefined;
    const listId = typeof raw.listId === "string"
        ? raw.listId
        : list && typeof list.id === "string"
            ? list.id
            : undefined;
    const listName = typeof raw.listName === "string"
        ? raw.listName
        : list && typeof list.name === "string"
            ? list.name
            : undefined;
    const listUrl = typeof raw.listUrl === "string"
        ? raw.listUrl
        : list && typeof list.url === "string"
            ? list.url
            : undefined;
    const url = typeof raw.url === "string" ? raw.url : undefined;
    return { id, name, description, status, updatedAt: updatedAtCandidate, parentId, listId, listName, listUrl, url };
}
function buildRecords(context) {
    const tasks = context?.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return undefined;
    }
    const records = tasks
        .map((task) => normaliseTaskRecord(task))
        .filter((task) => Boolean(task && task.id));
    if (records.length === 0) {
        return undefined;
    }
    return records;
}
function ensureIndex(records, catalogue) {
    if (!records || records.length === 0) {
        return undefined;
    }
    const cached = catalogue?.getContextIndex(records);
    if (cached) {
        return cached;
    }
    const index = new TaskSearchIndex();
    index.index(records);
    catalogue?.storeContextIndex({ records, index });
    return { index, records };
}
export function resolveTaskReference(input, catalogue) {
    if (input.taskId) {
        const record = catalogue?.lookupTask(input.taskId);
        return { taskId: input.taskId, method: "direct", record };
    }
    const query = input.taskName?.trim();
    if (!query) {
        throw new Error("taskId or taskName is required");
    }
    if (numericIdPattern.test(query)) {
        const record = catalogue?.lookupTask(query);
        return { taskId: query, method: "direct", record };
    }
    const records = buildRecords(input.context);
    const contextIndex = records ? ensureIndex(records, catalogue) : undefined;
    if (!contextIndex) {
        throw new Error("Task context is required to resolve by taskName");
    }
    const direct = contextIndex.records.find((record) => record.id === query || record.name === query);
    if (direct) {
        return { taskId: direct.id, method: "fuzzy", matchedName: direct.name, score: 0, record: direct };
    }
    const [match] = contextIndex.index.search(query, 1);
    if (!match) {
        throw new Error(`Unable to resolve task "${query}" from provided context`);
    }
    const record = contextIndex.index.lookup(match.id) ?? contextIndex.records.find((item) => item.id === match.id);
    if (!record) {
        throw new Error("Matched task was not present in context index");
    }
    return {
        taskId: record.id,
        method: "fuzzy",
        matchedName: record.name,
        score: match.score ?? undefined,
        record
    };
}
