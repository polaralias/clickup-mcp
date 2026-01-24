export async function toolCatalogue(tools) {
    return {
        tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            annotations: tool.annotations ?? {},
            inputSchema: tool.inputSchema ?? null
        }))
    };
}
