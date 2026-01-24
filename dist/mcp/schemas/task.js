import { z } from "zod";
import { SafetyInput } from "./safety.js";
const Id = z.coerce.string().describe("ClickUp identifier, usually a numeric string.");
const IdArray = z
    .array(Id.describe("Identifier string."))
    .describe("Collection of ClickUp identifiers.");
const TagArray = z
    .array(z.string().min(1).describe("Tag label exactly as stored in ClickUp."))
    .describe("List of tag names; defaults to empty when omitted.")
    .default([]);
const TaskMember = z
    .object({
    id: Id,
    username: z.string().optional(),
    email: z.string().optional()
})
    .describe("Task member identity and contact details.");
const TaskTag = z
    .object({
    name: z.string().min(1),
    color: z
        .object({ fg: z.string().optional(), bg: z.string().optional() })
        .describe("Tag foreground/background colors when available.")
        .optional()
})
    .describe("Tag label and optional colors applied to a task.");
const TaskChecklist = z
    .object({
    id: Id,
    name: z.string().optional(),
    resolvedItems: z.number(),
    totalItems: z.number()
})
    .describe("Checklist summary with completion counts.");
const TaskListReference = z
    .object({
    id: Id.optional(),
    name: z.string().optional(),
    url: z.string().optional()
})
    .describe("List metadata attached to a task when available.");
export const TaskListItemOutput = z
    .object({
    id: Id,
    name: z.string().optional(),
    status: z.string().optional(),
    dueDate: z.string().optional(),
    startDate: z.string().optional(),
    createdDate: z
        .string()
        .describe("Task creation timestamp in ISO 8601 format derived from ClickUp date_created field.")
        .optional(),
    priority: z.string().optional(),
    url: z.string(),
    assignees: z.array(TaskMember).describe("Preview of assigned members."),
    assigneesTruncated: z
        .boolean()
        .describe("true when assignee previews were truncated for token safety."),
    isSubtask: z
        .boolean()
        .describe("true when the task has a parent; indicates this entry is itself a subtask."),
    parentId: Id.describe("Parent task ID when isSubtask is true.").optional(),
    hasSubtasks: z
        .boolean()
        .describe("Indicates whether ClickUp reports child subtasks for this task; check before assuming there are none.")
        .optional(),
    subtaskCount: z
        .number()
        .describe("Number of reported subtasks when available from ClickUp responses.")
        .optional()
})
    .describe("Task summary payload returned from listing/search tools.");
export const TaskDetailOutput = z
    .object({
    id: Id,
    name: z.string().optional(),
    status: z.string().optional(),
    description: z.string().optional(),
    priority: z.string().optional(),
    dueDate: z.string().optional(),
    startDate: z.string().optional(),
    createdDate: z
        .string()
        .describe("Task creation timestamp in ISO 8601 format derived from ClickUp date_created field.")
        .optional(),
    updatedDate: z
        .string()
        .describe("Last updated timestamp in ISO 8601 format derived from ClickUp date_updated field.")
        .optional(),
    parentId: Id.optional(),
    isSubtask: z
        .boolean()
        .default(false)
        .describe("true when the task has a parent; check before claiming the task is top level."),
    hasSubtasks: z
        .boolean()
        .default(false)
        .describe("true when ClickUp reports this task has child subtasks; avoid asserting none exist without checking."),
    subtaskCount: z
        .number()
        .default(0)
        .describe("Reported number of subtasks when available; zero when none or not returned."),
    url: z.string(),
    list: TaskListReference.optional(),
    creator: TaskMember.optional(),
    assignees: z.array(TaskMember).default([]),
    tags: z.array(TaskTag).default([]),
    watchers: z.array(TaskMember).default([]),
    checklists: z.array(TaskChecklist).default([])
})
    .describe("Full task detail payload exposed via MCP tools.");
const numericIdPattern = /^[0-9]+$/;
const TaskContextTask = z
    .object({
    id: Id,
    name: z.string().optional(),
    description: z.string().optional(),
    text_content: z.string().optional(),
    status: z
        .union([
        z.string(),
        z
            .object({ status: z.string().optional() })
            .passthrough()
    ])
        .optional(),
    updatedAt: z.number().optional(),
    date_updated: z.union([z.string(), z.number()]).optional(),
    createdDate: z
        .string()
        .describe("Task creation timestamp in ISO 8601 format derived from ClickUp date_created field.")
        .optional(),
    listId: Id.optional(),
    listName: z.string().optional(),
    listUrl: z.string().optional(),
    list: z
        .object({
        id: Id.optional(),
        name: z.string().optional(),
        url: z.string().optional()
    })
        .partial()
        .optional(),
    url: z.string().optional()
})
    .passthrough()
    .describe("Task summary payload returned from listing/search tools.");
const TaskLookupReference = z.object({
    taskId: Id.describe("Exact task ID when already known.").optional(),
    taskName: z
        .string()
        .describe("Human name or numeric string to resolve when taskId missing.")
        .optional(),
    context: z
        .object({
        tasks: z
            .array(TaskContextTask)
            .min(1)
            .describe("Previously listed tasks to disambiguate taskName.")
    })
        .describe("Resolution context supplied from prior listing calls.")
        .optional()
});
export const TaskLookupContextInput = z.object({
    tasks: z
        .array(TaskContextTask)
        .min(1)
        .describe("Task context entries to use for disambiguation.")
});
export const CreateTaskInput = SafetyInput.extend({
    listId: Id.describe("Destination list ID where the task will be created."),
    name: z.string().min(1).describe("Task title; supply at least one character."),
    description: z
        .string()
        .describe("Rich description body; omit to leave blank.")
        .optional(),
    assigneeIds: IdArray.describe("User IDs to assign immediately.").optional(),
    priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe("Priority 0 (none) through 4 (urgent).")
        .optional(),
    dueDate: z
        .string()
        .describe("ISO 8601 due date; omit to leave unscheduled.")
        .optional(),
    tags: TagArray.describe("Tag names to attach at creation.").optional()
});
export const CreateSubtaskInput = CreateTaskInput.extend({
    parentTaskId: Id.describe("Parent task ID; must belong to the same list as listId.")
}).describe("Create a subtask under parentTaskId within the provided list.");
export const UpdateTaskInput = SafetyInput.extend({
    taskId: Id.describe("Task ID to modify."),
    name: z.string().describe("New task title.").optional(),
    description: z
        .string()
        .describe("New description text inserted above the existing description; previous content is preserved below with a standard separator.")
        .optional(),
    parentTaskId: Id.describe("New parent task ID to move this task under; must be in the same list.").optional(),
    status: z
        .string()
        .describe("Status name exactly as configured in ClickUp.")
        .optional(),
    priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe("Priority 0-4; omit to keep current value.")
        .optional(),
    dueDate: z
        .string()
        .describe("ISO 8601 due timestamp; omit for no change.")
        .optional(),
    assigneeIds: IdArray.describe("Replace assignees with these member IDs.").optional(),
    tags: TagArray.describe("Complete tag set to apply; overrides existing tags.").optional()
});
export const DeleteTaskInput = SafetyInput.extend({
    taskId: Id.describe("Task ID to delete after confirmation.")
});
export const DuplicateTaskInput = SafetyInput.extend({
    taskId: Id.describe("Source task ID to copy."),
    listId: Id.describe("Override target list; defaults to source list.").optional(),
    includeChecklists: z
        .boolean()
        .describe("true to clone checklists from the source task.")
        .optional(),
    includeAssignees: z
        .boolean()
        .describe("true to copy current assignees.")
        .optional()
});
export const CommentTaskInput = SafetyInput.pick({ dryRun: true, confirm: true }).extend({
    taskId: Id.describe("Task ID to receive the comment."),
    comment: z
        .string()
        .min(1)
        .describe("Markdown comment content to post.")
});
export const AttachFileInput = SafetyInput.extend({
    taskId: Id.describe("Task ID that will receive the attachment."),
    filename: z.string().describe("Original filename including extension."),
    dataUri: z
        .string()
        .describe("Base64 data URI payload; must include mime prefix.")
});
export const AddTagsInput = SafetyInput.extend({
    taskId: Id.describe("Task ID to tag."),
    tags: TagArray.describe("Tag names to append to the task.")
});
export const RemoveTagsInput = SafetyInput.extend({
    taskId: Id.describe("Task ID to untag."),
    tags: TagArray.describe("Tag names to remove from the task.")
});
const BulkCreateDefaults = z
    .object({
    listId: Id.describe("Fallback list ID for tasks missing listId.").optional(),
    description: z
        .string()
        .describe("Default description to use when a task omits one.")
        .optional(),
    assigneeIds: IdArray.describe("Default assignee set applied to omitted tasks.").optional(),
    priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe("Default priority 0-4 for tasks missing priority.")
        .optional(),
    dueDate: z
        .string()
        .describe("Default ISO due date for tasks without dueDate.")
        .optional(),
    tags: TagArray.describe("Default tag set merged into each task.").optional()
})
    .partial();
const BulkCreateTask = z.object({
    listId: Id.describe("Destination list ID where the task will be created.").optional(),
    name: z.string().min(1).describe("Task title; supply at least one character."),
    description: z
        .string()
        .describe("Rich description body; omit to leave blank.")
        .optional(),
    assigneeIds: IdArray.describe("User IDs to assign immediately.").optional(),
    priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe("Priority 0 (none) through 4 (urgent).")
        .optional(),
    dueDate: z
        .string()
        .describe("ISO 8601 due date; omit to leave unscheduled.")
        .optional(),
    tags: TagArray.describe("Tag names to attach at creation.").optional()
});
const BulkCreateSubtaskDefaults = BulkCreateDefaults.extend({
    parentTaskId: Id.describe("Default parent task ID when subtasks omit one.").optional()
});
const BulkCreateSubtask = BulkCreateTask.extend({
    parentTaskId: Id.describe("Parent task ID; must belong to the same list as listId.").optional()
}).describe("Subtask descriptor; supply parentTaskId here or via defaults to create a child task.");
const UpdateFields = z.object({
    name: z.string().describe("Replacement title to set.").optional(),
    description: z
        .string()
        .describe("New description text inserted above the existing description; previous content is preserved below with a standard separator.")
        .optional(),
    status: z
        .string()
        .describe("Status name to assign.")
        .optional(),
    priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe("Priority 0-4 to apply.")
        .optional(),
    dueDate: z
        .string()
        .describe("Due date timestamp to set.")
        .optional(),
    assigneeIds: IdArray.describe("Assignee IDs to replace the current set.").optional(),
    tags: TagArray.describe("Complete tag set to enforce.").optional()
});
const BulkUpdateTask = UpdateFields.extend({
    taskId: Id.describe("Task ID receiving these updates.")
});
const BulkTagDefaults = z
    .object({
    tags: TagArray.describe("Tags to merge into each task when missing.")
})
    .partial();
const BulkTagTask = z.object({
    taskId: Id.describe("Task ID to tag in bulk."),
    tags: TagArray.describe("Override tags for this task; defaults applied if absent.").optional()
});
export const CreateTasksBulkInput = SafetyInput.extend({
    teamId: Id.describe("Workspace/team scope for bulk creation.").optional(),
    defaults: BulkCreateDefaults.describe("Fallback values merged into each task.").optional(),
    tasks: z
        .array(BulkCreateTask)
        .min(1)
        .describe("Tasks to create; each entry must include a name and resolvable list.")
}).superRefine((value, ctx) => {
    value.tasks.forEach((task, index) => {
        if (task.listId || value.defaults?.listId) {
            return;
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tasks", index, "listId"],
            message: "Provide listId per task or in defaults"
        });
    });
});
export const CreateSubtasksBulkInput = SafetyInput.extend({
    teamId: Id.describe("Workspace/team scope for bulk creation.").optional(),
    defaults: BulkCreateSubtaskDefaults.describe("Fallback values merged into each subtask.").optional(),
    subtasks: z
        .array(BulkCreateSubtask)
        .min(1)
        .describe("Subtasks to create; each entry needs a name, list, and parent task.")
}).superRefine((value, ctx) => {
    value.subtasks.forEach((subtask, index) => {
        if (!(subtask.listId || value.defaults?.listId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["subtasks", index, "listId"],
                message: "Provide listId per subtask or in defaults"
            });
        }
        if (!(subtask.parentTaskId || value.defaults?.parentTaskId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["subtasks", index, "parentTaskId"],
                message: "Provide parentTaskId per subtask or in defaults"
            });
        }
    });
});
function hasUpdateFields(candidate) {
    if (!candidate) {
        return false;
    }
    return (candidate.name !== undefined ||
        candidate.description !== undefined ||
        candidate.status !== undefined ||
        candidate.priority !== undefined ||
        candidate.dueDate !== undefined ||
        candidate.assigneeIds !== undefined ||
        candidate.tags !== undefined);
}
export const UpdateTasksBulkInput = SafetyInput.extend({
    teamId: Id.describe("Workspace/team scope for bulk update.").optional(),
    defaults: UpdateFields.describe("Fields applied when tasks omit them.").optional(),
    tasks: z
        .array(BulkUpdateTask)
        .min(1)
        .describe("Task updates; each item needs taskId plus changes or defaults.")
}).superRefine((value, ctx) => {
    const defaultsHaveFields = hasUpdateFields(value.defaults);
    value.tasks.forEach((task, index) => {
        if (hasUpdateFields(task) || defaultsHaveFields) {
            return;
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tasks", index],
            message: "Provide at least one field to update or set defaults"
        });
    });
});
export const DeleteTasksBulkInput = SafetyInput.extend({
    teamId: Id.describe("Workspace/team scope for bulk deletes.").optional(),
    tasks: z
        .array(z
        .object({
        taskId: Id.describe("Task ID to delete.")
    })
        .describe("Deletion descriptor for a single task."))
        .min(1)
        .describe("Tasks to delete; confirm before execution.")
});
export const AddTagsBulkInput = SafetyInput.extend({
    teamId: Id.describe("Workspace/team scope for tag operations.").optional(),
    defaults: BulkTagDefaults.describe("Tags merged into each task when tags omitted.").optional(),
    tasks: z
        .array(BulkTagTask)
        .min(1)
        .describe("Tasks receiving tag additions; supply taskId each time.")
}).superRefine((value, ctx) => {
    value.tasks.forEach((task, index) => {
        const tags = task.tags ?? value.defaults?.tags;
        if (tags && tags.length > 0) {
            return;
        }
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tasks", index, "tags"],
            message: "Provide tags per task or in defaults"
        });
    });
});
export const SearchTasksInput = z.object({
    page: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Zero-based results page to fetch."),
    pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Results per page; capped at 100."),
    query: z
        .string()
        .describe("Full text query; omit to list all tasks with other filters.")
        .optional(),
    listIds: IdArray.describe("Restrict to these list IDs.").optional(),
    tagIds: TagArray.describe("Restrict to tasks tagged with these names.").optional(),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks that belong to multiple lists; maps to ClickUp include_timl."),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include subtasks in the search results; disable to focus on parent tasks."),
    status: z
        .string()
        .min(1)
        .describe("Filter by a single status name; mutually exclusive with statuses.")
        .optional(),
    statuses: z
        .array(z.string().min(1).describe("Status name exactly as configured in ClickUp."))
        .min(1)
        .describe("Filter by one or more status names; mutually exclusive with status.")
        .optional()
}).superRefine((value, ctx) => {
    if (value.status && value.statuses) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["statuses"],
            message: "Use status or statuses, not both"
        });
    }
});
export const FuzzySearchInput = z.object({
    query: z.string().min(1).describe("Term to fuzzy match against task names."),
    limit: z
        .number()
        .int()
        .min(1)
        .default(10)
        .describe("Maximum matches to return; defaults to 10. No hard cap applied.")
});
export const BulkFuzzySearchInput = z.object({
    queries: z
        .array(z.string().min(1).describe("Term to fuzzy match."))
        .min(1)
        .describe("Queries to execute in a single batch."),
    limit: z
        .number()
        .int()
        .min(1)
        .default(5)
        .describe("Maximum results per query; defaults to 5. No hard cap applied.")
});
function ensureTaskResolvable(value, ctx, issuePath = ["taskName"]) {
    if (value.taskId) {
        return;
    }
    const name = value.taskName?.trim();
    if (name) {
        if (numericIdPattern.test(name)) {
            return;
        }
        if (value.context?.tasks?.length) {
            return;
        }
    }
    ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issuePath,
        message: "Provide taskId or taskName with supporting context"
    });
}
export const GetTaskInput = TaskLookupReference.extend({
    detailLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum linked records to expand (comments, assignees, etc.).")
}).superRefine((value, ctx) => ensureTaskResolvable(value, ctx));
export const ListTasksInListInput = TaskLookupReference.extend({
    listId: Id.describe("Explicit list ID; overrides taskId/taskName resolution.").optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .default(20)
        .describe("Maximum tasks to return per page; increase page to retrieve further results when pagination occurs."),
    page: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Zero-based page index; increment to page through additional results."),
    includeClosed: z
        .boolean()
        .default(false)
        .describe("true to include closed tasks in the listing."),
    includeSubtasks: z
        .boolean()
        .default(true)
        .describe("true to include child tasks."),
    includeTasksInMultipleLists: z
        .boolean()
        .default(true)
        .describe("Include tasks whose home list differs; maps to ClickUp include_timl on list task queries."),
    assigneePreviewLimit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of assignee previews to include per task.")
}).superRefine((value, ctx) => {
    if (value.listId) {
        return;
    }
    if (value.taskId) {
        return;
    }
    ensureTaskResolvable(value, ctx, ["taskName"]);
});
export const GetTaskCommentsInput = TaskLookupReference.extend({
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum comments to return; older comments truncated if exceeded.")
}).superRefine((value, ctx) => ensureTaskResolvable(value, ctx));
