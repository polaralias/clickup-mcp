import { BulkProcessor } from "../../services/BulkProcessor.js";
import { truncateList } from "../../limits/truncation.js";
import { listWorkspaces } from "./ListWorkspaces.js";
import { listSpaces } from "./ListSpaces.js";
import { listFolders } from "./ListFolders.js";
import { listLists } from "./ListLists.js";
const DEFAULT_MAX_WORKSPACES = 3;
const DEFAULT_MAX_SPACES_PER_WORKSPACE = 6;
const DEFAULT_MAX_FOLDERS_PER_SPACE = 6;
const DEFAULT_MAX_LISTS_PER_SPACE = 6;
const DEFAULT_MAX_LISTS_PER_FOLDER = 6;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_CONCURRENCY = 4;
const MAX_DEPTH = 3;
function parsePositiveInt(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return undefined;
}
function resolveConcurrency(override) {
    const parsedOverride = parsePositiveInt(override);
    if (parsedOverride) {
        return parsedOverride;
    }
    const envCandidates = [process.env.MAX_HIERARCHY_CONCURRENCY, process.env.MAX_BULK_CONCURRENCY];
    for (const candidate of envCandidates) {
        const parsed = parsePositiveInt(candidate);
        if (parsed) {
            return parsed;
        }
    }
    return DEFAULT_CONCURRENCY;
}
function ensureArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    return [];
}
function resolveWorkspaceId(workspace) {
    const candidates = ["id", "team_id", "teamId", "workspace_id", "workspaceId"];
    for (const key of candidates) {
        const value = workspace[key];
        if (typeof value === "string" && value) {
            return value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return undefined;
}
function resolveSpaceId(space) {
    const candidates = ["id", "space_id", "spaceId"];
    for (const key of candidates) {
        const value = space[key];
        if (typeof value === "string" && value) {
            return value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return undefined;
}
function resolveFolderId(folder) {
    const candidates = ["id", "folder_id", "folderId"];
    for (const key of candidates) {
        const value = folder[key];
        if (typeof value === "string" && value) {
            return value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return undefined;
}
function resolveName(entity) {
    const candidates = ["name", "team_name", "space_name", "folder_name", "list_name", "title"];
    for (const key of candidates) {
        const value = entity[key];
        if (typeof value === "string" && value.trim() !== "") {
            return value;
        }
    }
    return undefined;
}
function describeEntity(entity, fallback) {
    const name = resolveName(entity);
    const id = resolveWorkspaceId(entity) ??
        resolveSpaceId(entity) ??
        resolveFolderId(entity) ??
        (typeof entity.id === "string"
            ? entity.id
            : typeof entity.id === "number"
                ? String(entity.id)
                : undefined);
    if (typeof name === "string") {
        return `${fallback} "${name}"`;
    }
    if (typeof id === "string" && id) {
        return `${fallback} ${id}`;
    }
    return fallback;
}
function limitGuidance(kind, context, limit) {
    return `Only the first ${limit} ${kind} were returned for ${context}. Narrow the scope or request a higher limit if you need more detail.`;
}
function depthGuidance(kind, context, maxDepth, required) {
    return `${kind} for ${context} were not loaded because maxDepth is ${maxDepth}. Increase maxDepth to at least ${required} to drill further.`;
}
function buildContainer(items, truncated, guidance) {
    return {
        items,
        truncated,
        guidance
    };
}
function createDepthSkippedContainer(kind, context, maxDepth, required) {
    return buildContainer([], true, depthGuidance(kind, context, maxDepth, required));
}
function normaliseSelectors(input, config) {
    const selectors = [];
    if (Array.isArray(input.workspaces)) {
        for (const item of input.workspaces) {
            if (item?.id || item?.name) {
                selectors.push({ id: item.id ?? undefined, name: item.name ?? undefined });
            }
        }
    }
    if (Array.isArray(input.workspaceIds)) {
        for (const id of input.workspaceIds) {
            if (typeof id === "string" && id.trim() !== "") {
                selectors.push({ id });
            }
        }
    }
    if (Array.isArray(input.workspaceNames)) {
        for (const name of input.workspaceNames) {
            if (typeof name === "string" && name.trim() !== "") {
                selectors.push({ name });
            }
        }
    }
    if (selectors.length === 0 && config?.teamId) {
        selectors.push({ id: config.teamId });
    }
    return selectors;
}
export async function getWorkspaceHierarchy(input, client, config, directory) {
    const maxDepth = Math.min(input.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_DEPTH);
    const workspaceLimit = input.maxWorkspaces ?? DEFAULT_MAX_WORKSPACES;
    const spacesLimit = input.maxSpacesPerWorkspace ?? DEFAULT_MAX_SPACES_PER_WORKSPACE;
    const foldersLimit = input.maxFoldersPerSpace ?? DEFAULT_MAX_FOLDERS_PER_SPACE;
    const listsPerSpaceLimit = input.maxListsPerSpace ?? DEFAULT_MAX_LISTS_PER_SPACE;
    const listsPerFolderLimit = input.maxListsPerFolder ?? DEFAULT_MAX_LISTS_PER_FOLDER;
    const concurrency = resolveConcurrency(input.concurrency);
    const selectors = normaliseSelectors(input, config);
    const ensureOptions = { forceRefresh: input.forceRefresh };
    const spaceCaches = [];
    const folderCaches = [];
    const listCaches = [];
    const { workspaces: rawWorkspaces, cache: workspacesCache } = await listWorkspaces(client, directory, ensureOptions);
    const allWorkspaces = ensureArray(rawWorkspaces);
    const workspaceById = new Map();
    const workspaceByName = new Map();
    for (const workspace of allWorkspaces) {
        if (!workspace || typeof workspace !== "object")
            continue;
        const typedWorkspace = workspace;
        const id = resolveWorkspaceId(typedWorkspace);
        if (id) {
            workspaceById.set(id, typedWorkspace);
        }
        const name = resolveName(typedWorkspace);
        if (name) {
            const key = name.toLowerCase();
            if (!workspaceByName.has(key)) {
                workspaceByName.set(key, typedWorkspace);
            }
        }
    }
    const unmatchedSelectors = [];
    const matchedWorkspaces = [];
    const seenWorkspaceIds = new Set();
    if (selectors.length > 0) {
        for (const selector of selectors) {
            let match;
            if (selector.id) {
                match = workspaceById.get(selector.id);
            }
            if (!match && selector.name) {
                match = workspaceByName.get(selector.name.toLowerCase());
            }
            if (match) {
                const id = resolveWorkspaceId(match);
                if (!id || !seenWorkspaceIds.has(id)) {
                    matchedWorkspaces.push(match);
                    if (id) {
                        seenWorkspaceIds.add(id);
                    }
                }
            }
            else {
                unmatchedSelectors.push(selector);
            }
        }
    }
    else {
        for (const workspace of allWorkspaces) {
            if (!workspace || typeof workspace !== "object")
                continue;
            const typedWorkspace = workspace;
            const id = resolveWorkspaceId(typedWorkspace);
            if (id && seenWorkspaceIds.has(id)) {
                continue;
            }
            if (id) {
                seenWorkspaceIds.add(id);
            }
            matchedWorkspaces.push(typedWorkspace);
        }
    }
    const { items: limitedWorkspaces, truncated: workspacesTruncated } = truncateList(matchedWorkspaces, workspaceLimit);
    const workspaceNodes = limitedWorkspaces.map((workspace) => ({ workspace }));
    const workspaceContainer = buildContainer(workspaceNodes, workspacesTruncated, workspacesTruncated ? limitGuidance("workspaces", "the account", workspaceLimit) : undefined);
    const workspaceContexts = workspaceNodes.map((workspaceNode) => ({
        workspaceNode,
        workspaceId: resolveWorkspaceId(workspaceNode.workspace)
    }));
    if (maxDepth >= 1 && workspaceContexts.length > 0) {
        const spacesProcessor = new BulkProcessor(concurrency);
        const spacesResults = await spacesProcessor.run(workspaceContexts, async (context) => {
            const { workspaceNode, workspaceId } = context;
            if (!workspaceId) {
                return {
                    workspaceNode,
                    spaces: buildContainer([], false)
                };
            }
            const spaceResponse = await listSpaces({ workspaceId, forceRefresh: input.forceRefresh }, client, directory, ensureOptions);
            spaceCaches.push(spaceResponse.cache);
            const spaces = ensureArray(spaceResponse.spaces);
            const { items, truncated } = truncateList(spaces, spacesLimit);
            const spaceNodes = items.map((space) => ({ space }));
            const workspaceDescription = describeEntity(workspaceNode.workspace, "workspace");
            const guidance = truncated ? limitGuidance("spaces", workspaceDescription, spacesLimit) : undefined;
            return {
                workspaceNode,
                spaces: buildContainer(spaceNodes, truncated, guidance)
            };
        });
        const spaceContexts = [];
        for (const result of spacesResults) {
            const { workspaceNode, spaces } = result;
            workspaceNode.spaces = spaces;
            for (const spaceNode of spaces.items) {
                spaceContexts.push({
                    workspaceNode,
                    spaceNode,
                    spaceId: resolveSpaceId(spaceNode.space)
                });
            }
        }
        if (spaceContexts.length > 0) {
            if (maxDepth >= 2) {
                const spaceProcessor = new BulkProcessor(concurrency);
                const spaceResults = await spaceProcessor.run(spaceContexts, async (context) => {
                    const { spaceNode, spaceId } = context;
                    const spaceDescription = describeEntity(spaceNode.space, "space");
                    if (!spaceId) {
                        return {
                            spaceNode,
                            lists: buildContainer([], false),
                            folders: buildContainer([], false),
                            folderContexts: []
                        };
                    }
                    const listsResponse = await listLists({ spaceId, forceRefresh: input.forceRefresh }, client, directory, ensureOptions);
                    listCaches.push(listsResponse.cache);
                    const spaceLists = ensureArray(listsResponse.lists);
                    const { items: limitedLists, truncated: listsTruncated } = truncateList(spaceLists, listsPerSpaceLimit);
                    const listNodes = limitedLists.map((list) => ({ list }));
                    const listGuidance = listsTruncated
                        ? limitGuidance("lists", spaceDescription, listsPerSpaceLimit)
                        : undefined;
                    const foldersResponse = await listFolders({ spaceId, forceRefresh: input.forceRefresh }, client, directory, ensureOptions);
                    folderCaches.push(foldersResponse.cache);
                    const spaceFolders = ensureArray(foldersResponse.folders);
                    const { items: limitedFolders, truncated: foldersTruncated } = truncateList(spaceFolders, foldersLimit);
                    const folderNodes = limitedFolders.map((folder) => ({ folder }));
                    const folderGuidance = foldersTruncated
                        ? limitGuidance("folders", spaceDescription, foldersLimit)
                        : undefined;
                    const folderContexts = folderNodes.map((folderNode) => ({
                        spaceNode,
                        folderNode,
                        folderId: resolveFolderId(folderNode.folder)
                    }));
                    return {
                        spaceNode,
                        lists: buildContainer(listNodes, listsTruncated, listGuidance),
                        folders: buildContainer(folderNodes, foldersTruncated, folderGuidance),
                        folderContexts
                    };
                });
                const folderContexts = [];
                for (const result of spaceResults) {
                    const { spaceNode, lists, folders, folderContexts: contexts } = result;
                    spaceNode.lists = lists;
                    spaceNode.folders = folders;
                    folderContexts.push(...contexts);
                }
                if (folderContexts.length > 0) {
                    if (maxDepth >= 3) {
                        const folderProcessor = new BulkProcessor(concurrency);
                        const folderResults = await folderProcessor.run(folderContexts, async (context) => {
                            const { folderNode, folderId } = context;
                            const folderDescription = describeEntity(folderNode.folder, "folder");
                            if (!folderId) {
                                return {
                                    folderNode,
                                    lists: buildContainer([], false)
                                };
                            }
                            const listsResponse = await listLists({ folderId, spaceId: resolveSpaceId(context.spaceNode.space), forceRefresh: input.forceRefresh }, client, directory, ensureOptions);
                            listCaches.push(listsResponse.cache);
                            const folderLists = ensureArray(listsResponse.lists);
                            const { items: limitedLists, truncated } = truncateList(folderLists, listsPerFolderLimit);
                            const listNodes = limitedLists.map((list) => ({ list }));
                            const guidance = truncated
                                ? limitGuidance("lists", folderDescription, listsPerFolderLimit)
                                : undefined;
                            return {
                                folderNode,
                                lists: buildContainer(listNodes, truncated, guidance)
                            };
                        });
                        for (const result of folderResults) {
                            const { folderNode, lists } = result;
                            folderNode.lists = lists;
                        }
                    }
                    else {
                        for (const context of folderContexts) {
                            const folderDescription = describeEntity(context.folderNode.folder, "folder");
                            context.folderNode.lists = createDepthSkippedContainer("lists", folderDescription, maxDepth, 3);
                        }
                    }
                }
            }
            else {
                for (const context of spaceContexts) {
                    const description = describeEntity(context.spaceNode.space, "space");
                    context.spaceNode.lists = createDepthSkippedContainer("lists", description, maxDepth, 2);
                    context.spaceNode.folders = createDepthSkippedContainer("folders", description, maxDepth, 2);
                }
            }
        }
    }
    else {
        for (const context of workspaceContexts) {
            const workspaceDescription = describeEntity(context.workspaceNode.workspace, "workspace");
            context.workspaceNode.spaces = createDepthSkippedContainer("spaces", workspaceDescription, maxDepth, 1);
        }
    }
    const cache = {};
    if (workspacesCache)
        cache.workspaces = workspacesCache;
    if (spaceCaches.length > 0)
        cache.spaces = spaceCaches;
    if (folderCaches.length > 0)
        cache.folders = folderCaches;
    if (listCaches.length > 0)
        cache.lists = listCaches;
    return {
        workspaces: workspaceContainer,
        unmatchedSelectors: unmatchedSelectors.length > 0 ? unmatchedSelectors : undefined,
        shape: {
            layers: [
                {
                    level: "workspace",
                    path: "workspaces.items[].workspace",
                    description: "Workspace/team metadata as returned by ClickUp."
                },
                {
                    level: "space",
                    path: "workspaces.items[].spaces.items[].space",
                    description: "Spaces within the workspace."
                },
                {
                    level: "space_lists",
                    path: "workspaces.items[].spaces.items[].lists.items[].list",
                    description: "Lists that live directly within a space (no folder)."
                },
                {
                    level: "folder",
                    path: "workspaces.items[].spaces.items[].folders.items[].folder",
                    description: "Folders within a space."
                },
                {
                    level: "folder_lists",
                    path: "workspaces.items[].spaces.items[].folders.items[].lists.items[].list",
                    description: "Lists contained inside a folder."
                }
            ],
            containerFields: ["items", "truncated", "guidance"]
        },
        cache: Object.keys(cache).length > 0 ? cache : undefined
    };
}
