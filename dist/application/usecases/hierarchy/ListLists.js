export async function listLists(input, client, directory, options = {}) {
    const spaceId = input.spaceId;
    const folderId = input.folderId;
    const { items, cache } = await directory.ensureLists(spaceId, folderId, () => client.listLists(spaceId ?? "", folderId), { forceRefresh: options.forceRefresh ?? input.forceRefresh });
    return { lists: items, cache };
}
