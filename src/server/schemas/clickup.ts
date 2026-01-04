import { ConfigSchema } from "./index.js"

export const clickupSchema: ConfigSchema = {
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
            helpText: "Your personal API key from ClickUp settings.",
            secret: true
        },
        {
            name: "teamId",
            type: "text",
            label: "Team ID (Optional)",
            required: false,
            helpText: "If not provided, the first available team will be used.",
        }
    ],
    validate: (config: any) => {
        if (!config.apiKey || !config.apiKey.startsWith("pk_")) {
            return { valid: false, error: "Invalid API Key format. Must start with 'pk_'" }
        }
        return { valid: true }
    }
}
