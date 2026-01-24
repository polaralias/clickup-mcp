import { z } from "zod";
import { HierarchyPathSegment } from "./hierarchy.js";
const Id = z.coerce.string().describe("ClickUp identifier; numeric string accepted.");
const HierarchyPath = z
    .array(HierarchyPathSegment)
    .min(1)
    .describe("Ordered workspace/space/folder/list path to resolve.");
const TagArray = z
    .array(z.string().min(1).describe("Tag label exactly as stored in ClickUp."))
    .describe("List of tag names to filter by.")
    .optional();
const AssigneeArray = z
    .array(z.string().min(1).describe("Assignee username, email or ID."))
    .describe("Assignee filter applied during reporting.")
    .optional();
const StatusArray = z
    .array(z.string().min(1).describe("Status name to include."))
    .describe("Status filters applied during reporting.")
    .optional();
function requireContainer(value, ctx, keys) {
    const hasDirect = keys.some((key) => Boolean(value[key]));
    if (hasDirect) {
        return;
    }
    if (value.path && value.path.length > 0) {
        return;
    }
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provide ${keys.join(" or ")} or include a matching segment in path`,
        path: [keys[0]]
    });
}
const ContainerRefinement = (value, ctx) => {
    requireContainer(value, ctx, ["listId", "folderId", "spaceId", "workspaceId"]);
};
export const TaskStatusReportInput = z
    .object({
    workspaceId: Id.describe("Workspace/team scope to summarise.").optional(),
    spaceId: Id.describe("Space scope to summarise.").optional(),
    folderId: Id.describe("Folder scope to summarise.").optional(),
    listId: Id.describe("List scope to summarise.").optional(),
    path: HierarchyPath.describe("Hierarchy path resolving to the container.").optional(),
    includeClosed: z
        .boolean()
        .describe("true to include closed statuses in the report.")
        .optional(),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtasks during aggregation; set false to focus on parent tasks only."),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks that belong to multiple lists; maps to ClickUp include_timl."),
    tags: TagArray,
    assignees: AssigneeArray,
    statusFilter: StatusArray,
    dueWithinDays: z
        .number()
        .int()
        .positive()
        .describe("Restrict to tasks due within the next N days.")
        .optional(),
    forceRefresh: z
        .boolean()
        .describe("true to bypass hierarchy caches when resolving paths.")
        .optional()
})
    .superRefine(ContainerRefinement);
export const TaskRiskReportInput = z
    .object({
    workspaceId: Id.describe("Workspace/team scope to summarise.").optional(),
    spaceId: Id.describe("Space scope to summarise.").optional(),
    folderId: Id.describe("Folder scope to summarise.").optional(),
    listId: Id.describe("List scope to summarise.").optional(),
    path: HierarchyPath.describe("Hierarchy path resolving to the container.").optional(),
    includeClosed: z
        .boolean()
        .describe("true to include closed statuses in the source set.")
        .optional(),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtasks during aggregation; set false to focus on parent tasks only."),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks that belong to multiple lists; maps to ClickUp include_timl."),
    tags: TagArray,
    assignees: AssigneeArray,
    statusFilter: StatusArray,
    dueWithinDays: z
        .number()
        .int()
        .positive()
        .describe("Window in days for upcoming risk analysis.")
        .optional(),
    forceRefresh: z
        .boolean()
        .describe("true to bypass hierarchy caches when resolving paths.")
        .optional()
})
    .superRefine(ContainerRefinement);
