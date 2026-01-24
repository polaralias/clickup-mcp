import { runWithDocsCapability } from "../../services/DocCapability.js";
import { buildDocumentSummary, buildPageEntries, extractDocId, inferPageCount, resolvePreviewLimit } from "./docUtils.js";
import { extractPageListing, fetchPages, orderMetadata, resolveWorkspaceId } from "./pageFetchUtils.js";
export async function getDocumentPages(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to fetch doc pages");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        const docResponse = await client.getDocument(workspaceId, input.docId);
        const doc = (docResponse?.doc ?? docResponse ?? {});
        const docId = extractDocId(doc);
        const metadataResponse = await client.listDocPages(docId);
        const metadataAll = extractPageListing(metadataResponse);
        const orderedMetadata = orderMetadata(metadataAll, input.pageIds);
        const previewLimit = resolvePreviewLimit(config, input.previewCharLimit);
        const detailedPages = await fetchPages(client, docId, input.pageIds);
        const pageEntries = buildPageEntries(orderedMetadata, detailedPages, previewLimit);
        const pageCount = inferPageCount(doc, metadataAll);
        const summary = buildDocumentSummary(doc, pageCount, pageEntries.map((entry) => entry.preview));
        const truncated = summary.truncated;
        const guidance = truncated
            ? "Previews were truncated for token safety. Request fewer pages or chain another call for additional content."
            : "Content is ready for review. Chain clickup_update_doc_page for edits or call again with more pageIds to expand context.";
        return {
            doc,
            summary,
            pages: pageEntries,
            truncated,
            guidance
        };
    });
}
