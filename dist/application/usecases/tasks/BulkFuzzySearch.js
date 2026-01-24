import { BulkProcessor } from "../../services/BulkProcessor.js";
import { fuzzySearch } from "./FuzzySearch.js";
const DEFAULT_CONCURRENCY = 10;
function resolveConcurrency() {
    const limit = Number(process.env.MAX_BULK_CONCURRENCY ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CONCURRENCY;
}
export async function bulkFuzzySearch(input, client, config, catalogue) {
    const processor = new BulkProcessor(resolveConcurrency());
    const results = await processor.run(input.queries, async (query) => {
        const result = await fuzzySearch({ query, limit: input.limit }, client, config, catalogue);
        return { query, results: result.results, guidance: result.guidance };
    });
    return results;
}
