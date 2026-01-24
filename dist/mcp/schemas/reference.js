import { z } from "zod";
const PositiveInt = z
    .number()
    .int()
    .positive()
    .describe("Positive integer value.");
export const ListReferenceLinksInput = z.object({
    limit: PositiveInt.max(200)
        .default(50)
        .describe("Maximum number of stored reference links to return (max 200).")
});
export const FetchReferencePageInput = z.object({
    url: z
        .string()
        .url()
        .describe("URL to fetch and cache."),
    maxCharacters: PositiveInt.max(16000)
        .describe("Character budget for the fetched content.")
        .optional()
});
