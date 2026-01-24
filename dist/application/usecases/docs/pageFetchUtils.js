import { requireTeamId } from "../../config/applicationConfig.js";
import { BulkProcessor } from "../../services/BulkProcessor.js";
import { extractPageId } from "./docUtils.js";
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_PAGE_BATCH_SIZE = 10;
export function resolveWorkspaceId(workspaceId, config, message) {
    if (workspaceId) {
        return workspaceId;
    }
    return requireTeamId(config, message);
}
export function resolveConcurrency() {
    const candidate = Number(process.env.MAX_BULK_CONCURRENCY ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_CONCURRENCY;
}
export function resolvePageBatchSize() {
    const candidate = Number(process.env.DOC_PAGE_BATCH_SIZE ?? DEFAULT_PAGE_BATCH_SIZE);
    if (!Number.isFinite(candidate) || candidate <= 0) {
        return DEFAULT_PAGE_BATCH_SIZE;
    }
    return Math.min(candidate, 25);
}
export function chunkArray(items, size) {
    if (size <= 0) {
        return [items];
    }
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
export function extractPageListing(response) {
    if (!response || typeof response !== "object") {
        return [];
    }
    const candidate = response;
    if (Array.isArray(candidate.page_listing)) {
        return candidate.page_listing;
    }
    if (Array.isArray(candidate.pages)) {
        return candidate.pages;
    }
    if (Array.isArray(response)) {
        return response;
    }
    return [];
}
export async function fetchPages(client, docId, pageIds) {
    if (pageIds.length === 0) {
        return [];
    }
    const chunks = chunkArray(pageIds, resolvePageBatchSize());
    const processor = new BulkProcessor(resolveConcurrency());
    const responses = await processor.run(chunks, async (ids) => {
        if (ids.length === 0) {
            return [];
        }
        const response = await client.bulkGetDocumentPages(docId, ids);
        return extractPageListing(response);
    });
    return responses.flat();
}
export function orderMetadata(metadata, pageIds) {
    if (!pageIds || pageIds.length === 0) {
        return metadata;
    }
    const map = new Map();
    for (const entry of metadata) {
        const pageId = extractPageId(entry);
        if (pageId) {
            map.set(pageId, entry);
        }
    }
    const ordered = [];
    for (const pageId of pageIds) {
        const entry = map.get(pageId);
        if (entry) {
            ordered.push(entry);
        }
    }
    return ordered;
}
