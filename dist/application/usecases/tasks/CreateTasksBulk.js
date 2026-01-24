import { createTask } from "./CreateTask.js";
import { formatError, runBulk, summariseBulk } from "./bulkShared.js";
const CONCURRENCY_LIMIT = 5;
function normaliseTasks(input) {
    const defaults = input.defaults ?? {};
    return input.tasks.map((task) => ({
        listId: (task.listId ?? defaults.listId),
        name: task.name,
        description: task.description ?? defaults.description,
        assigneeIds: task.assigneeIds ?? defaults.assigneeIds,
        priority: task.priority ?? defaults.priority,
        dueDate: task.dueDate ?? defaults.dueDate,
        tags: task.tags ?? defaults.tags
    }));
}
export async function createTasksBulk(input, client, _config, catalogue) {
    const tasks = normaliseTasks(input);
    const outcomes = await runBulk(tasks, async (task) => {
        const payloadBase = {
            listId: task.listId,
            name: task.name,
            taskId: undefined,
            preview: undefined
        };
        const resultInput = {
            listId: task.listId,
            name: task.name,
            description: task.description,
            assigneeIds: task.assigneeIds,
            priority: task.priority,
            dueDate: task.dueDate,
            tags: task.tags,
            dryRun: input.dryRun ?? false,
            confirm: "yes"
        };
        try {
            const result = await createTask(resultInput, client, catalogue);
            if (input.dryRun) {
                return {
                    success: true,
                    payload: {
                        ...payloadBase,
                        preview: result.preview
                    }
                };
            }
            const taskId = result.task?.id;
            return {
                success: true,
                payload: {
                    ...payloadBase,
                    taskId,
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
