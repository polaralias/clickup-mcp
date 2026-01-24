import { compactRecord, normaliseStatuses, readString, buildViewFilters } from "./structureShared.js";
export async function updateView(input, client) {
    const statuses = normaliseStatuses(input.statuses);
    const statusFilters = statuses?.map((status) => status.status);
    const filters = input.filters ?? buildViewFilters(statusFilters, input.tags);
    const nextSteps = [
        "Open the view in ClickUp to confirm the updated configuration.",
        "Use clickup_create_task or adjust filters if more refinement is needed."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "update",
                viewId: input.viewId,
                updates: compactRecord({
                    name: input.name,
                    viewType: input.viewType,
                    description: input.description,
                    filters
                })
            },
            nextSteps
        };
    }
    const payload = compactRecord({
        name: input.name,
        type: input.viewType,
        filters,
        settings: input.description ? { description: input.description } : undefined
    });
    if (input.filters_remove) {
        Object.assign(payload, { filters: null });
    }
    const view = await client.updateView(input.viewId, payload);
    const viewUrl = readString(view, ["url", "view_url"]);
    const summary = compactRecord({
        id: input.viewId,
        name: readString(view, ["name"]) ?? input.name,
        url: viewUrl,
        description: input.description,
        type: input.viewType,
        statusFilters: statusFilters ?? undefined
    });
    return {
        view: summary,
        nextSteps
    };
}
