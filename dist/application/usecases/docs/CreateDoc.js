import { runWithDocsCapability } from "../../services/DocCapability.js";
import { resolveWorkspaceId } from "./pageFetchUtils.js";
export async function createDoc(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to create docs");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        if (input.dryRun) {
            return {
                preview: {
                    folderId: input.folderId,
                    name: input.name,
                    hasContent: Boolean(input.content)
                }
            };
        }
        const payload = {
            name: input.name,
            folder_id: input.folderId
        };
        if (input.content !== undefined) {
            payload.content = input.content;
        }
        const doc = await client.createDoc(workspaceId, payload);
        return { doc };
    });
}
