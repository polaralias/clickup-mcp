export async function stopTimer(input, client) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId, action: "stop" } };
    }
    const timer = await client.stopTimer(input.taskId);
    return { timer };
}
