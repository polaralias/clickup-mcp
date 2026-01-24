import { addTagsToTask } from "./AddTagsToTask.js";
import { formatError, runBulk, summariseBulk } from "./bulkShared.js";
const CONCURRENCY_LIMIT = 5;
function normaliseTags(input) {
    const defaults = input.defaults ?? {};
    return input.tasks.map((task) => ({
        taskId: task.taskId,
        tags: task.tags ?? defaults.tags ?? []
    }));
}
export async function addTagsBulk(input, client, _config, catalogue) {
    const taggings = normaliseTags(input);
    const outcomes = await runBulk(taggings, async (tagging) => {
        const payloadBase = {
            taskId: tagging.taskId,
            preview: undefined,
            tagsApplied: undefined,
            tagsAttempted: tagging.tags
        };
        const resultInput = {
            taskId: tagging.taskId,
            tags: tagging.tags,
            dryRun: input.dryRun ?? false,
            confirm: "yes"
        };
        try {
            const result = await addTagsToTask(resultInput, client, catalogue);
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
                    tagsApplied: tagging.tags,
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
