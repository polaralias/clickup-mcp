import { buildColors, findTagByName, loadSpaceTags, normaliseHexColor, summariseTagFromResponse } from "./tagShared.js";
export async function createSpaceTag(input, client, cache) {
    const foreground = normaliseHexColor(input.foregroundColor, "foreground");
    const background = normaliseHexColor(input.backgroundColor, "background");
    const colors = buildColors(foreground, background);
    const existing = await loadSpaceTags(input.spaceId, client, cache);
    if (findTagByName(existing, input.name)) {
        throw new Error(`Tag \"${input.name}\" already exists in this space`);
    }
    const nextSteps = [
        "Call clickup_list_tags_for_space to refresh the space tag catalogue.",
        "Use clickup_add_tags_to_task to apply the tag to tasks."
    ];
    if (input.dryRun) {
        return {
            preview: {
                action: "create",
                spaceId: input.spaceId,
                name: input.name,
                colors
            },
            nextSteps
        };
    }
    const payload = { tag: input.name };
    if (foreground)
        payload.tag_fg = foreground;
    if (background)
        payload.tag_bg = background;
    const response = await client.createSpaceTag(input.spaceId, payload);
    const summary = summariseTagFromResponse(response, input.spaceId, {
        spaceId: input.spaceId,
        name: input.name,
        colors
    });
    await cache.invalidate(input.spaceId);
    return {
        tag: summary,
        nextSteps
    };
}
