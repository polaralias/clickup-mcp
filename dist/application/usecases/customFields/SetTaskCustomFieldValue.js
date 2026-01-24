import { describeExpectedValue, resolveCustomFieldMetadata, validateCustomFieldValue } from "./customFieldShared.js";
export async function setTaskCustomFieldValue(input, client, catalogue) {
    const context = await resolveCustomFieldMetadata(input.taskId, input.fieldId, client);
    const expectedValue = describeExpectedValue(context.field);
    const normalisedValue = validateCustomFieldValue(context.field, input.value);
    if (input.dryRun) {
        return {
            preview: {
                taskId: input.taskId,
                fieldId: input.fieldId,
                value: normalisedValue,
                expectedValue
            },
            taskId: input.taskId,
            fieldId: input.fieldId,
            value: normalisedValue,
            fieldName: context.field?.name,
            expectedValue
        };
    }
    await client.setTaskCustomFieldValue(input.taskId, input.fieldId, normalisedValue);
    catalogue?.invalidateTask(input.taskId);
    catalogue?.invalidateSearch();
    return {
        taskId: input.taskId,
        fieldId: input.fieldId,
        value: normalisedValue,
        fieldName: context.field?.name,
        expectedValue,
        status: "updated"
    };
}
