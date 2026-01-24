import { runWithDocsCapability } from "../../services/DocCapability.js";
import { buildDocumentSummary, buildPageEntries, extractDocId, extractPageId, inferPageCount, resolvePreviewLimit } from "./docUtils.js";
import { extractPageListing, fetchPages, orderMetadata, resolveWorkspaceId } from "./pageFetchUtils.js";
export async function getDocument(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to fetch docs");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        const response = await client.getDocument(workspaceId, input.docId);
        const doc = (response?.doc ?? response ?? {});
        const docId = extractDocId(doc);
        const pagesResponse = await client.listDocPages(docId);
        const metadataAll = extractPageListing(pagesResponse);
        const orderedMetadata = orderMetadata(metadataAll, input.pageIds);
        const limitedMetadata = Array.isArray(input.pageIds) && input.pageIds.length > 0
            ? orderedMetadata
            : orderedMetadata.slice(0, input.pageLimit);
        const previewLimit = resolvePreviewLimit(config, input.previewCharLimit);
        const includePages = input.includePages ?? true;
        const fetchIds = includePages
            ? limitedMetadata
                .map((page) => extractPageId(page))
                .filter((value) => Boolean(value))
            : [];
        const detailed = includePages ? await fetchPages(client, docId, fetchIds) : [];
        const pageEntries = includePages
            ? buildPageEntries(limitedMetadata, detailed, previewLimit)
            : [];
        const pagePreviews = pageEntries.map((entry) => entry.preview);
        const pageCount = inferPageCount(doc, metadataAll);
        const summary = buildDocumentSummary(doc, pageCount, pagePreviews);
        const truncated = summary.truncated;
        const guidance = truncated
            ? "Page previews were truncated. Chain clickup_get_document_pages for specific bodies or clickup_update_doc_page before editing."
            : "Use clickup_get_document_pages for targeted page bodies or clickup_create_document_page to add new content.";
        return {
            doc,
            summary,
            pages: includePages ? pageEntries : undefined,
            truncated,
            guidance
        };
    });
}
