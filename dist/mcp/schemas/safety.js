import { z } from "zod";
export const SafetyInput = z.object({
    confirm: z
        .string()
        .describe('Echo "yes" only after validation to authorise the mutation.')
        .optional(),
    dryRun: z
        .boolean()
        .describe("true to simulate and inspect the payload without committing it.")
        .optional()
});
