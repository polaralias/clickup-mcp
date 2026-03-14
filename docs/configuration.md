# Configuration Reference

This guide explains the supported environment variables and deployment knobs for `clickup-mcp`.

## Required settings

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLICKUP_API_TOKEN` | Yes | none | ClickUp API token used for all v2 and v3 API requests. |
| `CLICKUP_TEAM_ID` / `TEAM_ID` | Yes | none | Default workspace or team ID used when a tool call does not provide one explicitly. |
| `CLICKUP_MCP_API_KEY` | Recommended | none | Service-specific bearer token accepted by the HTTP MCP endpoint. |

## MCP client auth

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MCP_API_KEY` | No | none | Generic single-key alias if you prefer a shared naming pattern across services. |
| `MCP_API_KEYS` | No | none | Comma-separated additional bearer tokens accepted by the MCP endpoint. |
| `API_KEY_MODE` | No | static auth enabled | Set to `disabled` to turn off bearer-token checks entirely. |

## Endpoint and transport

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLICKUP_MCP_PORT` | No | `3004` | Internal service port used by the compose examples. |
| `CLICKUP_MCP_HOST_PORT` | No | `3004` | Host-side published port in the bundled `docker-compose.yml`. |
| `CLICKUP_MCP_PATH` | No | `/mcp` | HTTP path where the MCP endpoint is exposed. |
| `MCP_HOST` / `HOST` | No | `127.0.0.1` locally, `0.0.0.0` in compose | Host bind address used by `scripts/run_server.py` and FastMCP. |
| `MCP_PORT` / `PORT` | No | `3004` | Generic runtime port override. |
| `MCP_PATH` | No | `/mcp` | Generic runtime path override. |
| `MCP_TRANSPORT` / `FASTMCP_TRANSPORT` | No | `streamable-http` | Transport mode. `stdio` is mainly useful for local tooling and testing. |

## Write safety controls

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `WRITE_MODE` | No | `write`, unless allowlists imply `selective` | Main write policy. Supported values are `write`, `read`, and `selective`. |
| `READ_ONLY_MODE` | No | unset | Legacy boolean override that forces read-only behavior. |
| `SELECTIVE_WRITE` | No | unset | Legacy boolean override that forces selective-write behavior. |
| `WRITE_ALLOWED_SPACES` | No | none | Comma-separated space IDs allowed when selective-write mode is active. |
| `WRITE_ALLOWED_LISTS` | No | none | Comma-separated list IDs allowed when selective-write mode is active. |

## Runtime tuning

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `CLICKUP_HTTP_TIMEOUT_MS` | No | `30000` | HTTP timeout for outbound ClickUp API calls. |
| `CHAR_LIMIT` | No | `16000` | Character cap used for long previews and summarized responses. |
| `MAX_ATTACHMENT_MB` | No | `8` | Maximum attachment size accepted by upload helper tools. |
| `REPORTING_MAX_TASKS` | No | `200` | Upper bound for report-style task scans. |
| `DEFAULT_RISK_WINDOW_DAYS` | No | `5` | Default time window used by the risk-report helpers. |
| `HIERARCHY_CACHE_TTL_MS` / `HIERARCHY_CACHE_TTL_SECONDS` | No | `300000 ms` | Cache TTL for workspace, space, folder, and list hierarchy lookups. |
| `SPACE_CONFIG_CACHE_TTL_MS` / `SPACE_CONFIG_CACHE_TTL_SECONDS` | No | `300000 ms` | Cache TTL for derived space configuration lookups. |

## Files and deployment notes

- `tool_manifest_clickup.json` is the source of truth for the public tool catalog and parameter schemas.
- The bundled compose file assumes the external Docker network `reverse_proxy` already exists.
- Existing ClickUp credentials remain entirely env-driven; there is no additional browser re-auth step for this server.
