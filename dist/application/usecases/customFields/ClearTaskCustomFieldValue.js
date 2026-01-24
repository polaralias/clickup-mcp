import { resolveCustomFieldMetadata } from "./customFieldShared.js";
export async function clearTaskCustomFieldValue(input, client, catalogue) {
    const context = await resolveCustomFieldMetadata(input.taskId, input.fieldId, client);
    if (!context.field) {
        throw new Error("Custom field metadata could not be resolved for clearing.");
    }
    if (input.dryRun) {
        return {
            preview: {
                taskId: input.taskId,
                fieldId: input.fieldId,
                action: "clear"
            },
            taskId: input.taskId,
            fieldId: input.fieldId,
            fieldName: context.field.name
        };
    }
    await client.clearTaskCustomFieldValue(input.taskId, input.fieldId);
    catalogue?.invalidateTask(input.taskId);
    catalogue?.invalidateSearch();
    return {
        taskId: input.taskId,
        fieldId: input.fieldId,
        fieldName: context.field.name,
        status: "cleared"
    };
}
