import { BulkProcessor } from "../../services/BulkProcessor.js";
import { runWithDocsCapability } from "../../services/DocCapability.js";
import { buildDocumentSummary, buildPageEntries, extractDocId, extractPageId, inferPageCount, resolvePreviewLimit } from "./docUtils.js";
import { extractPageListing, fetchPages, resolveConcurrency, resolveWorkspaceId } from "./pageFetchUtils.js";
function buildFilters(input) {
    return {
        search: input.search,
        space_id: input.spaceId,
        folder_id: input.folderId,
        page: input.page
    };
}
function buildDocEntry(doc, metadata, previews) {
    const pageCount = inferPageCount(doc, metadata);
    const summary = buildDocumentSummary(doc, pageCount, previews.map((entry) => entry.preview));
    return { doc, summary };
}
export async function listDocuments(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to list docs");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        const filters = buildFilters(input);
        const response = await client.listDocuments(workspaceId, filters);
        const docs = Array.isArray(response?.docs) ? response.docs : Array.isArray(response) ? response : [];
        const limitedDocs = docs.slice(0, input.limit);
        const previewLimit = resolvePreviewLimit(config, input.previewCharLimit);
        const includePreviews = input.includePreviews ?? true;
        const processor = new BulkProcessor(resolveConcurrency());
        const entries = await processor.run(limitedDocs, async (doc) => {
            const docId = extractDocId(doc);
            const pagesResponse = await client.listDocPages(docId);
            const metadata = extractPageListing(pagesResponse);
            const limitedMetadata = includePreviews
                ? metadata.slice(0, input.previewPageLimit)
                : [];
            const previewIds = includePreviews
                ? limitedMetadata
                    .map((pageRecord) => extractPageId(pageRecord))
                    .filter((value) => Boolean(value))
                : [];
            const detailed = includePreviews ? await fetchPages(client, docId, previewIds) : [];
            const entries = includePreviews
                ? buildPageEntries(limitedMetadata, detailed, previewLimit)
                : [];
            return buildDocEntry(doc, metadata, entries);
        });
        const truncated = entries.some((entry) => entry.summary.truncated);
        const guidance = entries.length === 0
            ? "No docs matched. Adjust search terms or hierarchy filters."
            : "Chain clickup_get_document for a specific doc or clickup_get_document_pages to expand individual pages before editing.";
        return {
            documents: entries.map((entry) => ({ doc: entry.doc, summary: entry.summary })),
            truncated,
            guidance
        };
    });
}
