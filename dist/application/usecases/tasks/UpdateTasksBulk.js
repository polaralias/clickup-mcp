import { updateTask } from "./UpdateTask.js";
import { formatError, runBulk, summariseBulk } from "./bulkShared.js";
const CONCURRENCY_LIMIT = 5;
function normaliseUpdates(input) {
    const defaults = input.defaults ?? {};
    return input.tasks.map((task) => ({
        taskId: task.taskId,
        fields: {
            name: task.name ?? defaults.name,
            description: task.description ?? defaults.description,
            status: task.status ?? defaults.status,
            priority: task.priority ?? defaults.priority,
            dueDate: task.dueDate ?? defaults.dueDate,
            assigneeIds: task.assigneeIds ?? defaults.assigneeIds,
            tags: task.tags ?? defaults.tags
        }
    }));
}
export async function updateTasksBulk(input, client, _config, catalogue) {
    const updates = normaliseUpdates(input);
    const outcomes = await runBulk(updates, async (update) => {
        const payloadBase = {
            taskId: update.taskId,
            preview: undefined,
            updatedFields: undefined
        };
        const resultInput = {
            taskId: update.taskId,
            name: update.fields.name,
            description: update.fields.description,
            status: update.fields.status,
            priority: update.fields.priority,
            dueDate: update.fields.dueDate,
            assigneeIds: update.fields.assigneeIds,
            tags: update.fields.tags,
            dryRun: input.dryRun ?? false,
            confirm: "yes"
        };
        try {
            const result = await updateTask(resultInput, client, catalogue);
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
                    updatedFields: Object.keys(update.fields).filter((key) => update.fields[key] !== undefined)
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
