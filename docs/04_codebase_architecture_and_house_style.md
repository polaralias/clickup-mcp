# Codebase Architecture and House Style

This document describes how the ClickUp MCP server codebase should be structured and how code should be written. It is intended as guidance for an LLM rebuilding or extending the repository.

## 1. Architecture overview

The server follows a layered architecture divided into three main layers:

1. **MCP tools layer**
2. **Application layer (usecases and services)**
3. **Infrastructure layer (ClickUp gateway and HTTP plumbing)**

The aim is to separate concerns clearly so that:

- Tool definitions stay close to the MCP protocol and agent needs.
- Business logic lives in application usecases.
- External services such as ClickUp and HTTP servers are isolated behind small, testable adapters.

### 1.1 MCP tools layer

Responsibilities:

- Define all MCP tools exposed to clients.
- Register tools with the MCP server instance.
- Specify input and output schemas using a schema library such as Zod.
- Provide clear, concise descriptions that help AI agents choose the right tools.
- Attach annotations to tools where helpful, for example hints about read only status or destructiveness.

Files and structure:

- `src/mcp/registerTools.ts`: central registry that wires tools into the MCP server.
- `src/mcp/schemas/*`: individual schema modules for tasks, docs, time, hierarchy and safety related inputs.
- `src/mcp/annotations.ts`: shared annotations for tool metadata.

This layer should not contain ClickUp API calls or complex business logic. It should delegate all work to application layer functions.

### 1.2 Application layer

Responsibilities:

- Implement usecases that coordinate actions within the ClickUp domain.
- Enforce business rules, safety checks and token limits.
- Shape responses into forms that are friendly for agents and downstream tools.

Structure:

- `src/application/usecases/*`: one module per coherent usecase or small group of related usecases, for example:
  - `tasks/CreateTask.ts`
  - `tasks/UpdateTask.ts`
  - `docs/DocSearch.ts`
  - `time/ReportTimeForTag.ts`
- `src/application/services/*`: shared services such as fuzzy search indices or bulk processors.
- `src/application/limits/*`: token and character budget logic, truncation helpers.
- `src/application/safety/*`: confirmation and dry run wrappers for destructive tools.

Each usecase should receive explicit dependencies such as a ClickUp client or configuration objects, either through parameters or simple factory functions. This keeps the code testable and modular.

### 1.3 Infrastructure layer

Responsibilities:

- Handle external communication and side effects:
  - Talking to ClickUp over HTTP
  - Running the Express server
  - Applying CORS and MCP transport

Structure:

- `src/infrastructure/clickup/*`: ClickUp gateway including a small client and domain specific endpoint helpers.
- `src/infrastructure/http/*`: generic HTTP utilities if needed.

Infrastructure modules should avoid embedding application logic. They should focus on translating between internal types and external representations, handling low level concerns such as retries and error normalisation.

## 2. Server entrypoints and transports

The main server entrypoint lives in `src/server/index.ts` and is responsible for:

- Creating the Express application.
- Configuring CORS and JSON parsing.
- Wiring `/healthz` and `/mcp` routes.
- Setting up the MCP server with registered tools.
- Selecting between HTTP and STDIO transport based on the `TRANSPORT` environment variable.

HTTP transport uses the Streamable HTTP class from the MCP SDK and must clean up resources when connections close. STDIO transport is optional and used primarily for local development.

## 3. File and naming conventions

- Use TypeScript across the codebase.
- Use `PascalCase` for classes and usecase file names, for example `CreateTask.ts`.
- Use `camelCase` for functions, variables and file local helpers.
- Use kebab or lower case with dashes for non code files, for example `Dockerfile`.
- Keep filenames descriptive and aligned with their purpose.

Each file should typically export a small number of well named functions or a single class, not a large grab bag of unrelated utilities.

## 4. Coding style

### 4.1 General

- Prefer small, pure functions where possible.
- Avoid deeply nested control flow where it can be simplified by early returns.
- Use async/await rather than raw promise chains for clarity.
- Avoid comments in code unless they are truly necessary to explain a non obvious behaviour.

### 4.2 Error handling

- Use explicit error types or clear messages when throwing.
- Normalise ClickUp errors at the infrastructure layer so application and MCP layers can work with a simpler model.
- When returning errors via MCP tools, prefer structured error objects with a short, clear `message` field over long unstructured strings.

### 4.3 Configuration usage

- Read environment variables at the outer edges (server setup or factory functions) and pass them into usecases as explicit parameters.
- Do not reach into `process.env` from deep inside business logic if it can be avoided.

### 4.4 Tests

- Use Vitest or a similar framework.
- Add at least basic tests for each usecase and key helper such as safety and truncation logic.
- Focus tests on behaviour and contracts rather than implementation details.

## 5. Tool design guidelines

When defining tools in the MCP layer:

- Choose names that are descriptive and stable, such as `clickup_create_task` or `clickup_doc_search`.
- Write descriptions in plain language that explain:
  - What the tool does
  - When it should be used
  - Any important constraints or safety considerations
- Provide input schemas that:
  - Use descriptive field names
  - Mark required fields correctly
  - Include descriptions for important fields

For outputs:

- Return structured objects rather than freeform text where possible.
- Include identifiers, URLs and small, focused summaries rather than entire raw payloads.
- Include flags such as `truncated` when data has been shortened due to limits.

## 6. Safety and limits in code

- Apply safety wrappers from `application/safety` to destructive tools at registration time.
- Use shared truncation helpers from `application/limits` whenever long text fields are being returned.
- Ensure that concurrency and rate limits for bulk operations are enforced in a central way, for example via a bulk processor service.

## 7. Docker configuration

The project must include:

- A `Dockerfile` that installs dependencies, builds TypeScript and starts the server in HTTP mode with `TRANSPORT=http`.

## 8. Readability and maintainability

Although the code is intended primarily for use by AI agents, it should remain readable and maintainable by humans. That means:

- Clear separation of concerns
- Consistent naming and structure
- Minimal surprise in how tools behave and how they are wired together

When in doubt, prefer an implementation that is straightforward and explicit over a clever but opaque shortcut.
