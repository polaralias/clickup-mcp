import { compactRecord, normaliseStatuses, readString, resolveIdsFromPath, buildViewFilters } from "./structureShared.js";
export async function createSpaceView(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory);
    const spaceId = input.spaceId ?? resolution?.spaceId;
    if (!spaceId) {
        throw new Error("Provide spaceId or include a space segment in path");
    }
    const statuses = normaliseStatuses(input.statuses);
    const statusFilters = statuses?.map((status) => status.status);
    const filters = input.filters ?? buildViewFilters(statusFilters, input.tags);
    const nextSteps = [
        "Share the space view URL with collaborators once created.",
        "Use clickup_update_view to adjust the view after reviewing it.",
        "Populate lists or tasks so the view captures real work."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "create",
                spaceId,
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
    const view = await client.createSpaceView(spaceId, payload);
    const viewId = readString(view, ["id", "view_id"]) ?? readString(view, ["viewId"]);
    const viewUrl = readString(view, ["url", "view_url"]);
    const summary = compactRecord({
        id: viewId,
        name: readString(view, ["name"]) ?? input.name,
        url: viewUrl,
        spaceId,
        description: input.description,
        type: input.viewType ?? "list"
    });
    return {
        view: summary,
        nextSteps
    };
}
