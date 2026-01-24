import { normaliseHierarchyPath } from "./pathShared.js";
function findByName(items, name) {
    const lower = name.toLowerCase();
    return items.find((item) => {
        const itemName = item.name ?? item.title ?? item.space_name;
        return typeof itemName === "string" && itemName.toLowerCase() === lower;
    });
}
export async function resolvePathToIds(input, client, directory, options = {}) {
    const result = {};
    const cache = {};
    const ensureOptions = {
        forceRefresh: options.forceRefresh ?? input.forceRefresh
    };
    const segments = normaliseHierarchyPath(input.path);
    for (const segment of segments) {
        if (segment.type === "workspace") {
            const { items: workspaces, cache: workspaceCache } = await directory.ensureWorkspaces(() => client.listWorkspaces(), ensureOptions);
            cache.workspaces = workspaceCache;
            const match = findByName(workspaces ?? [], segment.name);
            if (!match)
                throw new Error(`Workspace not found: ${segment.name}`);
            result.workspaceId = match.id ?? match.team_id;
        }
        if (segment.type === "space") {
            if (!result.workspaceId) {
                throw new Error("Resolve workspace before space");
            }
            const { items: spaces, cache: spacesCache } = await directory.ensureSpaces(result.workspaceId, () => client.listSpaces(result.workspaceId), ensureOptions);
            cache.spaces = spacesCache;
            const match = findByName(spaces ?? [], segment.name);
            if (!match)
                throw new Error(`Space not found: ${segment.name}`);
            result.spaceId = match.id ?? match.space_id;
        }
        if (segment.type === "folder") {
            if (!result.spaceId) {
                throw new Error("Resolve space before folder");
            }
            const { items: folders, cache: foldersCache } = await directory.ensureFolders(result.spaceId, () => client.listFolders(result.spaceId), ensureOptions);
            cache.folders = foldersCache;
            const match = findByName(folders ?? [], segment.name);
            if (!match)
                throw new Error(`Folder not found: ${segment.name}`);
            result.folderId = match.id ?? match.folder_id;
        }
        if (segment.type === "list") {
            if (!result.spaceId && !result.folderId) {
                throw new Error("Resolve space or folder before list");
            }
            const { items: lists, cache: listsCache } = await directory.ensureLists(result.spaceId, result.folderId, () => client.listLists(result.spaceId ?? "", result.folderId), ensureOptions);
            cache.lists = listsCache;
            const match = findByName(lists ?? [], segment.name);
            if (!match)
                throw new Error(`List not found: ${segment.name}`);
            result.listId = match.id ?? match.list_id;
        }
    }
    if (Object.keys(cache).length > 0) {
        result.cache = cache;
    }
    return result;
}
