import { deleteTask } from "./DeleteTask.js";
import { formatError, runBulk, summariseBulk } from "./bulkShared.js";
const CONCURRENCY_LIMIT = 5;
export async function deleteTasksBulk(input, client, _config, catalogue) {
    const targets = input.tasks.map((task) => ({ taskId: task.taskId }));
    const outcomes = await runBulk(targets, async (target) => {
        const payloadBase = {
            taskId: target.taskId,
            preview: undefined,
            status: undefined
        };
        const resultInput = {
            taskId: target.taskId,
            dryRun: input.dryRun ?? false,
            confirm: "yes"
        };
        try {
            const result = await deleteTask(resultInput, client, catalogue);
            if (input.dryRun) {
                return {
                    success: true,
                    payload: {
                        ...payloadBase,
                        preview: result.preview
                    }
                };
            }
            return {
                success: true,
                payload: {
                    ...payloadBase,
                    status: result.status,
                    preview: undefined
                }
            };
        }
        catch (error) {
            return {
                success: false,
                payload: {
                    ...payloadBase
                },
                error: formatError(error)
            };
        }
    }, CONCURRENCY_LIMIT);
    return summariseBulk(outcomes, {
        dryRun: input.dryRun ?? false,
        concurrency: CONCURRENCY_LIMIT,
        teamId: input.teamId
    });
}
