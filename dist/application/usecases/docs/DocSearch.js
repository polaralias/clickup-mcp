import { BulkProcessor } from "../../services/BulkProcessor.js";
import { runWithDocsCapability } from "../../services/DocCapability.js";
import { extractPageListing, resolveWorkspaceId } from "./pageFetchUtils.js";
const DEFAULT_CONCURRENCY = 5;
function normaliseLimit(rawLimit) {
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;
}
function extractDocId(doc) {
    const id = doc.id ?? doc.doc_id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
}
function buildPageSignature(docs) {
    const ids = docs
        .map((doc) => extractDocId(doc))
        .filter((id) => typeof id === "string" && id.length > 0);
    if (ids.length === 0) {
        return undefined;
    }
    return ids.join("|");
}
function resolveConcurrency() {
    const limit = Number(process.env.MAX_BULK_CONCURRENCY ?? DEFAULT_CONCURRENCY);
    return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CONCURRENCY;
}
export async function docSearch(input, client, config, capabilityTracker) {
    const workspaceId = resolveWorkspaceId(input.workspaceId, config, "teamId is required for doc search");
    const limit = normaliseLimit(input.limit);
    const collected = [];
    const seenIds = new Set();
    const seenSignatures = new Set();
    let exhausted = false;
    return runWithDocsCapability(workspaceId, client, capabilityTracker, async () => {
        for (let page = 0; collected.length < limit; page += 1) {
            const response = await client.searchDocs(workspaceId, { search: input.query, page });
            const docs = Array.isArray(response?.docs) ? response.docs : [];
            if (docs.length === 0) {
                exhausted = true;
                break;
            }
            const signature = buildPageSignature(docs);
            if (signature && seenSignatures.has(signature)) {
                exhausted = true;
                break;
            }
            if (signature) {
                seenSignatures.add(signature);
            }
            const newDocs = docs.filter((doc) => {
                const docId = extractDocId(doc);
                if (!docId) {
                    return true;
                }
                if (seenIds.has(docId)) {
                    return false;
                }
                seenIds.add(docId);
                return true;
            });
            if (newDocs.length === 0) {
                exhausted = true;
                break;
            }
            collected.push(...newDocs);
        }
        const limited = collected.slice(0, limit);
        let expandedPages;
        if (input.expandPages && limited.length > 0) {
            const processor = new BulkProcessor(resolveConcurrency());
            const results = await processor.run(limited, async (doc) => {
                const docId = extractDocId(doc) ?? "";
                const pagesResponse = await client.listDocPages(docId);
                const pages = extractPageListing(pagesResponse);
                return { docId, pages };
            });
            expandedPages = Object.fromEntries(results.map((entry) => [entry.docId, entry.pages]));
        }
        let guidance;
        if (limited.length === 0) {
            guidance = "No docs found. Adjust the query or search scope.";
        }
        else if (!exhausted && collected.length >= limit) {
            guidance = "More docs available. Increase limit or refine the query to narrow results.";
        }
        return { docs: limited, expandedPages, guidance };
    });
}
