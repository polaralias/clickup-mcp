import { runWithDocsCapability } from "../../services/DocCapability.js";
import { buildContentPreview, resolvePreviewLimit } from "./docUtils.js";
import { resolveWorkspaceId } from "./pageFetchUtils.js";
export async function createDocumentPage(input, client, config, capabilityTracker) {
    const previewLimit = resolvePreviewLimit(config);
    const content = input.content ?? "";
    const { preview, truncated } = buildContentPreview(content, previewLimit);
    const basePreview = {
        docId: input.docId,
        title: input.title,
        parentId: input.parentId,
        position: input.position,
        contentPreview: preview,
        truncated
    };
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to create doc pages");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        if (input.dryRun) {
            return {
                preview: basePreview,
                guidance: "Dry run complete. Set confirm to 'yes' to create the page, then chain clickup_get_document_pages to verify."
            };
        }
        const payload = { name: input.title };
        if (input.content !== undefined) {
            payload.content = input.content;
        }
        if (input.parentId) {
            payload.parent = input.parentId;
        }
        if (input.position !== undefined) {
            payload.orderindex = input.position;
        }
        const page = await client.createDocumentPage(input.docId, payload);
        return {
            preview: basePreview,
            page,
            guidance: "Page created. Chain clickup_get_document to refresh summaries or clickup_get_document_pages for the new body."
        };
    });
}
