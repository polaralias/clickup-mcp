import { compactRecord, readString, resolveIdsFromPath } from "./structureShared.js";
export async function createListFromTemplate(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const spaceId = input.spaceId ?? resolution?.spaceId;
    const folderId = input.folderId ?? resolution?.folderId;
    if (!spaceId && !folderId) {
        throw new Error("Provide spaceId, folderId, or include the container in path");
    }
    const nextSteps = [
        "Call clickup_list_tasks_in_list to confirm the list contents and template application.",
        "Use clickup_create_task to add additional tasks."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "createFromTemplate",
                templateId: input.templateId,
                target: folderId ? { folderId } : { spaceId },
                name: input.name,
                useTemplateOptions: input.useTemplateOptions
            },
            nextSteps
        };
    }
    const payload = compactRecord({
        name: input.name,
        use_template_options: input.useTemplateOptions
    });
    const list = await client.createListFromTemplate(input.templateId, { spaceId, folderId }, payload);
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
        templateId: input.templateId
    });
    return {
        list: summary,
        nextSteps
    };
}
