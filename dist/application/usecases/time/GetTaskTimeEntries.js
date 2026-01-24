import { truncateList } from "../../limits/truncation.js";
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}
function extractDuration(entry) {
    if (!entry || typeof entry !== "object") {
        return 0;
    }
    const record = entry;
    const candidates = ["duration", "durationMs", "duration_ms"];
    for (const key of candidates) {
        const duration = toNumber(record[key]);
        if (duration !== undefined) {
            return duration;
        }
    }
    return 0;
}
export async function getTaskTimeEntries(input, client) {
    const response = await client.getTaskTimeEntries(input.taskId);
    const rawEntries = Array.isArray(response?.data) ? response.data : [];
    const entryCount = rawEntries.length;
    const totalDurationMs = rawEntries.reduce((total, entry) => total + extractDuration(entry), 0);
    const { items, truncated } = truncateList(rawEntries, input.pageSize);
    const guidance = truncated
        ? `Showing the first ${items.length} of ${entryCount} entries. Increase pageSize (max 100) for more detail.`
        : entryCount === 0
            ? "No time entries recorded for this task."
            : "All time entries for this task are included.";
    return {
        taskId: input.taskId,
        entries: items,
        entryCount,
        totalDurationMs,
        truncated,
        guidance
    };
}
