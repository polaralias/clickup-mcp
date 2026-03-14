# clickup-mcp

Standalone Python/FastMCP server for ClickUp with direct HTTP transport, static API-key auth, and no tunnel sidecar.

## Highlights

- Default MCP endpoint: `http://localhost:3004/mcp`
- Default health endpoint: `http://localhost:3004/health`
- Supports `CLICKUP_MCP_API_KEY`, `MCP_API_KEY`, or `MCP_API_KEYS`
- Preserves existing ClickUp write controls such as `WRITE_MODE`, `WRITE_ALLOWED_SPACES`, and `WRITE_ALLOWED_LISTS`

## Configuration

1. Copy `.env.example` to `.env`
2. Fill in the required values:
   - `CLICKUP_API_TOKEN`
   - `CLICKUP_TEAM_ID` or `TEAM_ID`
   - `CLICKUP_MCP_API_KEY`

Common optional settings:

- `CLICKUP_MCP_PORT`
- `CLICKUP_MCP_HOST_PORT`
- `CLICKUP_MCP_PATH`
- `WRITE_MODE`
- `WRITE_ALLOWED_SPACES`
- `WRITE_ALLOWED_LISTS`
- `API_KEY_MODE`

Docker Compose note:

- If a secret contains a literal `$`, escape it as `$$` in `.env`

## Run Locally

```bash
python scripts/run_server.py serve
python scripts/run_server.py doctor
python scripts/run_server.py url
```

The local helper serves streamable HTTP on `MCP_HOST` / `MCP_PORT` / `MCP_PATH`.

## Run With Docker Compose

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

The included [docker-compose.yml](docker-compose.yml) publishes the ClickUp MCP server on port `3004` by default and joins the external `reverse_proxy` network.

## Add To A Shared MCP Compose Project

Use this service in a larger compose stack when you want one project containing multiple MCP servers:

```yaml
services:
  clickup-mcp:
    build:
      context: /path/to/clickup-mcp
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file:
      - /path/to/clickup-mcp/.env
    environment:
      MCP_HOST: 0.0.0.0
      MCP_PORT: "3004"
      MCP_PATH: /mcp
    ports:
      - "3004:3004"
    networks:
      - reverse_proxy

networks:
  reverse_proxy:
    external: true
```

If you do not need host port publishing because you are fronting the service with another internal proxy, you can omit the `ports` section.

## MCP Client Connection

- URL: `http://<host>:<port>/mcp`
- Header: `Authorization: Bearer <your-api-key>`

## Repository Notes

- Tool definitions are loaded from `tool_manifest_clickup.json`
- The runtime talks directly to ClickUp API v2 and v3
- Health responses identify the server as `clickup-mcp`
