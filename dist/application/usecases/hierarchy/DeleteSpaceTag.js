import { findTagByName, loadSpaceTags } from "./tagShared.js";
export async function deleteSpaceTag(input, client, cache) {
    const existing = await loadSpaceTags(input.spaceId, client, cache);
    const current = findTagByName(existing, input.name);
    if (!current) {
        throw new Error(`Tag \"${input.name}\" was not found in this space`);
    }
    const nextSteps = [
        "Call clickup_list_tags_for_space to refresh the space tag catalogue.",
        "Update saved searches or automations that referenced this tag."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "delete",
                spaceId: input.spaceId,
                name: current.name
            },
            nextSteps
        };
    }
    await client.deleteSpaceTag(input.spaceId, current.name);
    await cache.invalidate(input.spaceId);
    return {
        removedTag: current,
        status: "deleted",
        nextSteps
    };
}
