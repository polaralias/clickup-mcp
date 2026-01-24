export async function listSpaces(input, client, directory, options = {}) {
    const { items, cache } = await directory.ensureSpaces(input.workspaceId, () => client.listSpaces(input.workspaceId), { forceRefresh: options.forceRefresh ?? input.forceRefresh });
    return { spaces: items, cache };
}
