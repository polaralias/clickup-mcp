export async function startTimer(input, client) {
    if (input.dryRun) {
        return { preview: { taskId: input.taskId, action: "start" } };
    }
    const timer = await client.startTimer(input.taskId);
    return { timer };
}
