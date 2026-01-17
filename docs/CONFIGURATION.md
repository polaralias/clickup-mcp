# Configuration Reference

## Environment Variables

### Required Variables

| Variable | Description | Example |
| --- | --- | --- |
| `MASTER_KEY` | Encryption key for secrets. Either 64 hex chars or a passphrase. | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |

### Server Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `TRANSPORT` | `http` | Transport mode: `http` or `stdio` |
| `BASE_URL` | (auto-detected) | Public URL for OAuth redirects |
| `NODE_ENV` | `development` | Environment: `development` or `production` |

### Authentication

| Variable | Default | Description |
| --- | --- | --- |
| `API_KEY_MODE` | `disabled` | API key mode: `disabled`, `global`, `user_bound` |
| `MCP_API_KEY` | - | Global API key (when `API_KEY_MODE=global`) |
| `REDIRECT_URI_ALLOWLIST` | - | Comma-separated allowed OAuth redirect URIs |
| `REDIRECT_URI_ALLOWLIST_MODE` | `exact` | Allowlist mode: `exact` or `prefix` |

### Session Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `CODE_TTL_SECONDS` | `90` | Authorization code lifetime |
| `TOKEN_TTL_SECONDS` | `3600` | Session token lifetime |

### ClickUp Defaults

| Variable | Default | Description |
| --- | --- | --- |
| `CLICKUP_API_TOKEN` | - | Default ClickUp API token |
| `TEAM_ID` | - | Default ClickUp team/workspace ID |
| `WRITE_MODE` | `write` | Write mode: `write`, `read`, `selective` |
| `CHAR_LIMIT` | `16000` | Response character limit |

## Docker Compose

The `docker-compose.yml` maps port `3011` externally to `3000` internally:

```yaml
ports:
  - "3011:3000"  # External: Internal
```

This means:
- The container listens on port `3000` internally
- Access via `http://localhost:3011` from the host
- Nginx Proxy Manager should target port `3011` (or `3000` if on same Docker network)
