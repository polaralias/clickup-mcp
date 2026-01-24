import { runWithDocsCapability } from "../../services/DocCapability.js";
import { extractPageListing, resolveWorkspaceId } from "./pageFetchUtils.js";
export async function listDocPages(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required to list doc pages");
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        const pages = await client.listDocPages(input.docId);
        return { pages: extractPageListing(pages) };
    });
}
