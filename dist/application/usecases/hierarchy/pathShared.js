import { HierarchyPathLevels } from "../../../mcp/schemas/hierarchy.js";
export function normaliseHierarchyPath(path) {
    if (!path || path.length === 0) {
        return [];
    }
    const result = [];
    let lastIndex = -1;
    for (const segment of path) {
        if (typeof segment === "string") {
            const nextIndex = lastIndex + 1;
            const type = HierarchyPathLevels[nextIndex];
            if (!type) {
                throw new Error("Hierarchy path has more segments than supported. Use {type,name} objects to disambiguate.");
            }
            result.push({ type, name: segment });
            lastIndex = nextIndex;
            continue;
        }
        const index = HierarchyPathLevels.indexOf(segment.type);
        if (index === -1) {
            throw new Error(`Unsupported hierarchy segment type: ${segment.type}`);
        }
        if (index <= lastIndex) {
            const previousType = result.length > 0 ? result[result.length - 1]?.type ?? "start" : "start";
            throw new Error(`Hierarchy segments must progress in order. Received ${segment.type} after ${previousType}.`);
        }
        result.push({ type: segment.type, name: segment.name });
        lastIndex = index;
    }
    return result;
}
