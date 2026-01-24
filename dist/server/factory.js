import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../mcp/registerTools.js";
import { registerResources } from "../mcp/registerResources.js";
export function createServer(config, sessionCache) {
    const server = new McpServer({
        name: "ClickUp MCP",
        version: "1.0.0"
    });
    registerTools(server, config, sessionCache);
    registerResources(server, config, sessionCache);
    return server;
}
