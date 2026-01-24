import { z } from "zod";
export const FindMemberByNameInput = z.object({
    query: z.string().min(1).describe("Name, email, or ID fragment to search."),
    teamId: z
        .string()
        .min(1)
        .describe("Workspace/team ID to scope the search.")
        .optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .describe("Maximum members to return; defaults to ClickUp standard.")
        .optional(),
    refresh: z
        .boolean()
        .describe("true to bypass cached member results.")
        .optional()
});
export const ResolveAssigneesInput = z.object({
    identifiers: z
        .array(z.string().min(1).describe("Name/email/ID to resolve."))
        .min(1)
        .describe("References to resolve into member IDs."),
    teamId: z
        .string()
        .min(1)
        .describe("Workspace/team ID providing the member directory.")
        .optional(),
    limitPerIdentifier: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Maximum matches per identifier.")
        .optional(),
    refresh: z
        .boolean()
        .describe("true to bypass cached member lookups.")
        .optional()
});
