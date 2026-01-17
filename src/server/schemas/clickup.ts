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
            description: "Your personal API key from ClickUp settings.",
            secret: true
        },
        {
            name: "teamId",
            type: "text",
            label: "Team ID (Optional)",
            required: false,
            description: "If not provided, the first available team will be used.",
        }
    ],
    validate: (config: any) => {
        if (!config.apiKey || typeof config.apiKey !== "string") {
            return { valid: false, error: "Invalid API Key format. Must be a string starting with 'pk_'" }
        }
        const apiKey = config.apiKey.trim()
        if (!apiKey.startsWith("pk_")) {
            return { valid: false, error: "Invalid API Key format. Must start with 'pk_'" }
        }
        const keyBody = apiKey.slice(3)
        if (keyBody.length < 20 || keyBody.length > 128) {
            return { valid: false, error: "Invalid API Key format. Unexpected length." }
        }
        if (!/^[A-Za-z0-9]+$/.test(keyBody)) {
            return { valid: false, error: "Invalid API Key format. Only letters and numbers are allowed after 'pk_'" }
        }
        return { valid: true }
    }
}
