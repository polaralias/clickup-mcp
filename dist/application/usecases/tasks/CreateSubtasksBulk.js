import { createTask } from "./CreateTask.js";
import { formatError, runBulk, summariseBulk } from "./bulkShared.js";
const CONCURRENCY_LIMIT = 5;
function normaliseSubtasks(input) {
    const defaults = input.defaults ?? {};
    return input.subtasks.map((subtask) => ({
        listId: (() => {
            const listId = subtask.listId ?? defaults.listId;
            if (!listId) {
                throw new Error("Missing listId for subtask; provide per entry or via defaults");
            }
            return listId;
        })(),
        parentTaskId: (() => {
            const parentId = subtask.parentTaskId ?? defaults.parentTaskId;
            if (!parentId) {
                throw new Error("Missing parentTaskId for subtask; provide per entry or via defaults");
            }
            return parentId;
        })(),
        name: subtask.name,
        description: subtask.description ?? defaults.description,
        assigneeIds: subtask.assigneeIds ?? defaults.assigneeIds,
        priority: subtask.priority ?? defaults.priority,
        dueDate: subtask.dueDate ?? defaults.dueDate,
        tags: subtask.tags ?? defaults.tags
    }));
}
export async function createSubtasksBulk(input, client, _config, catalogue) {
    const subtasks = normaliseSubtasks(input);
    const outcomes = await runBulk(subtasks, async (subtask) => {
        const payloadBase = {
            listId: subtask.listId,
            parentTaskId: subtask.parentTaskId,
            name: subtask.name,
            taskId: undefined,
            preview: undefined
        };
        const resultInput = {
            listId: subtask.listId,
            name: subtask.name,
            parentTaskId: subtask.parentTaskId,
            description: subtask.description,
            assigneeIds: subtask.assigneeIds,
            priority: subtask.priority,
            dueDate: subtask.dueDate,
            tags: subtask.tags,
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
