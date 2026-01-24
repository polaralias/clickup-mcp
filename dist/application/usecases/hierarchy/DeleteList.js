import { resolveIdsFromPath } from "./structureShared.js";
export async function deleteList(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const listId = input.listId ?? resolution?.listId;
    if (!listId) {
        throw new Error("Provide listId or include a list segment in path");
    }
    const nextSteps = [
        "Call clickup_list_lists to confirm the list was removed.",
        "Use clickup_create_list if you need a replacement list."
    ];
    if (input.dryRun) {
        return {
            preview: { action: "delete", listId },
            nextSteps
        };
    }
    await client.deleteList(listId);
    if (resolution?.folderId) {
        directory.invalidateListsForFolder(resolution.folderId);
    }
    else if (resolution?.spaceId) {
        directory.invalidateListsForSpace(resolution.spaceId);
    }
    return {
        status: "deleted",
        listId,
        nextSteps
    };
}
