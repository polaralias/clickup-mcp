# Operational, Deployment and Safety Constraints

This document describes how the ClickUp MCP Server must behave in deployment, how configuration is handled, and what safety guarantees it provides. It complements the product brief and domain reference.

## 1. Deployment environments

The server must work with this flow without additional manual configuration.

### 1.2 Local Docker usage

The same Docker image must be usable locally. Typical workflow:

```bash
docker build -t clickup-mcp .
docker run -p 8080:8081 -e PORT=8081 -e CLICKUP_API_TOKEN=xxx clickup-mcp
```

Expectations:

- The HTTP server binds to `PORT`
- `/mcp` and `/healthz` endpoints are available
- The container works with MCP aware clients on `localhost`.

### 1.3 STDIO compatibility (optional but desirable)

The server may also support a STDIO mode for local use in environments that expect classic MCP stdio servers.

Behaviour:

- A `TRANSPORT` environment variable selects mode:
  - `TRANSPORT=http` starts the HTTP server (default in containers)
  - `TRANSPORT=stdio` runs the MCP server over stdin/stdout

This dual mode should not complicate the core code. HTTP mode is strongly preferred in production.

## 2. HTTP server contracts

The server must provide:

- `GET /healthz`  
  Returns a minimal JSON payload indicating liveness, for example:
  ```json
  { "ok": true }
  ```

- `ALL /mcp`  
  Handles MCP requests using Streamable HTTP. Responsibilities:
  - Parse JSON RPC requests
  - Route to MCP server instance
  - Stream responses according to the MCP Streamable HTTP specification
  - Clean up transports when connections close

CORS requirements:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, *`
- `Access-Control-Expose-Headers: mcp-session-id, mcp-protocol-version`

The server must respond appropriately to `OPTIONS` preflight requests for `/mcp`.

## 3. Configuration, secrets and environment variables

### 3.1 Environment variables

Typical expected variables:

- `PORT`  
  Port for the HTTP server in container or local Docker environments.

- `CLICKUP_API_TOKEN`  
  Secret used to authenticate with ClickUp.

- `DEFAULT_TEAM_ID` (optional)  
  Default workspace ID when not supplied explicitly.

- Limits and tuning:
  - `CHAR_LIMIT` or equivalent for response size
  - `MAX_ATTACHMENT_MB` for attachment sizes
  - `MAX_BULK_CONCURRENCY` for concurrent calls when expanding searches

Exact names can be adjusted, but the behaviour must respect these ideas.


### 3.3 Precedence and behaviour

- Global behaviour such as timeouts and hard limits derive from environment variables.
- Session configuration can override some defaults on a per session basis.

## 4. Safety constraints and patterns

Safety is a core part of the design. The server must apply consistent patterns for potentially dangerous operations.

### 4.1 Destructive operations

A destructive operation is any tool that:

- Deletes tasks, docs or time entries
- Moves or overwrites significant content
- Performs bulk edits across many resources

These tools must:

1. Require an explicit confirmation field, typically `confirm: "yes"`
2. Support a dry run where feasible
3. Never default to performing the destructive action without confirmation

Recommended pattern:

- If `dryRun` is true, perform all checks and validations but do not call ClickUp mutating endpoints.
- If `confirm` is not `"yes"` and `dryRun` is not set:
  - Return a structured response explaining that nothing was done and how to confirm.
- If `confirm` is `"yes"`:
  - Perform the operation and return a structured summary of what changed.

### 4.2 Attachments and large payloads

Attachments are provided as data URIs or references and are subject to size limits.

Constraints:

- Validate the approximate size of attachments before sending them to ClickUp.
- Reject attachments exceeding `MAX_ATTACHMENT_MB` with a clear error message.
- Do not attempt to accept or process extremely large bodies that would exceed practical token budgets.

### 4.3 Token and character limits

The server must enforce sensible limits on the size of responses. Typical rules:

- Enforce a global character limit for large text fields such as descriptions and doc content.
- When truncation occurs:
  - Set an explicit `truncated: true` flag or similar in the response.
  - Optionally include a short guidance string explaining how to request a narrower view.

Long running or potentially expansive tools such as bulk doc search and expansion must be particularly careful with limits.

### 4.4 Concurrency and rate limiting

When a tool would naturally make many calls in parallel (for example expanding content for search results), the server should:

- Respect a maximum concurrency, such as `MAX_BULK_CONCURRENCY`.
- Fail gracefully if rate limits are hit, returning informative errors rather than unhandled exceptions.
- Avoid unbounded parallelism that could harm stability.

### 4.5 Error handling

Errors should be normalised and structured. Expectations:

- Distinguish between:
  - Validation errors (bad inputs)
  - Not found errors
  - Permission errors
  - Rate limit or temporary errors
  - Internal errors

- Provide machine readable error codes and human readable messages where possible.

For destructive tools, a failure must clearly indicate whether the operation partially succeeded, fully failed or was never attempted due to missing confirmation.

## 5. Logging and observability (minimum expectations)

The server should log at least:

- Startup and mode (HTTP or STDIO)
- Basic request failures and unexpected errors
- Key events such as bulk operations failing or rate limits being hit

Logs do not need to be richly structured for the initial implementation, but they should be useful for diagnosing failed deployments and runtime issues.

## 6. Summary of operational contract

When this server is rebuilt, it should satisfy the following operational checklist:

- Uses environment variables for secrets and global limits.
- Applies consistent safety patterns for destructive actions, attachments and large outputs.
- Handles errors and rate limits gracefully and transparently.

These constraints should guide architectural and implementation decisions whenever trade offs arise.
