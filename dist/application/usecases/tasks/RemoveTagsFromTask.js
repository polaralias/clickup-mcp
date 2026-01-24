export async function removeTagsFromTask(input, client, catalogue) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId, tags: input.tags } };
    }
    await client.removeTags(input.taskId, input.tags);
    catalogue?.invalidateTask(input.taskId);
    catalogue?.invalidateSearch();
    return { status: "tags_removed" };
}
