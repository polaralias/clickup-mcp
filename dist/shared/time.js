const MILLISECOND_THRESHOLD = 1_000_000_000_000;
const MAX_REASONABLE_MILLISECONDS = 9_999_999_999_999;
function buildErrorMessage(label) {
    return `${label} must be an ISO 8601 / RFC3339 string or epoch seconds/milliseconds number.`;
}
function normaliseLabel(label) {
    if (!label)
        return "Timestamp";
    const trimmed = label.trim();
    if (!trimmed)
        return "Timestamp";
    const capitalised = trimmed[0].toUpperCase() + trimmed.slice(1);
    return capitalised;
}
export function toEpochMilliseconds(value, label) {
    const name = normaliseLabel(label);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`${name} must be a finite epoch value in seconds or milliseconds.`);
        }
        if (value < 0) {
            throw new Error(`${name} must not be negative.`);
        }
        if (value >= MILLISECOND_THRESHOLD) {
            if (value > MAX_REASONABLE_MILLISECONDS) {
                throw new Error(`${name} epoch milliseconds are out of range.`);
            }
            return Math.trunc(value);
        }
        return Math.trunc(value * 1000);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            throw new Error(buildErrorMessage(name));
        }
        if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
            throw new Error(`${name} numeric timestamps must be passed as numbers, not strings.`);
        }
        const parsed = Date.parse(trimmed);
        if (Number.isNaN(parsed)) {
            throw new Error(buildErrorMessage(name));
        }
        return parsed;
    }
    throw new Error(buildErrorMessage(name));
}
