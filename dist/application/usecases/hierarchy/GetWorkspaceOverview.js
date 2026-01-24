function ensureArray(candidate, property) {
    if (property && candidate && typeof candidate === "object") {
        const nested = candidate[property];
        if (Array.isArray(nested)) {
            return nested;
        }
    }
    if (Array.isArray(candidate)) {
        return candidate;
    }
    return [];
}
export async function getWorkspaceOverview(input, client, directory, options = {}) {
    const ensureOptions = {
        forceRefresh: options.forceRefresh ?? input.forceRefresh
    };
    const { cache, items: workspaces } = await directory.ensureWorkspaces(() => client.listWorkspaces(), ensureOptions);
    // Find the workspace by ID in the cached list
    const workspace = ensureArray(workspaces).find((w) => (w.id ?? w.team_id) === input.workspaceId);
    if (!workspace) {
        throw new Error(`Workspace not found: ${input.workspaceId}`);
    }
    return { workspace, cache: { workspaces: cache } };
}
