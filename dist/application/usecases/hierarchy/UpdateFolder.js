import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath } from "./structureShared.js";
export async function updateFolder(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const folderId = input.folderId ?? resolution?.folderId;
    if (!folderId) {
        throw new Error("Provide folderId or include a folder segment in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const nextSteps = [
        "Call clickup_list_folders to review the updated folder.",
        "Use clickup_create_list to populate the folder with lists if needed."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "update",
                folderId,
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
        description: input.description,
        statuses,
        override_statuses: statuses ? true : undefined
    });
    const folder = await client.updateFolder(folderId, payload);
    if (resolution?.spaceId) {
        directory.invalidateFolders(resolution.spaceId);
    }
    directory.invalidateListsForFolder(folderId);
    const nested = folder?.folder;
    const folderUrl = readString(folder, ["url", "folder_url", "view_url"]) ??
        readString(nested, ["url", "folder_url", "view_url"]);
    const summary = compactRecord({
        id: folderId,
        name: readString(folder, ["name"]) ??
            readString(nested, ["name"]) ??
            input.name,
        url: folderUrl,
        description: input.description
    });
    return {
        folder: summary,
        nextSteps
    };
}
