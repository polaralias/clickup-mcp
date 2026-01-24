function lastString(v) {
    if (Array.isArray(v)) {
        const last = v[v.length - 1];
        return typeof last === "string" ? last : undefined;
    }
    return typeof v === "string" ? v : undefined;
}
function parseBooleanFlag(value) {
    if (value === undefined || value === "")
        return undefined;
    const normalised = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalised))
        return true;
    if (["0", "false", "no", "n", "off"].includes(normalised))
        return false;
    return undefined;
}
function parseWriteMode(value) {
    if (value === undefined || value === "")
        return undefined;
    const normalised = value.trim().toLowerCase();
    if (["write", "read", "selective"].includes(normalised)) {
        return normalised;
    }
    return undefined;
}
function parseIdList(value) {
    let values = [];
    if (Array.isArray(value)) {
        values = value;
    }
    else if (typeof value === "string") {
        values = [value];
    }
    else if (value && typeof value === "object") {
        values = Object.values(value);
    }
    else if (value !== undefined && value !== null) {
        values = [value];
    }
    else {
        return undefined;
    }
    const parsed = values
        .flatMap((entry) => {
        if (typeof entry === "string") {
            const trimmed = entry.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                    const parsedJson = JSON.parse(trimmed);
                    if (Array.isArray(parsedJson)) {
                        return parsedJson.map(String);
                    }
                }
                catch {
                    // Ignore JSON parse errors, treat as comma-separated string
                }
            }
            return entry.split(/[,\s]+/);
        }
        if (typeof entry === "number") {
            return String(entry);
        }
        return "";
    })
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    // Deduplicate
    const unique = Array.from(new Set(parsed));
    return unique.length ? unique : undefined;
}
function extractArrayValues(q, targetKeys) {
    const values = [];
    const indexedEntries = [];
    const targets = new Set(targetKeys.map((k) => k.toLowerCase()));
    for (const key of Object.keys(q)) {
        const lowerKey = key.toLowerCase();
        // Check for exact/case-insensitive base match
        if (targets.has(lowerKey)) {
            const val = q[key];
            if (Array.isArray(val)) {
                values.push(...val);
            }
            else {
                values.push(val);
            }
            continue;
        }
        // Check for indexed variants
        for (const target of targets) {
            // Check for dot notation: target.N
            if (lowerKey.startsWith(target + ".")) {
                const rest = lowerKey.slice(target.length + 1);
                if (/^\d+$/.test(rest)) {
                    const index = parseInt(rest, 10);
                    indexedEntries.push({ index, value: q[key] });
                    break;
                }
            }
            // Check for bracket notation: target[N]
            else if (lowerKey.startsWith(target + "[") && lowerKey.endsWith("]")) {
                const inner = lowerKey.slice(target.length + 1, -1);
                if (/^\d+$/.test(inner)) {
                    const index = parseInt(inner, 10);
                    indexedEntries.push({ index, value: q[key] });
                    break;
                }
            }
        }
    }
    // Sort indexed entries and append
    indexedEntries.sort((a, b) => a.index - b.index);
    for (const entry of indexedEntries) {
        values.push(entry.value);
    }
    return values.length > 0 ? values : undefined;
}
export const sessionConfigJsonSchema = {
    id: "clickup",
    name: "ClickUp MCP Server",
    description: "MCP server for ClickUp integration",
    version: "1.0.0",
    fields: [
        {
            key: "apiKey",
            label: "API key",
            type: "string",
            required: true,
            secret: true,
            default: "",
            help: "ClickUp personal API token used for all API requests"
        },
        {
            key: "teamId",
            label: "Team ID",
            type: "string",
            required: false,
            secret: false,
            default: "",
            help: "ClickUp workspace ID applied when tool inputs omit one"
        },
        {
            key: "readOnly",
            label: "Read only",
            type: "boolean",
            required: true,
            secret: false,
            default: false,
            help: "When true, all write operations are disabled. Takes precedence over other write settings."
        },
        {
            key: "selectiveWrite",
            label: "Selective write",
            type: "boolean",
            required: true,
            secret: false,
            default: false,
            help: "When true, write access is restricted to specific lists or spaces defined in writeLists and writeSpaces. If false (and not readOnly), full write access is granted."
        },
        {
            key: "writeSpaces",
            label: "Write allowed spaces",
            type: "string",
            required: false,
            secret: false,
            default: "",
            help: "Space IDs where write operations are permitted; writes elsewhere are blocked (comma-separated)"
        },
        {
            key: "writeLists",
            label: "Write allowed lists",
            type: "string",
            required: false,
            secret: false,
            default: "",
            help: "List IDs where write operations are permitted; writes elsewhere are blocked (comma-separated)"
        },
        {
            key: "charLimit",
            label: "Character limit",
            type: "number",
            required: false,
            secret: false,
            default: 16000,
            help: "Maximum characters returned before responses are truncated"
        },
        {
            key: "maxAttachmentMb",
            label: "Max attachment size (MB)",
            type: "number",
            required: false,
            secret: false,
            default: 8,
            help: "Largest file attachment (MB) allowed for uploads"
        }
    ]
};
export function parseSessionConfig(q) {
    // Log configuration request for debugging
    const sanitizedQuery = { ...q };
    // Redact sensitive keys
    for (const key of Object.keys(sanitizedQuery)) {
        if (key.toLowerCase().includes("api") || key.toLowerCase().includes("token") || key.toLowerCase().includes("key")) {
            sanitizedQuery[key] = "***";
        }
    }
    console.log("Session Config Request:", JSON.stringify(sanitizedQuery));
    const findParam = (keys) => {
        // Exact match
        for (const key of keys) {
            if (q[key] !== undefined)
                return q[key];
        }
        // Case insensitive match
        const searchKeys = new Set(keys.map((k) => k.toLowerCase()));
        for (const key of Object.keys(q)) {
            if (searchKeys.has(key.toLowerCase()))
                return q[key];
        }
        return undefined;
    };
    const teamIdRaw = findParam(["teamId", "teamID", "workspaceId", "workspaceID"]);
    const apiKeyRaw = findParam(["apiKey", "clickupApiToken", "api_key"]);
    const teamId = lastString(teamIdRaw);
    const apiKey = lastString(apiKeyRaw);
    const missing = [];
    if (!apiKey)
        missing.push("apiKey");
    if (missing.length) {
        return {
            error: `Invalid configuration: missing ${missing.join(", ")}`,
            statusCode: 400
        };
    }
    const charLimitRaw = lastString(findParam(["charLimit", "char-limit"]));
    const maxAttachmentMbRaw = lastString(findParam(["maxAttachmentMb", "max-attachment-mb"]));
    const readOnlyRaw = lastString(findParam(["readOnly", "read-only"]));
    const selectiveWriteRaw = lastString(findParam(["selectiveWrite", "selective-write"]));
    const writeModeRaw = lastString(findParam(["writeMode", "write-mode"]));
    const writeSpacesRaw = extractArrayValues(q, ["writeSpaces", "writeAllowedSpaces", "write_spaces", "write-spaces"]);
    const writeListsRaw = extractArrayValues(q, ["writeLists", "writeAllowedLists", "write_lists", "write-lists"]);
    const charLimit = charLimitRaw !== undefined && charLimitRaw !== "" ? Number(charLimitRaw) : undefined;
    const maxAttachmentMb = maxAttachmentMbRaw !== undefined && maxAttachmentMbRaw !== "" ? Number(maxAttachmentMbRaw) : undefined;
    const readOnly = parseBooleanFlag(readOnlyRaw);
    const selectiveWrite = parseBooleanFlag(selectiveWriteRaw);
    const writeMode = parseWriteMode(writeModeRaw);
    const writeSpaces = parseIdList(writeSpacesRaw);
    const writeLists = parseIdList(writeListsRaw);
    const config = {
        apiKey: apiKey,
        ...(teamId ? { teamId } : {}),
        ...(charLimit !== undefined && !Number.isNaN(charLimit) ? { charLimit } : {}),
        ...(maxAttachmentMb !== undefined && !Number.isNaN(maxAttachmentMb) ? { maxAttachmentMb } : {}),
        ...(readOnly !== undefined ? { readOnly } : {}),
        ...(selectiveWrite !== undefined ? { selectiveWrite } : {}),
        ...(writeMode ? { writeMode } : {}),
        ...(writeSpaces ? { writeSpaces } : {}),
        ...(writeLists ? { writeLists } : {})
    };
    return { config };
}
export async function extractSessionConfig(req, res) {
    // If authenticated via user-bound API key, use that config
    if (req.userConfig) {
        return req.userConfig;
    }
    const q = req.query;
    const { config, error, statusCode } = parseSessionConfig(q);
    if (error) {
        res.status(statusCode || 500).json({ error });
        return undefined;
    }
    return config;
}
