function readString(candidate, keys) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    for (const key of keys) {
        const value = candidate[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return undefined;
}
function extractListId(task) {
    const listFromTask = task.list;
    if (listFromTask && typeof listFromTask === "object") {
        const id = readString(listFromTask, ["id", "list_id", "listId"]);
        if (id) {
            return id;
        }
    }
    return readString(task, ["list_id", "listId"]);
}
function extractTypeConfig(field) {
    const config = field.type_config ?? field.typeConfig;
    return config && typeof config === "object" ? config : undefined;
}
export function extractCustomFieldOptions(typeConfig) {
    const options = typeConfig?.options;
    if (!Array.isArray(options)) {
        return [];
    }
    return options
        .map((entry) => {
        if (!entry || typeof entry !== "object") {
            return undefined;
        }
        const option = entry;
        const id = readString(option, ["id", "uuid", "option_id"]);
        const name = readString(option, ["name", "label", "color_label", "label_name"]);
        const color = readString(option, ["color", "label_color"]);
        return { id, name, label: name, color };
    })
        .filter((option) => Boolean(option?.id || option?.name || option?.label));
}
export function normaliseCustomField(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const record = candidate;
    const id = readString(record, ["id", "field_id", "custom_id", "uuid"]);
    if (!id) {
        return undefined;
    }
    const typeConfig = extractTypeConfig(record);
    const options = extractCustomFieldOptions(typeConfig);
    return {
        id,
        name: readString(record, ["name", "label", "field_name"]),
        type: readString(record, ["type", "field_type", "fieldType"]),
        required: Boolean(record.required ?? record.is_required),
        typeConfig,
        options
    };
}
function selectCustomField(fieldId, fields) {
    return fields.find((entry) => {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const id = readString(entry, ["id", "field_id", "custom_id", "uuid"]);
        return id === fieldId;
    });
}
function extractTaskCustomFields(task) {
    const direct = task.custom_fields ?? task.customFields;
    if (Array.isArray(direct)) {
        return direct;
    }
    return [];
}
function extractFieldsFromListResponse(response) {
    if (!response || typeof response !== "object") {
        return [];
    }
    const record = response;
    if (Array.isArray(record.fields)) {
        return record.fields;
    }
    if (Array.isArray(record.custom_fields)) {
        return record.custom_fields;
    }
    return [];
}
export async function resolveCustomFieldMetadata(taskId, fieldId, client) {
    const taskResponse = await client.getTask(taskId, {});
    const taskPayload = taskResponse?.task ?? taskResponse;
    const task = (taskPayload && typeof taskPayload === "object"
        ? taskPayload
        : {});
    const taskFields = extractTaskCustomFields(task);
    const fromTask = selectCustomField(fieldId, taskFields);
    if (fromTask) {
        return {
            field: normaliseCustomField(fromTask),
            listId: extractListId(task),
            task,
            source: "task"
        };
    }
    const listId = extractListId(task);
    if (listId) {
        const listFieldsResponse = await client.getListCustomFields(listId);
        const listFields = extractFieldsFromListResponse(listFieldsResponse);
        const fromList = selectCustomField(fieldId, listFields);
        return {
            field: normaliseCustomField(fromList),
            listId,
            task,
            source: "list"
        };
    }
    return { field: undefined, listId: undefined, task, source: "unknown" };
}
function expectString(value, fieldLabel) {
    if (typeof value === "string") {
        return value;
    }
    throw new Error(`Custom field \"${fieldLabel}\" expects a string value; received ${typeof value}.`);
}
function expectBoolean(value, fieldLabel) {
    if (typeof value === "boolean") {
        return value;
    }
    throw new Error(`Custom field \"${fieldLabel}\" expects a boolean; received ${typeof value}.`);
}
function parseNumber(value, fieldLabel) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    throw new Error(`Custom field \"${fieldLabel}\" expects a numeric value; received ${typeof value}.`);
}
function parseDate(value, fieldLabel) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        const timestamp = Date.parse(value);
        if (Number.isFinite(timestamp)) {
            return timestamp;
        }
    }
    throw new Error(`Custom field \"${fieldLabel}\" expects an ISO date string or epoch milliseconds; received ${typeof value}.`);
}
function describeOptions(options) {
    const labels = options
        .map((option) => option.name ?? option.label ?? option.id)
        .filter((value) => Boolean(value));
    return labels.length > 0 ? labels.join(", ") : undefined;
}
function resolveOption(value, options, fieldLabel) {
    if (typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Custom field \"${fieldLabel}\" expects one of the defined options; received ${typeof value}.`);
    }
    const candidate = String(value).trim();
    const match = options.find((option) => {
        const names = [option.id, option.name, option.label].filter(Boolean).map((entry) => entry.toLowerCase());
        return names.includes(candidate.toLowerCase());
    });
    if (!match) {
        const hint = describeOptions(options);
        const suffix = hint ? ` Valid options: ${hint}.` : "";
        throw new Error(`Custom field \"${fieldLabel}\" does not support value \"${candidate}\".${suffix}`);
    }
    return match.id ?? match.name ?? match.label ?? candidate;
}
function resolveOptionArray(value, options, fieldLabel) {
    const values = Array.isArray(value) ? value : [value];
    const resolved = values.map((entry) => resolveOption(entry, options, fieldLabel));
    return resolved;
}
function expectStringArray(value, fieldLabel) {
    const values = Array.isArray(value) ? value : [value];
    const coerced = values.map((entry) => {
        if (typeof entry === "string" && entry.trim() !== "") {
            return entry;
        }
        if (typeof entry === "number" && Number.isFinite(entry)) {
            return String(entry);
        }
        throw new Error(`Custom field \"${fieldLabel}\" expects one or more identifiers as strings; received ${typeof entry}.`);
    });
    return coerced;
}
export function describeExpectedValue(field) {
    if (!field?.type) {
        return undefined;
    }
    const type = field.type.toLowerCase();
    const optionList = describeOptions(field.options ?? []);
    if (type === "checkbox")
        return "boolean";
    if (type === "number" || type === "currency" || type === "percent")
        return "number";
    if (type === "date")
        return "ISO 8601 date string or epoch milliseconds";
    if (type === "dropdown")
        return optionList ? `one of: ${optionList}` : "single option value";
    if (type === "labels")
        return optionList ? `one or more of: ${optionList}` : "array of option values";
    if (type === "people")
        return "one or more member IDs";
    if (type === "url" || type === "email" || type === "phone" || type === "text" || type === "short_text") {
        return "string";
    }
    return undefined;
}
export function validateCustomFieldValue(field, value) {
    if (!field) {
        throw new Error("Custom field metadata could not be resolved; confirm the fieldId is valid for this task.");
    }
    const label = field.name ?? field.id;
    const type = field.type?.toLowerCase();
    if (!type) {
        return value;
    }
    if (type === "checkbox")
        return expectBoolean(value, label);
    if (type === "number" || type === "currency" || type === "percent")
        return parseNumber(value, label);
    if (type === "date")
        return parseDate(value, label);
    if (type === "dropdown") {
        const options = field.options ?? [];
        if (options.length === 0) {
            return expectString(value, label);
        }
        return resolveOption(value, options, label);
    }
    if (type === "labels") {
        const options = field.options ?? [];
        if (options.length === 0) {
            return expectStringArray(value, label);
        }
        return resolveOptionArray(value, options, label);
    }
    if (type === "people") {
        return expectStringArray(value, label);
    }
    if (type === "url" || type === "email" || type === "phone" || type === "text" || type === "short_text") {
        return expectString(value, label);
    }
    return value;
}
export function extractListFields(response) {
    return extractFieldsFromListResponse(response).map((entry) => normaliseCustomField(entry)).filter(Boolean);
}
