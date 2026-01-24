import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath } from "./structureShared.js";
export async function createFolder(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const spaceId = input.spaceId ?? resolution?.spaceId;
    if (!spaceId) {
        throw new Error("Provide spaceId or include a space segment in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const nextSteps = [
        "Use clickup_create_list to add lists within this folder.",
        "Call clickup_list_lists to verify lists after creation."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "create",
                target: { spaceId },
                name: input.name,
                description: input.description,
                statusCount: statuses?.length ?? 0
            },
            nextSteps
        };
    }
    const payload = compactRecord({
        name: input.name,
        description: input.description,
        statuses,
        override_statuses: statuses ? true : undefined
    });
    const folder = await client.createFolder(spaceId, payload);
    directory.invalidateFolders(spaceId);
    const nested = folder?.folder;
    const folderId = readString(folder, ["id", "folder_id"]) ??
        readString(nested, ["id", "folder_id"]) ??
        readString(folder, ["folderId"]);
    const folderUrl = readString(folder, ["url", "folder_url", "view_url"]) ??
        readString(nested, ["url", "folder_url", "view_url"]);
    const summary = compactRecord({
        id: folderId,
        name: readString(folder, ["name"]) ??
            readString(nested, ["name"]) ??
            input.name,
        url: folderUrl,
        spaceId,
        description: input.description
    });
    return {
        folder: summary,
        nextSteps
    };
}
