import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath } from "./structureShared.js";
export async function updateList(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const listId = input.listId ?? resolution?.listId;
    if (!listId) {
        throw new Error("Provide listId or include a list segment in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const nextSteps = [
        "Call clickup_list_tasks_in_list to review tasks with the updated configuration.",
        "Use clickup_create_task to add tasks that match the revised statuses."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "update",
                listId,
                updates: compactRecord({
                    name: input.name,
                    description: input.description,
                    statusCount: statuses?.length ?? undefined
                })
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
    const list = await client.updateList(listId, payload);
    if (resolution?.folderId) {
        directory.invalidateListsForFolder(resolution.folderId);
    }
    else if (resolution?.spaceId) {
        directory.invalidateListsForSpace(resolution.spaceId);
    }
    const listUrl = readString(list, ["url", "list_url", "view_url"]);
    const summary = compactRecord({
        id: listId,
        name: readString(list, ["name"]) ?? input.name,
        url: listUrl,
        description: input.description
    });
    return {
        list: summary,
        nextSteps
    };
}
