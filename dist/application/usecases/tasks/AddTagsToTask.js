export async function addTagsToTask(input, client, catalogue) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId, tags: input.tags } };
    }
    await client.addTags(input.taskId, input.tags);
    catalogue?.invalidateTask(input.taskId);
    catalogue?.invalidateSearch();
    return { status: "tags_added" };
}
