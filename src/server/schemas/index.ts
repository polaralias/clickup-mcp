export type ConfigFieldType = "text" | "password" | "textarea" | "select" | "checkbox" | "number"

export interface ConfigFieldOptions {
    label: string
    value: string
}

export interface ConfigField {
    name: string
    type: ConfigFieldType
    label: string
    required?: boolean
    description?: string
    placeholder?: string
    options?: ConfigFieldOptions[] // For select
    format?: string
    secret?: boolean // If true, never return value to client after save
}

export interface ConfigSchema {
    id: string // Server ID / Service ID
    name: string
    description: string
    fields: ConfigField[]
    // helper to validate a config object
    validate: (config: any) => { valid: boolean, error?: string }
}
