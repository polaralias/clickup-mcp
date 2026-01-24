import { BulkProcessor } from "../../services/BulkProcessor.js";
import { docSearch } from "./DocSearch.js";
import { isDocCapabilityError } from "../../services/DocCapability.js";
const DEFAULT_CONCURRENCY = 5;
function resolveConcurrency() {
    const limit = Number(process.env.MAX_BULK_CONCURRENCY ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CONCURRENCY;
}
export async function bulkDocSearch(input, client, config, capabilityTracker) {
    const processor = new BulkProcessor(resolveConcurrency());
    const results = await processor.run(input.queries, async (query) => {
        const result = await docSearch({
            query,
            limit: input.limit,
            expandPages: input.expandPages,
            workspaceId: input.workspaceId
        }, client, config, capabilityTracker);
        if (isDocCapabilityError(result)) {
            return result;
        }
        return {
            query,
            docs: result.docs,
            expandedPages: result.expandedPages,
            guidance: result.guidance
        };
    });
    const capabilityError = results.find((entry) => isDocCapabilityError(entry));
    if (capabilityError) {
        return capabilityError;
    }
    return results;
}
