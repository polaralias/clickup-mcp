import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import { createServer } from "./server/factory.js"
import { parseSessionConfig } from "./server/sessionConfig.js"
import { createApplicationConfig } from "./application/config/applicationConfig.js"
import { SessionCache } from "./application/services/SessionCache.js"

// Define types for Cloudflare Workers
interface Env {
  MCP_SESSION: DurableObjectNamespace;
}

class WorkerSSETransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  private writer: WritableStreamDefaultWriter<any>;
  private pendingResponses: Map<string | number, (message: JSONRPCMessage) => void>;

  constructor(writer: WritableStreamDefaultWriter<any>, pendingResponses: Map<string | number, (message: JSONRPCMessage) => void>) {
    this.writer = writer;
    this.pendingResponses = pendingResponses;
  }

  async start(): Promise<void> {
    // No-op for SSE
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      const messageId = (message as { id?: string | number }).id;
      if (messageId !== undefined) {
        const resolver = this.pendingResponses.get(messageId);
        if (resolver) {
          this.pendingResponses.delete(messageId);
          resolver(message);
          return;
        }
      }
      const event = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
      await this.writer.write(new TextEncoder().encode(event));
    } catch (e) {
      console.error("Error writing to stream", e);
      this.onerror?.(e as Error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.writer.close();
    } catch (e) {
      // Ignore
    }
    this.onclose?.();
  }

  handlePostMessage(message: JSONRPCMessage) {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }
}

export class McpSession implements DurableObject {
  state: DurableObjectState;
  server?: McpServer;
  transport?: WorkerSSETransport;
  private pendingResponses = new Map<string | number, (message: JSONRPCMessage) => void>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      if (request.method === "GET") {
        return this.handleConnect(request);
      }
      if (request.method === "POST") {
        return this.handleMessage(request);
      }
    }

    return new Response("Not found", { status: 404 });
  }

  private async loadStoredConfig() {
    return this.state.storage.get<Record<string, unknown>>("sessionConfig");
  }

  private async ensureServer(configInput: Record<string, unknown>) {
    if (this.server && this.transport) {
      return;
    }

    const { config, error } = parseSessionConfig(configInput);

    if (!config) {
      throw new Error(error || "Invalid config");
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    this.transport = new WorkerSSETransport(writer, this.pendingResponses);

    const appConfig = createApplicationConfig(config, undefined);
    const sessionCache = new SessionCache(appConfig.hierarchyCacheTtlMs, appConfig.spaceConfigCacheTtlMs);

    this.server = createServer(appConfig, sessionCache);

    await this.state.storage.put("sessionConfig", config);

    await this.server.connect(this.transport);

    return readable;
  }

  async handleConnect(request: Request): Promise<Response> {
    // Parse config from query params passed to the DO
    const url = new URL(request.url);
    const queryObj: Record<string, any> = {};
    for (const [key, value] of url.searchParams) {
      // Simplified query parsing
      queryObj[key] = value;
    }

    const storedConfig = await this.loadStoredConfig();
    const configInput = storedConfig ?? queryObj;

    if (!configInput) {
      return new Response(JSON.stringify({ error: "Invalid config" }), { status: 400 });
    }

    const sessionExisted = Boolean(this.server && this.transport);
    let sessionCreated = false;
    let readable: ReadableStream<any> | undefined;
    try {
      readable = await this.ensureServer(configInput);
      sessionCreated = !sessionExisted;
    } catch (error) {
      console.log("MCP session request", {
        path: url.pathname,
        method: request.method,
        sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
        sessionExisted,
        sessionCreated
      });
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid config" }), { status: 400 });
    }

    if (!readable) {
      console.log("MCP session request", {
        path: url.pathname,
        method: request.method,
        sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
        sessionExisted,
        sessionCreated
      });
      return new Response("Session not initialized", { status: 400 });
    }

    console.log("MCP session request", {
      path: url.pathname,
      method: request.method,
      sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
      sessionExisted,
      sessionCreated
    });

    // Handle client disconnect
    request.signal.addEventListener("abort", () => {
      this.transport?.close();
      this.server?.close();
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  async handleMessage(request: Request): Promise<Response> {
    let body: JSONRPCMessage;
    try {
      body = await request.json() as JSONRPCMessage;
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const messageId = (body as { id?: string | number }).id;
    const isInitialize = (body as { method?: string }).method === "initialize";
    const storedConfig = await this.loadStoredConfig();
    const url = new URL(request.url);
    const queryObj: Record<string, any> = {};
    for (const [key, value] of url.searchParams) {
      queryObj[key] = value;
    }

    const sessionExisted = Boolean(this.server && this.transport);
    let sessionCreated = false;

    if (!this.server || !this.transport) {
      if (!isInitialize) {
        console.log("MCP session request", {
          path: url.pathname,
          method: request.method,
          sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
          sessionExisted,
          sessionCreated
        });
        return new Response("Session not initialized", { status: 400 });
      }

      const configInput = storedConfig ?? queryObj;
      try {
        await this.ensureServer(configInput);
        sessionCreated = true;
      } catch (error) {
        console.log("MCP session request", {
          path: url.pathname,
          method: request.method,
          sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
          sessionExisted,
          sessionCreated
        });
        return new Response(error instanceof Error ? error.message : "Invalid config", { status: 400 });
      }
    }

    const responsePromise = messageId !== undefined
      ? new Promise<JSONRPCMessage>((resolve) => {
        this.pendingResponses.set(messageId, resolve);
      })
      : undefined;

    this.transport.handlePostMessage(body);

    console.log("MCP session request", {
      path: url.pathname,
      method: request.method,
      sessionId: request.headers.get("mcp-session-id") || url.searchParams.get("sessionId"),
      sessionExisted,
      sessionCreated
    });

    if (!responsePromise) {
      return new Response("Accepted", { status: 202 });
    }

    const responseMessage = await responsePromise;
    return new Response(JSON.stringify(responseMessage), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve schema config
    if (url.pathname === "/" || url.pathname === "/.well-known/mcp-config" || url.pathname === "/.well-known/mcp-configuration") {
      const { sessionConfigJsonSchema } = await import("./server/sessionConfig.js");
      return new Response(JSON.stringify(sessionConfigJsonSchema, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // MCP Server Metadata
    if (url.pathname === "/.well-known/mcp-server") {
      const baseUrl = `${url.protocol}//${url.host}`;
      return new Response(JSON.stringify({
        mcp_endpoint: `${baseUrl}/mcp`,
        version: "1.0.0",
        capabilities: {
          authentication: ["api_key", "oauth2"],
          transports: ["sse"]
        }
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // OAuth Discovery
    if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/openid-configuration") {
      const baseUrl = `${url.protocol}//${url.host}`;
      return new Response(JSON.stringify({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/connect`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"]
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // OAuth Protected Resource
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      const baseUrl = `${url.protocol}//${url.host}`;
      return new Response(JSON.stringify({
        resource: `${baseUrl}/mcp`,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ["header"],
        resource_documentation: `${baseUrl}/`
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/mcp") {
      const headerSessionId = request.headers.get("mcp-session-id");
      const querySessionId = url.searchParams.get("sessionId");
      const hasBody = request.method === "POST";
      let bodyText: string | undefined;
      let isInitialize = false;

      if (hasBody) {
        bodyText = await request.text();
        try {
          const parsed = JSON.parse(bodyText) as { method?: string };
          isInitialize = parsed.method === "initialize";
        } catch {
          // keep false
        }
      }

      let sessionId = headerSessionId || querySessionId;
      let sessionCreated = false;

      if (!sessionId) {
        if (isInitialize) {
          sessionId = crypto.randomUUID();
          sessionCreated = true;
        } else {
          console.log("MCP session request", {
            path: url.pathname,
            method: request.method,
            sessionId,
            sessionExisted: false,
            sessionCreated
          });
          return new Response("Missing sessionId parameter", { status: 400 });
        }
      }

      const id = env.MCP_SESSION.idFromName(sessionId);
      const stub = env.MCP_SESSION.get(id);
      const newUrl = new URL(request.url);
      newUrl.pathname = "/mcp";

      const headers = new Headers(request.headers);
      headers.set("mcp-session-id", sessionId);

      const forwardedRequest = new Request(newUrl.toString(), {
        method: request.method,
        headers,
        body: hasBody ? bodyText : undefined
      });

      const response = await stub.fetch(forwardedRequest);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("mcp-session-id", sessionId);
      if (sessionCreated) {
        responseHeaders.set("mcp-session-created", "true");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
