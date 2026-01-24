import { getCharLimit } from "../../config/applicationConfig.js";
const DEFAULT_PREVIEW_LIMIT = 16000;
const MAX_PREVIEW_LIMIT = 16000;
function coerceString(value) {
    if (value === null || value === undefined) {
        return undefined;
    }
    const text = String(value).trim();
    return text === "" ? undefined : text;
}
function findFirstString(value, depth = 0) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed;
    }
    if (depth >= 2) {
        return undefined;
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            const result = findFirstString(entry, depth + 1);
            if (result) {
                return result;
            }
        }
        return undefined;
    }
    if (value && typeof value === "object") {
        for (const entry of Object.values(value)) {
            const result = findFirstString(entry, depth + 1);
            if (result) {
                return result;
            }
        }
    }
    return undefined;
}
export function extractDocId(doc) {
    const candidates = [doc.id, doc.doc_id, doc.docId, doc.uuid, doc.document_id];
    for (const candidate of candidates) {
        const value = coerceString(candidate);
        if (value) {
            return value;
        }
    }
    throw new Error("Doc identifier missing");
}
export function extractDocName(doc) {
    const candidates = [doc.name, doc.doc_name, doc.title, doc.document_name];
    for (const candidate of candidates) {
        const value = coerceString(candidate);
        if (value) {
            return value;
        }
    }
    return undefined;
}
export function extractPageId(page) {
    const candidates = [page.id, page.page_id, page.pageId, page.uuid];
    for (const candidate of candidates) {
        const value = coerceString(candidate);
        if (value) {
            return value;
        }
    }
    return undefined;
}
export function extractPageTitle(page) {
    const candidates = [page.name, page.title, page.page_name, page.header];
    for (const candidate of candidates) {
        const value = coerceString(candidate);
        if (value) {
            return value;
        }
    }
    return undefined;
}
export function extractPageContent(page) {
    const directCandidates = [
        page.content,
        page.markdown,
        page.html,
        page.body,
        page.text,
        page.description,
        page.rich_text,
        page.page?.content,
        page.data?.content
    ];
    for (const candidate of directCandidates) {
        if (typeof candidate === "string") {
            const trimmed = candidate.trim();
            if (trimmed !== "") {
                return trimmed;
            }
        }
        if (candidate && typeof candidate === "object") {
            if (typeof candidate.markdown === "string") {
                const markdown = candidate.markdown;
                const trimmed = markdown.trim();
                if (trimmed !== "") {
                    return trimmed;
                }
            }
            if (typeof candidate.text === "string") {
                const text = candidate.text;
                const trimmed = text.trim();
                if (trimmed !== "") {
                    return trimmed;
                }
            }
        }
    }
    const fallback = findFirstString(page);
    return fallback ?? "";
}
export function extractHierarchy(doc) {
    const workspace = doc.team ?? doc.workspace;
    const space = doc.space;
    const folder = doc.folder;
    const workspaceId = coerceString(doc.team_id ?? doc.workspace_id ?? workspace?.id);
    const workspaceName = coerceString(doc.team_name ?? doc.workspace_name ?? workspace?.name);
    const spaceId = coerceString(doc.space_id ?? space?.id);
    const spaceName = coerceString(doc.space_name ?? space?.name);
    const folderId = coerceString(doc.folder_id ?? folder?.id);
    const folderName = coerceString(doc.folder_name ?? folder?.name);
    const docName = extractDocName(doc);
    const pathSegments = [workspaceName, spaceName, folderName, docName].filter((segment) => Boolean(segment));
    const path = pathSegments.length > 0 ? pathSegments.join(" › ") : docName ?? "Doc";
    return {
        workspaceId,
        workspaceName,
        spaceId,
        spaceName,
        folderId,
        folderName,
        path
    };
}
export function inferPageCount(doc, pages) {
    const candidates = [doc.page_count, doc.pages_count, doc.pageCount, doc.total_pages];
    for (const candidate of candidates) {
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return candidate;
        }
        if (typeof candidate === "string") {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    if (Array.isArray(doc.pages)) {
        return doc.pages.length;
    }
    return pages.length;
}
export function resolvePreviewLimit(config, override) {
    const base = getCharLimit(config);
    if (override === undefined) {
        return Math.min(base, MAX_PREVIEW_LIMIT);
    }
    if (!Number.isFinite(override) || override <= 0) {
        return Math.min(base, MAX_PREVIEW_LIMIT);
    }
    return Math.min(base, override, MAX_PREVIEW_LIMIT);
}
export function buildContentPreview(content, limit) {
    const safeLimit = limit > 0 ? limit : DEFAULT_PREVIEW_LIMIT;
    if (!content) {
        return { preview: "", truncated: false };
    }
    if (content.length <= safeLimit) {
        return { preview: content, truncated: false };
    }
    return { preview: content.slice(0, safeLimit), truncated: true };
}
export function buildPageEntries(metadata, detailed, previewLimit) {
    const pageMap = new Map();
    for (const page of detailed) {
        const pageId = extractPageId(page);
        if (pageId) {
            pageMap.set(pageId, page);
        }
    }
    const entries = [];
    for (const entry of metadata) {
        const pageId = extractPageId(entry);
        if (!pageId) {
            continue;
        }
        const source = pageMap.get(pageId) ?? entry;
        const title = extractPageTitle(source) ?? extractPageTitle(entry);
        const content = extractPageContent(source);
        const { preview, truncated } = buildContentPreview(content, previewLimit);
        entries.push({
            page: source,
            preview: { pageId, title, preview, truncated }
        });
    }
    return entries;
}
export function buildDocumentSummary(doc, pageCount, pagePreviews) {
    const docId = extractDocId(doc);
    const name = extractDocName(doc);
    const hierarchy = extractHierarchy(doc);
    const previewTruncated = pagePreviews.some((preview) => preview.truncated);
    const summaryTruncated = previewTruncated || pagePreviews.length < pageCount;
    return {
        docId,
        name,
        hierarchy,
        pageCount,
        pagePreviews,
        truncated: summaryTruncated
    };
}
