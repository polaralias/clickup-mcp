import { truncateList } from "../../limits/truncation.js";
import { resolveTaskReference } from "./resolveTaskReference.js";
const DEFAULT_DETAIL_LIMIT = 10;
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
            : typeof raw.user === "object" && raw.user && typeof raw.user.username === "string"
                ? raw.user.username
                : undefined;
    const email = typeof raw.email === "string"
        ? raw.email
        : typeof raw.user_email === "string"
            ? raw.user_email
            : undefined;
    return { id: String(id), username, email };
}
function mapTag(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const raw = candidate;
    const name = raw.name ?? raw.tag_name ?? raw.label;
    if (typeof name !== "string" || name.trim() === "") {
        return undefined;
    }
    const fg = typeof raw.tag_fg === "string" ? raw.tag_fg : typeof raw.fg_color === "string" ? raw.fg_color : undefined;
    const bg = typeof raw.tag_bg === "string" ? raw.tag_bg : typeof raw.bg_color === "string" ? raw.bg_color : undefined;
    return { name, color: fg || bg ? { fg, bg } : undefined };
}
function mapChecklist(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const raw = candidate;
    const id = raw.id ?? raw.checklist_id;
    if (!id) {
        return undefined;
    }
    const items = Array.isArray(raw.items) ? raw.items : [];
    const resolvedItems = items.filter((item) => {
        if (!item || typeof item !== "object")
            return false;
        const entry = item;
        if (entry.resolved === true)
            return true;
        const state = entry.state ?? entry.status;
        return typeof state === "string" && state.toLowerCase() === "complete";
    }).length;
    const totalItems = items.length;
    return {
        id: String(id),
        name: typeof raw.name === "string" ? raw.name : undefined,
        resolvedItems,
        totalItems
    };
}
function ensureTaskUrl(taskId, candidate) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
        return candidate;
    }
    return `https://app.clickup.com/t/${taskId}`;
}
function buildList(payload, fallback) {
    const listSource = payload?.list;
    const listId = (listSource && typeof listSource.id === "string" && listSource.id) ??
        (typeof payload?.list_id === "string" && payload.list_id) ??
        (typeof payload?.listId === "string" && payload.listId) ??
        fallback?.listId;
    const listName = (listSource && typeof listSource.name === "string" && listSource.name) ??
        fallback?.listName;
    const listUrl = (listSource && typeof listSource.url === "string" && listSource.url) ??
        fallback?.listUrl;
    if (!listId && !listName && !listUrl) {
        return undefined;
    }
    return { id: listId, name: listName, url: listUrl };
}
export async function getTask(input, client, _config, catalogue) {
    const detailLimit = input.detailLimit ?? DEFAULT_DETAIL_LIMIT;
    const resolution = resolveTaskReference({
        taskId: input.taskId,
        taskName: input.taskName,
        context: input.context
    }, catalogue);
    const response = await client.getTask(resolution.taskId, { subtasks: true });
    const payload = response?.task ?? response ?? {};
    const taskId = String(payload?.id ?? payload?.task_id ?? resolution.taskId);
    const url = ensureTaskUrl(taskId, payload?.url ?? resolution.record?.url);
    const status = typeof payload?.status === "string"
        ? payload.status
        : typeof payload?.status === "object" && payload.status && typeof payload.status.status === "string"
            ? payload.status.status
            : resolution.record?.status;
    const description = typeof payload?.description === "string"
        ? payload.description
        : typeof payload?.text_content === "string"
            ? payload.text_content
            : undefined;
    const priority = typeof payload?.priority === "string"
        ? payload.priority
        : typeof payload?.priority === "object" && payload.priority
            ? payload.priority.priority ?? payload.priority.label
            : undefined;
    const creator = mapMember(payload?.creator);
    const assigneeCandidates = Array.isArray(payload?.assignees) ? payload.assignees : [];
    const assigneeRecords = assigneeCandidates
        .map((member) => mapMember(member))
        .filter((member) => Boolean(member));
    const { items: assignees, truncated: assigneesTruncated } = truncateList(assigneeRecords, detailLimit);
    const tagCandidates = Array.isArray(payload?.tags) ? payload.tags : [];
    const tagRecords = tagCandidates
        .map((tag) => mapTag(tag))
        .filter((tag) => Boolean(tag));
    const { items: tags, truncated: tagsTruncated } = truncateList(tagRecords, detailLimit);
    const watcherCandidates = Array.isArray(payload?.watchers) ? payload.watchers : [];
    const watcherRecords = watcherCandidates
        .map((member) => mapMember(member))
        .filter((member) => Boolean(member));
    const { items: watchers, truncated: watchersTruncated } = truncateList(watcherRecords, detailLimit);
    const checklistCandidates = Array.isArray(payload?.checklists) ? payload.checklists : [];
    const checklistRecords = checklistCandidates
        .map((checklist) => mapChecklist(checklist))
        .filter((entry) => Boolean(entry));
    const { items: checklists, truncated: checklistsTruncated } = truncateList(checklistRecords, detailLimit);
    const subtaskEntries = Array.isArray(payload?.subtasks) ? payload.subtasks : [];
    const subtaskCountFromPayload = typeof payload?.subtask_count === "number"
        ? payload.subtask_count
        : typeof payload?.subtasks_count === "number"
            ? payload.subtasks_count
            : undefined;
    const subtaskCount = subtaskEntries.length > 0
        ? subtaskEntries.length
        : typeof subtaskCountFromPayload === "number"
            ? subtaskCountFromPayload
            : 0;
    const hasSubtasks = subtaskCount > 0;
    const parentId = typeof payload?.parent === "string" ? payload.parent : undefined;
    const isSubtask = Boolean(parentId);
    const truncatedFlags = {
        assignees: assigneesTruncated,
        tags: tagsTruncated,
        watchers: watchersTruncated,
        checklists: checklistsTruncated
    };
    const guidance = Object.values(truncatedFlags).some(Boolean)
        ? "Some collections were truncated for token safety. Increase detailLimit if additional entries are required."
        : undefined;
    return {
        task: {
            id: taskId,
            name: typeof payload?.name === "string" ? payload.name : resolution.record?.name,
            status,
            description,
            priority,
            dueDate: toIsoDate(payload?.due_date ?? payload?.dueDate),
            startDate: toIsoDate(payload?.start_date ?? payload?.date_started),
            createdDate: toIsoDate(payload?.date_created ?? payload?.dateCreated),
            updatedDate: toIsoDate(payload?.date_updated ?? payload?.dateUpdated),
            parentId,
            isSubtask,
            hasSubtasks,
            subtaskCount,
            url,
            list: buildList(payload, resolution.record),
            creator,
            assignees,
            tags,
            watchers,
            checklists
        },
        truncated: truncatedFlags,
        resolution: {
            method: resolution.method,
            matchedName: resolution.matchedName,
            score: resolution.score,
            usedContext: resolution.method === "fuzzy"
        },
        guidance
    };
}
