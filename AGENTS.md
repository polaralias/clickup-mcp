# Using this repo with LLM agents

This repository is designed to be friendly to LLM based agents that need to either:

- Rebuild or extend the ClickUp MCP Server
- Understand how to use its tools safely and effectively

If you are an LLM (or prompting one), use the documents in this folder as your primary context.

## Reference documents

Read these first:

- [01_product_brief_and_goals](./docs/01_product_brief_and_goals.md)  
  What this server is for, who uses it, high level goals, non negotiables.

- [02_clickup_domain_and_flows](./docs/02_clickup_domain_and_flows.md)  
  How ClickUp is structured, key concepts, and the main workflows this server should support.

- [03_operational_and_safety_constraints](./docs/03_operational_and_safety_constraints.md)  
  Deployment model, container requirements, configuration, safety and limits.

- [04_codebase_architecture_and_house_style](./docs/04_codebase_architecture_and_house_style.md)  
  Expected project layout, layering, naming conventions and general coding style.

Treat these files as authoritative when making design decisions or resolving ambiguities.

## Lightweight rebuild prompt for LLMs

If you need to reconstruct or significantly modify the server, use a prompt similar to this:

> You are rebuilding a ClickUp MCP Server that exposes high quality, agent friendly tools over HTTP, usable locally via Docker.
>
> 1. Read and internalise:
>    - `01_product_brief_and_goals.md`
>    - `02_clickup_domain_and_flows.md`
>    - `03_operational_and_safety_constraints.md`
>    - `04_codebase_architecture_and_house_style.md`
> 2. Recreate a TypeScript codebase that:
>    - Implements the layered architecture described in the architecture doc: MCP tools layer, application usecases, infrastructure gateways.
>    - Exposes an MCP compatible `/mcp` HTTP endpoint with Streamable HTTP transport, correct CORS, and binding to the `PORT` environment variable.
>    - Includes a `Dockerfile` suitable for Docker deployment.
>    - Provides tools for ClickUp hierarchy navigation, task lifecycle, fuzzy and structured search, docs search and editing, and time tracking and reporting, matching the domain and workflow expectations.
>    - Applies the safety patterns from the constraints doc, including explicit confirmation and optional dry runs for destructive operations, attachment limits and token budgeting with truncation flags.
> 3. Follow the house style for file layout, naming and coding practices. Do not add comments unless strictly necessary. Prefer compact, structured tool responses that are easy for agents to chain.
> 4. Where details are not fully specified, choose behaviours that are consistent with the goals and examples in the docs, and that favour predictability, safety and token efficiency.

## How agents should use the tools

When acting as an agent calling this ClickUp MCP Server:

- Prefer read and discovery tools (listing, searching, summarising) before making changes.
- Use hierarchy tools to resolve paths and names to concrete IDs instead of guessing.
- For any destructive or sensitive operation (deleting, moving, overwriting, bulk changes, time deletion), first:
  - Call the tool in dry run mode if available, or
  - Ask the user for explicit confirmation and pass `confirm: "yes"` only when they agree.
- Watch for truncation flags in responses and request narrower or paginated views when you need more detail.

By following these principles and the four reference documents, an LLM can reliably rebuild, extend and safely drive this ClickUp MCP Server.
