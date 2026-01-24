import { z } from "zod";
import { SafetyInput } from "./safety.js";
import { toEpochMilliseconds } from "../../shared/time.js";
const TagArray = z
    .array(z.string().min(1).describe("Tag label exactly as stored in ClickUp."))
    .describe("List of tag names to filter by.")
    .optional();
const Id = z.coerce.string().describe("ClickUp identifier; numeric string accepted.");
const RequiredId = z.coerce
    .string()
    .min(1)
    .describe("ClickUp identifier required for this call.");
export const StartTimerInput = SafetyInput.extend({
    taskId: Id.describe("Task ID to start tracking time on.")
});
export const StopTimerInput = SafetyInput.extend({
    taskId: Id.describe("Task ID whose active timer should stop.")
});
export const CreateTimeEntryInput = SafetyInput.extend({
    taskId: Id.describe("Task ID the manual entry belongs to."),
    start: z.string().describe("ISO 8601 start timestamp."),
    end: z
        .string()
        .describe("ISO 8601 end timestamp; omit if using durationMs.")
        .optional(),
    durationMs: z
        .number()
        .int()
        .describe("Duration in milliseconds when end absent.")
        .optional(),
    description: z
        .string()
        .describe("Optional notes for the entry.")
        .optional()
});
export const UpdateTimeEntryInput = SafetyInput.extend({
    entryId: RequiredId.describe("Time entry ID to modify."),
    start: z.string().describe("New start timestamp.").optional(),
    end: z.string().describe("New end timestamp.").optional(),
    durationMs: z
        .number()
        .int()
        .describe("Override duration in milliseconds.")
        .optional(),
    description: z
        .string()
        .describe("Replacement notes for the entry.")
        .optional(),
    teamId: Id.describe("Workspace/team owning the time entry.").optional()
});
export const DeleteTimeEntryInput = SafetyInput.extend({
    entryId: RequiredId.describe("Time entry ID to delete."),
    teamId: Id.describe("Workspace/team owning the time entry.").optional()
});
const TimeBoundary = z
    .union([z.string(), z.number()])
    .superRefine((value, ctx) => {
    try {
        const pathSegment = ctx.path.at(-1);
        const label = typeof pathSegment === "string" ? pathSegment : undefined;
        toEpochMilliseconds(value, label);
    }
    catch (error) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error ? error.message : "Invalid timestamp boundary."
        });
    }
});
export const ListTimeEntriesInput = z.object({
    taskId: Id.describe("Filter to entries for this task ID.").optional(),
    from: TimeBoundary.describe("Inclusive start boundary as ISO 8601 string or epoch seconds/milliseconds.").optional(),
    to: TimeBoundary.describe("Exclusive end boundary as ISO 8601 string or epoch seconds/milliseconds.").optional(),
    page: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Zero-based page index."),
    pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Entries per page; capped at 100.")
});
export const ReportTimeForTagInput = z.object({
    teamId: Id.describe("Workspace/team scope for the report.").optional(),
    tag: z.string().describe("Tag name to summarise."),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtask time; set false to focus on parent tasks."),
    from: z
        .string()
        .describe("Inclusive ISO start boundary.")
        .optional(),
    to: z
        .string()
        .describe("Exclusive ISO end boundary.")
        .optional()
});
export const ReportTimeForContainerInput = z.object({
    containerType: z
        .enum(["workspace", "space", "folder", "list"])
        .describe("Container type being summarised; pick workspace, space, folder or list."),
    containerId: RequiredId.describe("List/folder/space/workspace ID to summarise."),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtask time; disable to focus on parent tasks."),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks linked to multiple lists; maps to ClickUp include_timl."),
    from: z
        .string()
        .describe("Inclusive ISO start boundary.")
        .optional(),
    to: z
        .string()
        .describe("Exclusive ISO end boundary.")
        .optional()
});
export const ReportTimeForSpaceTagInput = z.object({
    spaceId: RequiredId.describe("Space ID scoping the tag report."),
    tag: z.string().describe("Tag name within the space."),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtask time; disable to focus on parent tasks."),
    from: z
        .string()
        .describe("Inclusive ISO start boundary.")
        .optional(),
    to: z
        .string()
        .describe("Exclusive ISO end boundary.")
        .optional()
});
export const GetTaskTimeEntriesInput = z.object({
    taskId: Id.describe("Task ID whose entries to list."),
    pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Entries per page when streaming results.")
});
export const GetCurrentTimeEntryInput = z.object({
    teamId: Id.describe("Workspace/team to inspect for an active timer.").optional()
});
const StatusArray = z
    .array(z.string().min(1).describe("Status name exactly as configured in ClickUp."))
    .min(1)
    .describe("Filter by one or more status names.")
    .optional();
export const ReportTimeForContextInput = SafetyInput.extend({
    workspaceId: Id.describe("Workspace/team context for the report; defaults to configured team when omitted.").optional(),
    spaceId: Id.describe("Space scope for the time report.").optional(),
    listId: Id.describe("List scope for the time report.").optional(),
    taskId: Id.describe("Task scope for the time report.").optional(),
    viewId: Id.describe("ClickUp view identifier used to derive filters.").optional(),
    filterQuery: z
        .string()
        .describe("Filter/search query matching list task tools and saved views.")
        .optional(),
    status: z
        .string()
        .min(1)
        .describe("Single status name; mutually exclusive with statuses.")
        .optional(),
    statuses: StatusArray,
    tagIds: TagArray,
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtask time; disable to focus on parent tasks."),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks linked to multiple lists; maps to ClickUp include_timl."),
    from: TimeBoundary.describe("Inclusive start boundary as ISO 8601 string or epoch seconds/milliseconds.")
        .optional(),
    to: TimeBoundary.describe("Exclusive end boundary as ISO 8601 string or epoch seconds/milliseconds.")
        .optional(),
    entryPageSize: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(100)
        .describe("ClickUp page_size when fetching time entries; larger values reduce pagination."),
    entryPageLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum pages of time entries to fetch before marking the report partial."),
    taskSampleSize: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("How many tasks to load from the filtered list for ID resolution."),
    taskPage: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Zero-based task page to fetch when resolving filtered list tasks."),
    guidance: z
        .string()
        .describe("Optional operator guidance to echo back to the user.")
        .optional()
}).superRefine((value, ctx) => {
    if (value.status && value.statuses) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["statuses"],
            message: "Use status or statuses, not both"
        });
    }
    const providedContexts = [value.taskId, value.listId, value.spaceId, value.workspaceId].filter(Boolean);
    if (providedContexts.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["workspaceId"],
            message: "Provide taskId, listId, spaceId or workspaceId to scope the time report"
        });
    }
});
