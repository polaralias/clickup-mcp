export const clickupSchema = {
    id: "clickup",
    name: "ClickUp MCP",
    description: "Configure your ClickUp Personal API Key.",
    fields: [
        {
            name: "apiKey",
            type: "password",
            label: "ClickUp API Key",
            required: true,
            placeholder: "pk_...",
            description: "Your personal API key from ClickUp settings.",
            secret: true
        },
        {
            name: "teamId",
            type: "text",
            label: "Team ID (Optional)",
            required: false,
            description: "If not provided, the first available team will be used.",
        },
        {
            name: "readOnly",
            type: "checkbox",
            label: "Read only",
            required: false,
            description: "When enabled, all write operations are disabled."
        },
        {
            name: "selectiveWrite",
            type: "checkbox",
            label: "Selective write",
            required: false,
            description: "Restrict write access to specific spaces or lists."
        },
        {
            name: "writeMode",
            type: "select",
            label: "Write mode",
            required: false,
            description: "Explicit write mode override.",
            options: [
                { value: "write", label: "Write (full access)" },
                { value: "selective", label: "Selective (lists/spaces only)" },
                { value: "read", label: "Read only" }
            ]
        },
        {
            name: "writeSpaces",
            type: "text",
            label: "Write allowed spaces",
            required: false,
            placeholder: "space_id_1, space_id_2",
            description: "Comma-separated space IDs where writes are allowed.",
            format: "csv"
        },
        {
            name: "writeLists",
            type: "text",
            label: "Write allowed lists",
            required: false,
            placeholder: "list_id_1, list_id_2",
            description: "Comma-separated list IDs where writes are allowed.",
            format: "csv"
        },
        {
            name: "charLimit",
            type: "number",
            label: "Character limit",
            required: false,
            placeholder: "16000",
            description: "Maximum characters returned before responses are truncated."
        },
        {
            name: "maxAttachmentMb",
            type: "number",
            label: "Max attachment size (MB)",
            required: false,
            placeholder: "8",
            description: "Largest file attachment (MB) allowed for uploads."
        },
        {
            name: "hierarchyCacheTtlMs",
            type: "number",
            label: "Hierarchy cache TTL (ms)",
            required: false,
            placeholder: "300000",
            description: "Cache duration for hierarchy lookups in milliseconds."
        },
        {
            name: "spaceConfigCacheTtlMs",
            type: "number",
            label: "Space config cache TTL (ms)",
            required: false,
            placeholder: "300000",
            description: "Cache duration for space config in milliseconds."
        },
        {
            name: "reportingMaxTasks",
            type: "number",
            label: "Reporting max tasks",
            required: false,
            placeholder: "200",
            description: "Maximum tasks to include in reporting queries."
        },
        {
            name: "defaultRiskWindowDays",
            type: "number",
            label: "Default risk window (days)",
            required: false,
            placeholder: "5",
            description: "Default lookback window (days) for risk reports."
        }
    ],
    validate: (config) => {
        if (!config.apiKey || typeof config.apiKey !== "string") {
            return { valid: false, error: "Invalid API Key format. Must be a string starting with 'pk_'" };
        }
        const apiKey = config.apiKey.trim();
        if (!apiKey.startsWith("pk_")) {
            return { valid: false, error: "Invalid API Key format. Must start with 'pk_'" };
        }
        const keyBody = apiKey.slice(3);
        if (keyBody.length < 20 || keyBody.length > 128) {
            return { valid: false, error: "Invalid API Key format. Unexpected length." };
        }
        if (!/^[A-Za-z0-9_-]+$/.test(keyBody)) {
            return { valid: false, error: "Invalid API Key format. Only letters, numbers, '_' and '-' are allowed after 'pk_'" };
        }
        return { valid: true };
    }
};
