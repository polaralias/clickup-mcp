import { z } from "zod";
export const PingInput = z.object({
    message: z.string().describe("Echo message.").optional()
});
export const HealthInput = z.object({
    verbose: z.boolean().describe("Include detailed component checks.").optional()
});
export const ToolCatalogueInput = z.object({
    verbose: z.boolean().describe("Include full schema descriptions.").optional()
});
export const WorkspaceCapabilitySnapshotInput = z.object({
    forceRefresh: z.boolean().describe("Force refresh of capability cache.").optional()
});
