export async function duplicateTask(input, client) {
    if (input.dryRun) {
        return {
            preview: {
                taskId: input.taskId,
                targetListId: input.listId ?? null,
                includeChecklists: Boolean(input.includeChecklists),
                includeAssignees: Boolean(input.includeAssignees)
            }
        };
    }
    const payload = {
        include_checklists: input.includeChecklists,
        include_assignees: input.includeAssignees,
        list: input.listId
    };
    const task = await client.duplicateTask(input.taskId, payload);
    return { task };
}
