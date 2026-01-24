export async function createTimeEntry(input, client) {
    const payload = {
        start: input.start,
        end: input.end,
        duration: input.durationMs,
        description: input.description
    };
    if (input.dryRun) {
        return {
            preview: {
                taskId: input.taskId,
                start: input.start,
                end: input.end,
                durationMs: input.durationMs ?? null
            }
        };
    }
    const entry = await client.createTimeEntry(input.taskId, payload);
    return { entry };
}
