---
type: "Repository Guide"
title: "ClickUp MCP"
description: "Documents ClickUp MCP for the clickup-mcp repository."
timestamp: 2026-07-28T21:55:36Z
authority: canonical
verification: untested
owner: polaralias
tags:
  - clickup-mcp
  - repository-guide
navigation:
  role: entry-point
  order: 10
---
<p align="center">
  <img src="ClickUp%20MCP.png" alt="ClickUp MCP banner" width="960" />
</p>

# ClickUp MCP

ClickUp MCP is a FastMCP server that exposes ClickUp workspace operations through a validated, checked-in tool surface.

## What It Does

The server gives agents and local tools a structured way to read and update ClickUp data without inventing ad hoc wrappers on each project. The repository focuses on a fully declared tool surface, evidence-backed validation, and predictable local runtime behaviour.

## Core Capabilities

- workspace, space, folder, and list operations
- task creation, updates, and lifecycle actions
- member, doc, view, time-tracking, and custom-field coverage
- checked-in tool manifest and validation status artefacts
- local and live smoke validation paths

## Quick Start

Run locally:

```bash
python scripts/run_server.py serve
```

Useful helpers:

```bash
python scripts/run_server.py doctor
python scripts/run_server.py url
```

## Configuration

Common live runtime configuration:

- `CLICKUP_API_TOKEN`
- `CLICKUP_TEAM_ID`
- `CLICKUP_MCP_API_KEY` or `MCP_API_KEY`

See [docs/configuration.md](docs/configuration.md) for the supported configuration surface.

## Verification

Primary local validation commands:

```bash
python scripts/validate_harness.py
python scripts/run_harness.py
python scripts/run_live_smoke.py
```

## Docker

```bash
docker build -t clickup-mcp:local .
docker run --rm -p 3004:3004 -e API_KEY_MODE=disabled clickup-mcp:local
```

## Documentation

Start with:

- [docs/tool-reference.md](docs/tool-reference.md)
- [docs/configuration.md](docs/configuration.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)

For repository workflow and agent-focussed context, read [AGENTS.md](AGENTS.md).

## Repository knowledge

- [Documentation map](docs/knowledge/documentation-map.md) — RKE-managed reading order and relationship hub.

## MCP client OAuth

See [MCP client OAuth](docs/mcp-oauth.md) for Google sign-in, migration, and validation.
