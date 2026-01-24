export async function createTask(input, client, catalogue) {
    if (input.dryRun) {
        return {
            preview: {
                listId: input.listId,
                name: input.name,
                hasDescription: Boolean(input.description),
                assigneeCount: input.assigneeIds?.length ?? 0,
                tagCount: input.tags?.length ?? 0,
                parentTaskId: input.parentTaskId
            }
        };
    }
    const payload = {
        name: input.name,
        description: input.description,
        assignees: input.assigneeIds,
        priority: input.priority,
        due_date: input.dueDate,
        tags: input.tags,
        parent: input.parentTaskId
    };
    const task = await client.createTask(input.listId, payload);
    catalogue?.invalidateList(input.listId);
    catalogue?.invalidateSearch();
    return { task };
}
