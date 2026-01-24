import { truncateList } from "../../limits/truncation.js";
import { resolveTaskReference } from "./resolveTaskReference.js";
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
function mapComment(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const raw = candidate;
    const id = raw.id ?? raw.comment_id ?? raw.commentId;
    if (!id) {
        return undefined;
    }
    const text = typeof raw.comment_text === "string"
        ? raw.comment_text
        : typeof raw.text === "string"
            ? raw.text
            : undefined;
    const html = typeof raw.comment_html === "string"
        ? raw.comment_html
        : typeof raw.html === "string"
            ? raw.html
            : undefined;
    const createdAt = toIsoDate(raw.date ?? raw.date_created ?? raw.created_at ?? raw.createdAt);
    const creator = mapMember(raw.user ?? raw.creator);
    return {
        id: String(id),
        text,
        html,
        createdAt,
        creator
    };
}
function ensureTaskUrl(taskId, candidate) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
        return candidate;
    }
    return `https://app.clickup.com/t/${taskId}`;
}
export async function getTaskComments(input, client, _config, catalogue) {
    const resolution = resolveTaskReference({
        taskId: input.taskId,
        taskName: input.taskName,
        context: input.context
    }, catalogue);
    const response = await client.listTaskComments(resolution.taskId);
    const commentArray = Array.isArray(response?.comments)
        ? response.comments
        : Array.isArray(response)
            ? response
            : [];
    const commentCandidates = commentArray;
    const mappedComments = commentCandidates
        .map((comment) => mapComment(comment))
        .filter((comment) => Boolean(comment));
    const { items, truncated } = truncateList(mappedComments, input.limit);
    const guidance = truncated
        ? "Comments truncated for token safety. Increase limit to fetch additional entries."
        : undefined;
    return {
        task: {
            id: resolution.taskId,
            name: resolution.record?.name,
            url: ensureTaskUrl(resolution.taskId, resolution.record?.url)
        },
        comments: items,
        truncated,
        resolution: {
            method: resolution.method,
            matchedName: resolution.matchedName,
            score: resolution.score,
            usedContext: resolution.method === "fuzzy"
        },
        guidance
    };
}
