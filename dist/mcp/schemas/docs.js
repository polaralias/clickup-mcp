import { z } from "zod";
import { SafetyInput } from "./safety.js";
const Id = z.coerce.string().describe("ClickUp identifier; numeric string accepted.");
const RequiredId = z.coerce
    .string()
    .min(1)
    .describe("ClickUp identifier required for this call.");
export const ListDocumentsInput = z.object({
    workspaceId: Id.describe("Restrict listing to this workspace/team.").optional(),
    search: z
        .string()
        .min(1)
        .describe("Full text filter across doc titles and content.")
        .optional(),
    spaceId: Id.describe("Limit to a specific space ID.").optional(),
    folderId: Id.describe("Limit to a specific doc folder ID.").optional(),
    page: z
        .number()
        .int()
        .min(0)
        .describe("Zero-based page index for pagination.")
        .optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Documents per page; max 50."),
    includePreviews: z
        .boolean()
        .default(true)
        .describe("true to include preview snippets for each doc."),
    previewPageLimit: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe("Number of pages to preview when includePreviews=true."),
    previewCharLimit: z
        .number()
        .int()
        .min(64)
        .max(16000)
        .describe("Maximum characters per preview page.")
        .optional()
});
export const GetDocumentInput = z.object({
    workspaceId: Id.describe("Workspace/team context for the doc.").optional(),
    docId: RequiredId.describe("Document ID to fetch."),
    includePages: z
        .boolean()
        .default(true)
        .describe("true to include page bodies in the response."),
    pageIds: z
        .array(RequiredId.describe("Page ID to include."))
        .describe("Specific page IDs to return when includePages=true.")
        .optional(),
    pageLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum pages to include when not specifying pageIds."),
    previewCharLimit: z
        .number()
        .int()
        .min(64)
        .max(16000)
        .describe("Character budget per page when truncating content.")
        .optional()
});
export const GetDocumentPagesInput = z.object({
    workspaceId: Id.describe("Workspace/team containing the doc.").optional(),
    docId: RequiredId.describe("Document ID hosting the pages."),
    pageIds: z
        .array(RequiredId.describe("Page ID to fetch."))
        .nonempty()
        .describe("Ordered list of page IDs to fetch."),
    previewCharLimit: z
        .number()
        .int()
        .min(64)
        .max(16000)
        .describe("Character budget per returned page.")
        .optional()
});
export const CreateDocumentPageInput = SafetyInput.extend({
    workspaceId: Id.describe("Workspace/team containing the doc.").optional(),
    docId: RequiredId.describe("Document ID receiving the new page."),
    title: z.string().min(1).describe("Page title to display in ClickUp."),
    content: z
        .string()
        .describe("Initial page body; omit to start blank.")
        .optional(),
    parentId: Id.describe("Parent page ID when nesting under another page.").optional(),
    position: z
        .number()
        .int()
        .min(0)
        .describe("Zero-based insertion index among sibling pages.")
        .optional()
});
export const CreateDocInput = SafetyInput.extend({
    workspaceId: Id.describe("Workspace/team where the doc will live.").optional(),
    folderId: RequiredId.describe("Doc folder ID that will hold the new document."),
    name: z.string().min(1).describe("Document name; appears in navigation."),
    content: z
        .string()
        .describe("Initial document content body.")
        .optional()
});
export const ListDocPagesInput = z.object({
    workspaceId: Id.describe("Workspace/team containing the doc.").optional(),
    docId: RequiredId.describe("Document ID whose pages to list.")
});
export const GetDocPageInput = z.object({
    docId: RequiredId.describe("Document ID containing the page."),
    pageId: RequiredId.describe("Specific page ID to fetch.")
});
export const UpdateDocPageInput = SafetyInput.extend({
    workspaceId: Id.describe("Workspace/team containing the doc.").optional(),
    docId: RequiredId.describe("Document ID where the page lives."),
    pageId: RequiredId.describe("Page ID to modify."),
    title: z.string().describe("Updated page title.").optional(),
    content: z
        .string()
        .describe("Updated page body.")
        .optional()
});
export const DocSearchInput = z.object({
    workspaceId: Id.describe("Workspace/team context for the search.").optional(),
    query: z.string().min(1).describe("Full text search term for docs."),
    limit: z
        .number()
        .int()
        .min(1)
        .default(10)
        .describe("Max docs to return; default 10. No hard cap applied."),
    expandPages: z
        .boolean()
        .default(false)
        .describe("true to include matching page details in results.")
});
export const BulkDocSearchInput = z.object({
    workspaceId: Id.describe("Workspace/team context for all search queries.").optional(),
    queries: z
        .array(z.string().min(1).describe("Search term."))
        .min(1)
        .describe("List of doc queries to execute."),
    limit: z
        .number()
        .int()
        .min(1)
        .default(5)
        .describe("Max docs to return per query. No hard cap applied."),
    expandPages: z
        .boolean()
        .default(false)
        .describe("true to include page matches for each query.")
});
