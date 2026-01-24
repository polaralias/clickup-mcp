import { resolvePathToIds } from "./ResolvePathToIds.js";
import { normaliseHierarchyPath } from "./pathShared.js";
export function normaliseStatuses(statuses) {
    if (!statuses || statuses.length === 0) {
        return undefined;
    }
    return statuses.map((status, index) => {
        const name = status.status ?? status.name ?? `Status ${index + 1}`;
        const result = { status: name };
        if (status.type)
            result.type = status.type;
        if (status.color)
            result.color = status.color;
        if (status.orderindex !== undefined)
            result.orderindex = status.orderindex;
        if (status.description)
            result.description = status.description;
        return result;
    });
}
export function compactRecord(record) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null));
}
export function readString(candidate, keys) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    for (const key of keys) {
        const value = candidate[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
export async function resolveIdsFromPath(path, client, directory, options = {}) {
    const segments = normaliseHierarchyPath(path);
    if (segments.length === 0) {
        return undefined;
    }
    return resolvePathToIds({ path: segments, forceRefresh: options.forceRefresh }, client, directory, options);
}
export { normaliseHierarchyPath };
export function buildViewFilters(statuses, tags) {
    if ((!statuses || statuses.length === 0) && (!tags || tags.length === 0)) {
        return undefined;
    }
    if ((!tags || tags.length === 0) && statuses && statuses.length > 0) {
        return { statuses };
    }
    const fields = [];
    if (statuses && statuses.length > 0) {
        fields.push({
            field: "status",
            op: "EQ",
            values: statuses
        });
    }
    if (tags && tags.length > 0) {
        fields.push({
            field: "tag",
            op: "ANY",
            values: tags
        });
    }
    if (fields.length === 0) {
        return undefined;
    }
    return {
        op: "AND",
        fields,
        search: "",
        show_closed: false
    };
}
