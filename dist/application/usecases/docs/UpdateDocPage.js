import { runWithDocsCapability } from "../../services/DocCapability.js";
import { resolveWorkspaceId } from "./pageFetchUtils.js";
export async function updateDocPage(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to update doc pages");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        const payload = {};
        if (input.title !== undefined)
            payload.name = input.title;
        if (input.content !== undefined)
            payload.content = input.content;
        if (input.dryRun) {
            return { preview: { docId: input.docId, pageId: input.pageId, fields: Object.keys(payload) } };
        }
        const page = await client.updateDocPage(input.docId, input.pageId, payload);
        return { page };
    });
}
