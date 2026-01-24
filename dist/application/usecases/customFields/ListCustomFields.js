import { resolveIdsFromPath } from "../hierarchy/structureShared.js";
import { describeExpectedValue, extractListFields } from "./customFieldShared.js";
export async function listCustomFields(input, client, directory) {
    const resolution = await resolveIdsFromPath(input.path, client, directory, {
        forceRefresh: input.forceRefresh
    });
    const listId = input.listId ?? resolution?.listId;
    if (!listId) {
        throw new Error("Provide listId or a path resolving to a list");
    }
    const response = await client.getListCustomFields(listId);
    const fields = extractListFields(response).map((field) => ({
        ...field,
        expectedValue: describeExpectedValue(field)
    }));
    return {
        listId,
        fields,
        total: fields.length
    };
}
