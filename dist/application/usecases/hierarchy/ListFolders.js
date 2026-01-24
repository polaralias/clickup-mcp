export async function listFolders(input, client, directory, options = {}) {
    const { items, cache } = await directory.ensureFolders(input.spaceId, () => client.listFolders(input.spaceId), { forceRefresh: options.forceRefresh ?? input.forceRefresh });
    return { folders: items, cache };
}
