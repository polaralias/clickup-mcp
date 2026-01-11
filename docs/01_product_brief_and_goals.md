# ClickUp MCP Server – Product Brief and Goals

## 1. Purpose

This project is an MCP server that exposes high quality, agent friendly tools for working with ClickUp. It is not a thin REST proxy. The server provides a stable, well described tool surface that lets AI assistants and other MCP clients:

- Discover and navigate ClickUp hierarchies
- Search, read and summarise tasks and docs
- Safely perform task, doc and time tracking operations
- Generate structured reports over ClickUp data

The focus is on predictable behaviour, safety and token efficiency rather than maximum raw coverage of the ClickUp API.

## 2. Primary users and usage

- AI assistants used by knowledge workers, engineers and operations teams
- Developers integrating MCP tools into their own automation flows

Typical usage patterns:

- Daily task triage and planning
- Content discovery and summarisation across ClickUp docs and tasks
- Time tracking and reporting for individuals and teams
- Workspace overview and status reporting for managers

## 3. High level objectives

1. Provide a coherent tool catalogue that matches how people actually work in ClickUp, not raw API endpoints.
2. Make it easy for an AI to reason about workspace structure and find relevant information.
3. Ensure destructive operations are always explicit, deliberate and reversible where possible.
4. Keep responses compact and structured so that downstream agents can combine tools without blowing token limits.
5. Support local Docker usage.

## 4. Non negotiable requirements

- **Deterministic behaviour**  
  Tools should behave consistently for the same inputs. No hidden randomness or surprising side effects.

- **Safety for destructive actions**  
  Any tool that can delete, move or overwrite meaningful data must:
  - Require a `confirm: "yes"` style field before it actually mutates state
  - Offer a dry run mode where practical so the agent can preview effects

- **Token efficiency**  
  Tools should:
  - Return only the information that is needed for planning or follow up
  - Use structured fields wherever possible instead of long natural language blobs
  - Respect global character or token budgets and signal when truncation happens

- **Clear contracts**  
  Each tool must have:
  - A precise description of what it does
  - Explicit input and output schemas
  - Clear notes on edge cases and constraints

  - A `/mcp` endpoint using Streamable HTTP transport
  - CORS configured correctly for browser based MCP clients
  - Port binding controlled by the `PORT` environment variable

## 5. Out of scope

- Implementing every single ClickUp API endpoint
- Full text indexing or vector search beyond what is needed for fuzzy search and ranking
- Complex workflow orchestration independent of agents (this server exposes tools; orchestration is left to the client side agent)

## 6. Example target workflows

These examples illustrate the type of behaviour this server should support. They are not exact API contracts but give the LLM intent and flavour.

### 6.1 Personal daily planning

1. List the current workspace, spaces and lists available to the user.
2. Find all open tasks assigned to the user for this week, using a mix of structured filters and fuzzy search.
3. Group tasks by space and priority for planning.
4. Create or update tasks as the user reprioritises work, with confirmation before any destructive edits.

### 6.2 Doc discovery and summarisation

1. Given a natural language query like “latest architecture decisions for the payments service”, search ClickUp docs.
2. Return a ranked set of relevant docs with titles, locations and short snippets.
3. Optionally expand the top N docs into page bodies within a token budget for summarisation.
4. Allow the agent to update or create docs as required, with clear signals when updates are destructive.

### 6.3 Time reporting for a tag

1. Resolve a workspace, space or list and a specific tag that indicates a project or client.
2. Aggregate time entries associated with tasks tagged that way for a given period.
3. Return a structured breakdown suitable for reporting (per user, per list, per day).
4. Respect rate limits and token budgets when working across many tasks. 

### 6.4 Workspace overview for managers

1. Provide a high level view of spaces, lists and key tags for a workspace.
2. Surface key metrics such as number of open tasks, recent activity or time logged for a tag.
3. Present results in a compact structured format that can be turned into a natural language summary by the agent.

## 7. Quality bar

The server should feel like a well designed SDK for ClickUp that has been adapted to AI usage rather than a direct mirror of the HTTP API. The emphasis is on:

- Stability of tool names and semantics
- Human understandable descriptions
- Behaviours that encourage safe, incremental use by an AI agent
