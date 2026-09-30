# MCP client OAuth

The HTTP MCP boundary supports Google sign-in through FastMCP OAuthProxy. This authorizes the person connecting an MCP client. It does not replace the server's upstream ClickUp credentials.

Set `MCP_AUTH_MODE=google-oauth` and provide:

- `MCP_OAUTH_GOOGLE_CLIENT_ID` and `MCP_OAUTH_GOOGLE_CLIENT_SECRET` from a Google OAuth web client.
- `MCP_OAUTH_BASE_URL` as the public HTTPS origin of this server (loopback HTTP is allowed for local development). Register `<origin>/auth/callback` on the Google client.
- `MCP_OAUTH_SIGNING_KEY` as a stable, random secret of at least 32 characters. Persist it across restarts.
- `MCP_OAUTH_ALLOWED_EMAILS` as a comma-separated list of verified Google accounts allowed to connect.
- Optionally `MCP_OAUTH_CLIENT_REDIRECT_URIS` as comma-separated MCP client callback patterns. The default permits loopback callbacks. For ChatGPT, set this to the exact Callback URL shown in its connector settings (and any other clients you intend to use); the default will reject ChatGPT callbacks. FastMCP publishes DCR and CIMD support in its authorization-server metadata. If ChatGPT offers only User-Defined OAuth Client, pre-register that callback at the local `/register` endpoint and enter the returned client ID and optional secret in ChatGPT. Copy the callback URL exactly; do not guess a stable URL.

The client ID returned by `/register` goes in ChatGPT's OAuth client ID field. It is separate from `MCP_OAUTH_GOOGLE_CLIENT_ID`, which identifies this server to Google. For a public client, select token endpoint method `none`; if registering a confidential client, use its returned secret and matching method.

Connect the MCP client to `<origin>/mcp`. FastMCP serves OAuth authorization-server metadata at `/.well-known/oauth-authorization-server` and protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`. The flow uses consent and PKCE. Each server has its own signing key and origin. Docker Compose mounts `./state/fastmcp` as `FASTMCP_HOME` so encrypted client registrations and token state survive container restarts; back up this state together with the stable signing key.

`MCP_AUTH_MODE=legacy-key` keeps the existing MCP bearer keys during migration and rejects all clients when no key is configured. `MCP_AUTH_MODE=disabled` is an explicit unauthenticated development mode. The `API_KEY_MODE=disabled` alias remains for existing local test harnesses. After a live OAuth sign-in and authenticated MCP tool call succeed, remove the MCP API key variables and set `MCP_AUTH_MODE=google-oauth`; keep the upstream ClickUp token.

The automated contract checks OAuth metadata, missing-token rejection, configuration validation, audience matching, verified email, and allowlisting. Live Google consent and token exchange require operator credentials and deployment access.
