import { z } from "zod";
import { SafetyInput } from "./safety.js";
export const HierarchyPathLevels = ["workspace", "space", "folder", "list"];
const Id = z.coerce.string().describe("ClickUp identifier; numeric string accepted.");
const RequiredId = z.coerce
    .string()
    .min(1)
    .describe("ClickUp identifier required for this call.");
export const ListWorkspacesInput = z.object({
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch from ClickUp.")
        .optional()
});
export const ListSpacesInput = z.object({
    workspaceId: Id.describe("Workspace/team ID whose spaces to list."),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
export const ListFoldersInput = z.object({
    spaceId: Id.describe("Space ID whose folders to list."),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
export const ListListsInput = z.object({
    folderId: Id.describe("Folder ID whose lists to list.").optional(),
    spaceId: Id.describe("Space ID for direct list listing when folder omitted.").optional(),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
export const ListTagsForSpaceInput = z.object({
    spaceId: Id.describe("Space ID to retrieve available tags."),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
export const CreateSpaceTagInput = SafetyInput.extend({
    spaceId: RequiredId.describe("Space ID where the tag will be created."),
    name: z.string().min(1).describe("Tag name as shown in ClickUp."),
    foregroundColor: z
        .string()
        .min(1)
        .describe("Hex colour for tag text; omit to use default.")
        .optional(),
    backgroundColor: z
        .string()
        .min(1)
        .describe("Hex colour for tag background; omit to use default.")
        .optional()
});
export const UpdateSpaceTagInput = SafetyInput.extend({
    spaceId: RequiredId.describe("Space ID containing the tag to update."),
    currentName: z.string().min(1).describe("Existing tag name to match."),
    name: z
        .string()
        .min(1)
        .describe("New tag name; omit to retain current name.")
        .optional(),
    foregroundColor: z
        .string()
        .min(1)
        .describe("Updated text colour in hex.")
        .optional(),
    backgroundColor: z
        .string()
        .min(1)
        .describe("Updated background colour in hex.")
        .optional()
}).superRefine((value, ctx) => {
    if (!value.name && !value.foregroundColor && !value.backgroundColor) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide a new name or updated colours",
            path: ["name"]
        });
    }
});
export const DeleteSpaceTagInput = SafetyInput.extend({
    spaceId: RequiredId.describe("Space ID containing the tag to delete."),
    name: z.string().min(1).describe("Tag name to remove.")
});
export const ListMembersInput = z.object({
    teamId: Id.describe("Workspace/team ID to pull members from.").optional()
});
export const ResolveMembersInput = z.object({
    identifiers: z
        .array(z.string().min(1).describe("Display name, email, or ID to resolve."))
        .min(1)
        .describe("Member references to resolve."),
    teamId: RequiredId.describe("Workspace/team context for resolution.").optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Maximum matches to return per identifier.")
        .optional(),
    refresh: z
        .boolean()
        .describe("true to bypass caches during resolution.")
        .optional()
});
const HierarchyPathSegmentObject = z.object({
    type: z
        .enum(HierarchyPathLevels)
        .describe("Segment type expected along the hierarchy."),
    name: z.string().describe("Exact name to match within that level.")
});
const HierarchyPathSegmentString = z
    .string()
    .min(1)
    .describe("Segment name whose type is inferred from its order.");
export const HierarchyPathSegment = z
    .union([HierarchyPathSegmentObject, HierarchyPathSegmentString])
    .describe("Hierarchy path segment provided as {type,name} or a raw name string.");
export const ResolvePathToIdsInput = z.object({
    path: z
        .array(HierarchyPathSegment)
        .min(1)
        .describe("Ordered path segments to resolve into IDs."),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
export const GetWorkspaceOverviewInput = z.object({
    workspaceId: Id.describe("Workspace/team ID to summarise."),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
const WorkspaceSelector = z
    .object({
    id: RequiredId.describe("Workspace ID to resolve.").optional(),
    name: z
        .string()
        .min(1)
        .describe("Workspace name to resolve when id missing.")
        .optional()
})
    .refine((value) => Boolean(value.id || value.name), {
    message: "Provide id or name"
})
    .describe("Workspace reference providing either id or name.");
export const GetWorkspaceHierarchyInput = z.object({
    workspaceIds: z
        .array(RequiredId.describe("Workspace ID to include."))
        .describe("Explicit workspace IDs to load.")
        .optional(),
    workspaceNames: z
        .array(z.string().min(1).describe("Workspace name to match."))
        .describe("Workspace names to resolve when IDs unknown.")
        .optional(),
    workspaces: z
        .array(WorkspaceSelector.describe("Workspace lookup by id/name."))
        .describe("Mixed workspace selectors to resolve.")
        .optional(),
    maxDepth: z
        .number()
        .int()
        .min(0)
        .max(3)
        .describe("How deep to traverse: 0=workspace only, up to 3=list.")
        .optional(),
    maxWorkspaces: z
        .number()
        .int()
        .min(1)
        .describe("Maximum number of workspaces to return.")
        .optional(),
    maxSpacesPerWorkspace: z
        .number()
        .int()
        .min(1)
        .describe("Limit of spaces to include per workspace.")
        .optional(),
    maxFoldersPerSpace: z
        .number()
        .int()
        .min(1)
        .describe("Limit of folders to include per space.")
        .optional(),
    maxListsPerSpace: z
        .number()
        .int()
        .min(1)
        .describe("Limit of lists attached directly to a space.")
        .optional(),
    maxListsPerFolder: z
        .number()
        .int()
        .min(1)
        .describe("Limit of lists to include within each folder.")
        .optional(),
    concurrency: z
        .number()
        .int()
        .min(1)
        .describe("Max concurrent ClickUp requests when walking hierarchy.")
        .optional(),
    forceRefresh: z
        .boolean()
        .describe("true to bypass cache and fetch fresh data.")
        .optional()
});
