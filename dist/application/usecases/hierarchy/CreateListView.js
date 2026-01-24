import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath, buildViewFilters } from "./structureShared.js";
export async function createListView(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const listId = input.listId ?? resolution?.listId;
    if (!listId) {
        throw new Error("Provide listId or include a list segment in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const statusFilters = statuses?.map((status) => status.status);
    const filters = input.filters ?? buildViewFilters(statusFilters, input.tags);
    const nextSteps = [
        "Share the view URL with collaborators once created.",
        "Use clickup_update_view to refine filters or layout if needed.",
        "Add tasks with clickup_create_task so the view shows meaningful data."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "create",
                listId,
                name: input.name,
                viewType: input.viewType ?? "list",
                description: input.description,
                filters
            },
            nextSteps
        };
    }
    const payload = compactRecord({
        name: input.name,
        type: input.viewType ?? "list",
        filters,
        settings: input.description ? { description: input.description } : undefined
    });
    const view = await client.createListView(listId, payload);
    const viewId = readString(view, ["id", "view_id"]) ?? readString(view, ["viewId"]);
    const viewUrl = readString(view, ["url", "view_url"]);
    const summary = compactRecord({
        id: viewId,
        name: readString(view, ["name"]) ?? input.name,
        url: viewUrl,
        listId,
        description: input.description,
        type: input.viewType ?? "list"
    });
    return {
        view: summary,
        nextSteps
    };
}
