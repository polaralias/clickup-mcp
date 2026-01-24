function normaliseId(value) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return undefined;
}
function collectIds(input, keys) {
    const results = new Set();
    if (!input || typeof input !== "object")
        return results;
    if (Array.isArray(input)) {
        input.forEach((entry) => {
            const nested = collectIds(entry, keys);
            nested.forEach((id) => results.add(id));
        });
        return results;
    }
    const record = input;
    for (const key of keys) {
        if (key in record) {
            const value = record[key];
            if (Array.isArray(value)) {
                value.forEach((entry) => {
                    const id = normaliseId(entry);
                    if (id)
                        results.add(id);
                });
            }
            else {
                const id = normaliseId(value);
                if (id)
                    results.add(id);
            }
        }
    }
    const containers = ["tasks", "subtasks", "defaults", "operations"];
    for (const container of containers) {
        if (container in record) {
            const nested = collectIds(record[container], keys);
            nested.forEach((id) => results.add(id));
        }
    }
    return results;
}
async function resolveTaskContext(taskId, client) {
    const listIds = new Set();
    const spaceIds = new Set();
    const id = normaliseId(taskId);
    if (!id)
        return { listIds, spaceIds };
    const response = await client.getTask(id);
    const listId = normaliseId(response?.task?.list?.id ?? response?.list?.id);
    const spaceId = normaliseId(response?.task?.space?.id ?? response?.task?.team_id ?? response?.space?.id);
    if (listId)
        listIds.add(listId);
    if (spaceId)
        spaceIds.add(spaceId);
    return { listIds, spaceIds };
}
async function resolveListSpaces(listIds, client) {
    const spaceIds = new Set();
    const listToSpace = new Map();
    for (const listId of listIds) {
        try {
            const response = await client.getList(listId);
            const raw = response;
            const directSpace = normaliseId(raw.space_id ?? raw.spaceId ?? raw.team_id);
            const nestedSpace = normaliseId(raw.space?.id);
            const folderSpace = normaliseId(raw.folder?.space_id);
            const spaceId = directSpace ?? nestedSpace ?? folderSpace;
            if (directSpace)
                spaceIds.add(directSpace);
            if (nestedSpace)
                spaceIds.add(nestedSpace);
            if (folderSpace)
                spaceIds.add(folderSpace);
            if (spaceId) {
                listToSpace.set(listId, spaceId);
            }
        }
        catch {
            continue;
        }
    }
    return { spaceIds, listToSpace };
}
async function resolveDocContext(docId, workspaceId, client) {
    const listIds = new Set();
    const spaceIds = new Set();
    const id = normaliseId(docId);
    if (!id || !workspaceId)
        return { listIds, spaceIds };
    try {
        const response = (await client.getDocument(workspaceId, id));
        const spaceId = normaliseId(response.space_id ?? response.spaceId ?? response.team_id ?? response.workspace_id ?? response.space?.id);
        const listId = normaliseId(response.list_id ?? response.list?.id);
        if (spaceId)
            spaceIds.add(spaceId);
        if (listId)
            listIds.add(listId);
    }
    catch {
        return { listIds, spaceIds };
    }
    return { listIds, spaceIds };
}
export async function ensureWriteAllowed(input, client, config) {
    const access = config.writeAccess;
    if (access.mode === "write") {
        return;
    }
    if (access.mode === "read") {
        throw new Error("Write operations are disabled in read mode.");
    }
    const spaceIds = collectIds(input, ["spaceId", "workspaceId", "teamId", "spaceIds", "workspaceIds"]);
    const listIds = collectIds(input, ["listId", "listIds"]);
    if (!spaceIds.size && !listIds.size) {
        const taskIds = collectIds(input, ["taskId", "parentTaskId"]);
        if (taskIds.size > 0) {
            // Limit to first 5 to avoid API flood
            const idsToCheck = [...taskIds].slice(0, 5);
            for (const id of idsToCheck) {
                try {
                    const derived = await resolveTaskContext(id, client);
                    derived.listIds.forEach((id) => listIds.add(id));
                    derived.spaceIds.forEach((id) => spaceIds.add(id));
                }
                catch {
                    // Ignore failures for individual tasks
                }
            }
        }
    }
    if (!spaceIds.size && !listIds.size) {
        const docIds = collectIds(input, ["docId", "documentId"]);
        if (docIds.size > 0) {
            // Limit resolution
            const idsToCheck = [...docIds].slice(0, 5);
            for (const id of idsToCheck) {
                const derived = await resolveDocContext(id, config.teamId, client);
                derived.listIds.forEach((id) => listIds.add(id));
                derived.spaceIds.forEach((id) => spaceIds.add(id));
            }
        }
    }
    if (!spaceIds.size && !listIds.size) {
        throw new Error("Write operations are restricted to explicitly allowed spaces or lists. Include a spaceId or listId to proceed.");
    }
    // Strict verification: ALL targets must be allowed.
    // 1. Verify all spaces are allowed
    const forbiddenSpaces = [];
    for (const id of spaceIds) {
        if (!access.allowedSpaces.has(id)) {
            forbiddenSpaces.push(id);
        }
    }
    if (forbiddenSpaces.length > 0) {
        console.log("Write access denied (forbidden spaces):", { forbiddenSpaces });
        throw new Error(`Write operations are not allowed for the following spaces/teams: ${forbiddenSpaces.join(", ")}`);
    }
    // 2. Verify all lists are allowed (either directly or via space)
    const listsToCheck = new Set();
    for (const id of listIds) {
        if (!access.allowedLists.has(id)) {
            listsToCheck.add(id);
        }
    }
    if (listsToCheck.size > 0) {
        const { listToSpace } = await resolveListSpaces(listsToCheck, client);
        const forbiddenLists = [];
        for (const listId of listsToCheck) {
            const spaceId = listToSpace.get(listId);
            if (!spaceId || !access.allowedSpaces.has(spaceId)) {
                forbiddenLists.push(listId);
            }
        }
        if (forbiddenLists.length > 0) {
            console.log("Write access denied (forbidden lists):", { forbiddenLists });
            throw new Error(`Write operations are not allowed for the following lists: ${forbiddenLists.join(", ")}`);
        }
    }
}
