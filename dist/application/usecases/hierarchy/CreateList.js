import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath } from "./structureShared.js";
export async function createList(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const spaceId = input.spaceId ?? resolution?.spaceId;
    const folderId = input.folderId ?? resolution?.folderId;
    if (!spaceId && !folderId) {
        throw new Error("Provide spaceId, folderId, or include the container in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const nextSteps = [
        "Use clickup_create_task to add tasks into this list.",
        "Call clickup_list_tasks_in_list to confirm the list contents."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "create",
                target: folderId ? { folderId } : { spaceId },
                name: input.name,
                description: input.description,
                statusCount: statuses?.length ?? 0
            },
            nextSteps
        };
    }
    const payload = compactRecord({
        name: input.name,
        content: input.description,
        statuses,
        override_statuses: statuses ? true : undefined
    });
    const list = folderId
        ? await client.createListInFolder(folderId, payload)
        : await client.createListInSpace(spaceId, payload);
    if (folderId) {
        directory.invalidateListsForFolder(folderId);
    }
    else if (spaceId) {
        directory.invalidateListsForSpace(spaceId);
    }
    const listId = readString(list, ["id", "list_id"]) ?? readString(list, ["listId"]);
    const listUrl = readString(list, ["url", "list_url", "view_url"]);
    const summary = compactRecord({
        id: listId,
        name: readString(list, ["name"]) ?? input.name,
        url: listUrl,
        spaceId,
        folderId,
        description: input.description
    });
    return {
        list: summary,
        nextSteps
    };
}
