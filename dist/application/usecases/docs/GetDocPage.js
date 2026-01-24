import { runWithDocsCapability } from "../../services/DocCapability.js";
export async function getDocPage(input, client, config, capabilityTracker) {
    return runWithDocsCapability(config.teamId, client, capabilityTracker, async () => {
        const page = await client.getDocPage(input.docId, input.pageId);
        return { page };
    });
}
