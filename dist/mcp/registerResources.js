import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClickUpClient } from "../infrastructure/clickup/ClickUpClient.js";
import { listWorkspaces } from "../application/usecases/hierarchy/ListWorkspaces.js";
import { listSpaces } from "../application/usecases/hierarchy/ListSpaces.js";
import { listFolders } from "../application/usecases/hierarchy/ListFolders.js";
import { listLists } from "../application/usecases/hierarchy/ListLists.js";
import { getWorkspaceHierarchy } from "../application/usecases/hierarchy/GetWorkspaceHierarchy.js";
import { listTasksInList } from "../application/usecases/tasks/ListTasksInList.js";
import { listDocuments } from "../application/usecases/docs/ListDocuments.js";
import { getDocument } from "../application/usecases/docs/GetDocument.js";
import { getDocumentPages } from "../application/usecases/docs/GetDocumentPages.js";
import { ensureDocsCapability, isDocCapabilityError, isDocsCapabilityUnavailableError } from "../application/services/DocCapability.js";
import { HierarchyDirectory } from "../application/services/HierarchyDirectory.js";
import { TaskCatalogue } from "../application/services/TaskCatalogue.js";
import { CapabilityTracker } from "../application/services/CapabilityTracker.js";
function resolveId(entity, keys) {
    for (const key of keys) {
        const value = entity[key];
        if (typeof value === "string" && value) {
            return value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return undefined;
}
function resolveName(entity, fallbacks) {
    for (const key of fallbacks) {
        const value = entity[key];
        if (typeof value === "string" && value.trim() !== "") {
            return value;
        }
    }
    return undefined;
}
function formatResourceContent(uri, payload) {
    return {
        contents: [
            {
                uri: uri.toString(),
                mimeType: "application/json",
                text: JSON.stringify(payload, null, 2)
            }
        ]
    };
}
function normaliseResourceName(config) {
    if (typeof config === "string") {
        return { canonical: config, legacy: [] };
    }
    return { canonical: config.canonical, legacy: config.legacy ?? [] };
}
export function registerResources(server, config, sessionCache) {
    const createClient = () => new ClickUpClient(config.apiKey);
    const hierarchyDirectory = new HierarchyDirectory(config.hierarchyCacheTtlMs, sessionCache, config.teamId);
    const taskCatalogue = new TaskCatalogue();
    const capabilityTracker = new CapabilityTracker();
    function registerResourceWithAliases(nameConfig, template, description, handler) {
        const { canonical, legacy } = normaliseResourceName(nameConfig);
        server.registerResource(canonical, template, { description }, handler);
        legacy.forEach((legacyName) => server.registerResource(legacyName, template, { description: `Deprecated - use ${canonical}. ${description}` }, handler));
    }
    const workspaceTemplate = new ResourceTemplate("clickup://workspace/{workspaceId}/hierarchy", {
        list: async () => {
            const client = createClient();
            const { workspaces } = await listWorkspaces(client, hierarchyDirectory);
            const resources = workspaces
                .map((workspace) => {
                const workspaceId = resolveId(workspace, ["id", "team_id", "teamId", "workspace_id", "workspaceId"]) ?? config.teamId;
                const workspaceName = resolveName(workspace, ["name", "team_name", "workspace_name"]) ?? workspaceId;
                const uri = `clickup://workspace/${encodeURIComponent(workspaceId)}/hierarchy`;
                return {
                    name: `workspace_hierarchy_${workspaceId}`,
                    uri,
                    title: workspaceName,
                    description: `Hierarchy for workspace ${workspaceName}`
                };
            })
                .filter((resource) => Boolean(resource.uri));
            return { resources };
        }
    });
    registerResourceWithAliases({ canonical: "workspace_hierarchy", legacy: ["clickup-workspace-hierarchy"] }, workspaceTemplate, "Browse workspace structures (spaces, folders, lists) when you know the workspace ID.", async (uri, variables, _extra) => {
        const client = createClient();
        const workspaceId = variables.workspaceId ?? config.teamId;
        const hierarchy = await getWorkspaceHierarchy({ workspaceIds: [workspaceId], maxDepth: 3 }, client, config, hierarchyDirectory);
        return formatResourceContent(uri, hierarchy);
    });
    const listsTemplate = new ResourceTemplate("clickup://space/{spaceId}/list/{listId}", {
        list: async () => {
            const client = createClient();
            const { workspaces } = await listWorkspaces(client, hierarchyDirectory);
            const resources = [];
            for (const workspace of workspaces) {
                const workspaceId = resolveId(workspace, ["id", "team_id", "teamId", "workspace_id", "workspaceId"]) ?? config.teamId;
                const spacesResult = await listSpaces({ workspaceId }, client, hierarchyDirectory);
                for (const space of spacesResult.spaces) {
                    const spaceId = resolveId(space, ["id", "space_id", "spaceId"]);
                    if (!spaceId)
                        continue;
                    const spaceName = resolveName(space, ["name", "space_name"]) ?? `Space ${spaceId}`;
                    const directLists = await listLists({ spaceId }, client, hierarchyDirectory);
                    for (const list of directLists.lists) {
                        const listId = resolveId(list, ["id", "list_id", "listId"]);
                        if (!listId)
                            continue;
                        const listName = resolveName(list, ["name", "list_name", "title"]) ?? `List ${listId}`;
                        resources.push({
                            name: `space_${spaceId}_list_${listId}_tasks`,
                            uri: `clickup://space/${encodeURIComponent(spaceId)}/list/${encodeURIComponent(listId)}`,
                            title: listName,
                            description: `${spaceName} list ${listId}`
                        });
                    }
                    const folders = await listFolders({ spaceId }, client, hierarchyDirectory);
                    for (const folder of folders.folders) {
                        const folderId = resolveId(folder, ["id", "folder_id", "folderId"]);
                        if (!folderId)
                            continue;
                        const folderLists = await listLists({ folderId }, client, hierarchyDirectory);
                        for (const list of folderLists.lists) {
                            const listId = resolveId(list, ["id", "list_id", "listId"]);
                            if (!listId)
                                continue;
                            const listName = resolveName(list, ["name", "list_name", "title"]) ?? `List ${listId}`;
                            resources.push({
                                name: `space_${spaceId}_folder_${folderId}_list_${listId}_tasks`,
                                uri: `clickup://space/${encodeURIComponent(spaceId)}/list/${encodeURIComponent(listId)}`,
                                title: listName,
                                description: `${spaceName} folder ${folderId}`
                            });
                        }
                    }
                }
            }
            return { resources };
        }
    });
    registerResourceWithAliases({ canonical: "task_preview_for_list", legacy: ["clickup-lists"] }, listsTemplate, "Preview the first tasks in a ClickUp list when you already know spaceId and listId.", async (uri, variables, _extra) => {
        const client = createClient();
        const spaceId = variables.spaceId;
        const listId = variables.listId;
        const result = await listTasksInList({
            listId,
            limit: 5,
            page: 0,
            includeClosed: false,
            includeSubtasks: true,
            includeTasksInMultipleLists: false,
            assigneePreviewLimit: 5
        }, client, config, taskCatalogue);
        const rawTasks = result?.tasks ?? result;
        const tasksArray = Array.isArray(rawTasks) ? rawTasks : rawTasks ? [rawTasks] : [];
        const total = result?.total ?? tasksArray.length;
        const truncated = !!result?.truncated;
        const guidance = result?.guidance;
        return formatResourceContent(uri, {
            listId,
            spaceId,
            tasks: tasksArray,
            total,
            truncated,
            guidance
        });
    });
    const docsTemplate = new ResourceTemplate("clickup://doc/{docId}", {
        list: async () => {
            const client = createClient();
            try {
                await ensureDocsCapability(config.teamId, client, capabilityTracker);
            }
            catch (error) {
                if (isDocsCapabilityUnavailableError(error)) {
                    return { resources: [] };
                }
            }
            const docs = await listDocuments({
                workspaceId: config.teamId,
                limit: 10,
                includePreviews: true,
                previewPageLimit: 3,
                previewCharLimit: config.charLimit
            }, client, config, capabilityTracker);
            if (isDocCapabilityError(docs)) {
                return { resources: [] };
            }
            const resources = [];
            for (const entry of docs.documents) {
                const docId = entry.summary.docId;
                const docTitle = entry.summary.name ?? `Doc ${docId}`;
                const docUri = `clickup://doc/${encodeURIComponent(docId)}`;
                resources.push({
                    name: `doc_${docId}`,
                    uri: docUri,
                    title: docTitle,
                    description: entry.summary.hierarchy.path
                });
                entry.summary.pagePreviews.slice(0, 3).forEach((preview) => {
                    const pageUri = `${docUri}?pageId=${encodeURIComponent(preview.pageId)}`;
                    const pageTitle = preview.title ?? `Page ${preview.pageId}`;
                    resources.push({
                        name: `doc_${docId}_page_${preview.pageId}`,
                        uri: pageUri,
                        title: `${docTitle} / ${pageTitle}`,
                        description: preview.preview
                    });
                });
            }
            return { resources };
        }
    });
    registerResourceWithAliases({ canonical: "doc_preview", legacy: ["clickup-docs"] }, docsTemplate, "Browse ClickUp docs and pages with previews using docId. Use doc tools for structured retrieval.", async (uri, variables, _extra) => {
        const client = createClient();
        const docId = variables.docId;
        const searchParams = new URL(uri.toString()).searchParams;
        const pageId = searchParams.get("pageId") ?? undefined;
        if (pageId) {
            const pages = await getDocumentPages({ workspaceId: config.teamId, docId, pageIds: [pageId], previewCharLimit: config.charLimit }, client, config, capabilityTracker);
            return formatResourceContent(uri, pages);
        }
        const doc = await getDocument({ workspaceId: config.teamId, docId, includePages: true, pageLimit: 3, previewCharLimit: config.charLimit }, client, config, capabilityTracker);
        return formatResourceContent(uri, doc);
    });
}
