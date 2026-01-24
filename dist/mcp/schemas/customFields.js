import { z } from "zod";
import { SafetyInput } from "./safety.js";
import { HierarchyPathSegment } from "./hierarchy.js";
const Id = z.coerce.string().describe("ClickUp identifier, usually a numeric string.");
export const ListCustomFieldsInput = z
    .object({
    listId: Id.describe("List ID whose custom fields to load.").optional(),
    path: z
        .array(HierarchyPathSegment)
        .min(1)
        .describe("Hierarchy path resolving to the target list.")
        .optional(),
    forceRefresh: z
        .boolean()
        .describe("true to bypass caches when resolving the path.")
        .optional()
})
    .superRefine((value, ctx) => {
    if (!value.listId && !(value.path && value.path.length > 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide listId or path",
            path: ["listId"]
        });
    }
});
export const SetTaskCustomFieldValueInput = SafetyInput.extend({
    taskId: Id.describe("Task ID whose custom field will be set."),
    fieldId: Id.describe("Custom field ID to update."),
    value: z
        .any()
        .describe("Value to apply; must match the custom field's configured type."),
    dryRun: z
        .boolean()
        .describe("true to validate the value and preview the payload without updating the task.")
        .optional()
}).superRefine((value, ctx) => {
    if (value.value === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide a value to set",
            path: ["value"]
        });
    }
});
export const ClearTaskCustomFieldValueInput = SafetyInput.extend({
    taskId: Id.describe("Task ID whose custom field value will be cleared."),
    fieldId: Id.describe("Custom field ID to clear.")
});
