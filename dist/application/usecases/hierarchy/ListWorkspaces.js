export async function listWorkspaces(client, directory, options = {}) {
    const { items, cache } = await directory.ensureWorkspaces(() => client.listWorkspaces(), options);
    return { workspaces: items, cache };
}
