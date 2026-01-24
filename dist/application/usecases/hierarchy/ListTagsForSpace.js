import { ensureSpaceTagCollection } from "./tagShared.js";
export async function listTagsForSpace(input, client, cache) {
    const tags = await ensureSpaceTagCollection(input.spaceId, client, cache, {
        forceRefresh: input.forceRefresh
    });
    return { tags };
}
