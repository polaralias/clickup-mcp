export async function deleteTask(input, client, catalogue) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId } };
    }
    await client.deleteTask(input.taskId);
    catalogue?.invalidateTask(input.taskId);
    catalogue?.invalidateSearch();
    return { status: "deleted" };
}
