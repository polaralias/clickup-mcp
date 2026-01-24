import { BulkProcessor } from "../../services/BulkProcessor.js";
import { normaliseClickUpError } from "../../../infrastructure/clickup/ClickUpClient.js";
const RESULT_PREVIEW_LIMIT = 20;
export function formatError(error) {
    return normaliseClickUpError(error);
}
export async function runBulk(items, worker, concurrency) {
    const processor = new BulkProcessor(concurrency);
    let index = 0;
    return processor.run(items, async (item) => {
        const currentIndex = index;
        index += 1;
        try {
            const result = await worker(item);
            if (result.success) {
                return {
                    index: currentIndex,
                    status: "success",
                    payload: result.payload
                };
            }
            return {
                index: currentIndex,
                status: "failed",
                payload: result.payload,
                error: result.error
            };
        }
        catch (error) {
            return {
                index: currentIndex,
                status: "failed",
                payload: {},
                error: formatError(error)
            };
        }
    });
}
export function summariseBulk(outcomes, extra = {}) {
    const ordered = [...outcomes].sort((a, b) => a.index - b.index);
    const total = outcomes.length;
    const succeeded = ordered.filter((outcome) => outcome.status === "success").length;
    const failed = total - succeeded;
    const firstError = ordered.find((outcome) => outcome.status === "failed")?.error;
    const failedIndices = ordered
        .filter((outcome) => outcome.status === "failed")
        .map((outcome) => outcome.index);
    const payloadResults = ordered.map((outcome) => {
        const base = {
            index: outcome.index,
            status: outcome.status,
            ...outcome.payload
        };
        if (outcome.error) {
            base.error = outcome.error;
        }
        return base;
    });
    const preview = payloadResults.slice(0, RESULT_PREVIEW_LIMIT);
    const truncated = payloadResults.length > RESULT_PREVIEW_LIMIT;
    const guidance = [];
    if (failedIndices.length > 0) {
        const indexPreview = failedIndices.slice(0, 10);
        guidance.push(`Partial success. Retry or inspect tasks at indices: ${indexPreview.join(", ")}${failedIndices.length > indexPreview.length ? "…" : ""}`);
    }
    return {
        total,
        succeeded,
        failed,
        firstError,
        failedIndices: failedIndices.length ? failedIndices : undefined,
        results: payloadResults,
        preview,
        truncated,
        guidance,
        ...extra
    };
}
