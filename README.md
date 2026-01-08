# ClickUp MCP

A Model Context Protocol (MCP) server for the ClickUp API, enabling AI agents to interact with your ClickUp workspace.

## Features

- **Hierarchical Access**: Navigate through Spaces, Folders, and Lists.
- **Task Management**: Create, read, update, and delete tasks.
- **Time Tracking**: Log time entries and view reports.
- **Selective Permissions**: Configure read-only access or whitelist specific Spaces/Lists.
- **Secure Authentication**: Supports both OAuth-style Bearer tokens and simple API Key authentication (`x-api-key` header or `?apiKey=` query param).
- **Deployment Options**: Run locally via Docker, deploy to Cloudflare Workers, or use Smithery.

## Quick Start (Local Docker)

The fastest way to deploy the ClickUp MCP server is using Docker Compose. This package includes the MCP server and a PostgreSQL database for persistent session storage.

### 1. Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose installed.
- A ClickUp API Key (Settings -> Apps -> Generate API Key).

### 2. Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/clickup-mcp.git
   cd clickup-mcp
   ```

2. **Configure Environment:**
   Create a `.env` file or set these variables in your environment:
   - `MASTER_KEY`: A 64-character hex string (e.g., `openssl rand -hex 32`) or a strong passphrase.
   - `POSTGRES_PASSWORD`: A secure password for the database.

3. **Deploy:**
   ```bash
   docker-compose up -d --build
   ```
   The server will be available at `http://localhost:3011`.

## Reverse Proxy (Nginx Proxy Manager)

Deploying behind Nginx Proxy Manager (NPM) allows you to use HTTPS and custom domains.

### Nginx Proxy Manager Configuration

1. **Add Proxy Host**:
   - **Domain Names**: `clickup.yourdomain.com`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: 
     - Use `host.docker.internal` if NPM is on the same host but a different Docker network.
     - Use the container name `clickup-mcp` if NPM is on the same Docker network.
   - **Forward Port**: `3011` (The external port mapped in `docker-compose.yml`)
   - **Block Common Exploits**: Enabled

2. **SSL Tab**:
   - Select **Request a new SSL Certificate**.
   - Enable **Force SSL** and **HTTP/2 Support**.

3. **Advanced (Optional)**:
   The server is pre-configured with `app.set("trust proxy", true)`, so it correctly handles `X-Forwarded-*` headers from NPM without extra Nginx configuration.

### Connectivity Troubleshooting
- **Internal Port**: The container listens on port `3000` internally.
- **External Port**: `docker-compose.yml` maps port `3011` to the host. NPM should target `3011` if connecting via the host IP, or `3000` if connecting directly via the Docker network.
- **Base URL**: If your UI redirects don't match your domain, set the `BASE_URL` environment variable to `https://clickup.yourdomain.com`.

## Authentication Methods

This server supports three methods of authentication:

### 1. User-Bound API Keys (Self-Serve)    
This mode allows users to self-provision API keys bound to their own configuration (e.g., their own ClickUp API Token).

**Configuration:**
- Set `API_KEY_MODE=user_bound`.
- Ensure `MASTER_KEY` is set.

**How to use:**
1.  Navigate to the server root (e.g., `http://localhost:3011/`).
2.  Enter your configuration (ClickUp API Key, Team ID, etc.).
3.  Receive a unique MCP API Key.
4.  Use this key in your client:
    - **Header**: `Authorization: Bearer <mcp-api-key>`
    - **Header**: `X-API-Key: <mcp-api-key>`

The server securely encrypts your config and loads it automatically when you use your MCP API Key.

### 2. Simple Global API Key (Legacy)
For simple single-user setups. Configured via `MCP_API_KEY`.
- **Header**: `x-api-key: your-mcp-api-key`
- **Query Param**: `?apiKey=your-mcp-api-key`

> [!NOTE]
> Global keys usually have restricted write access by default unless configured otherwise.

**Example (curl):**
```bash
curl "http://localhost:3011/mcp" \
  -H "Authorization: Bearer your-mcp-api-key" \
  -H "Accept: application/json, text/event-stream"
```

### 3. OAuth-style Bearer Tokens
A standard OAuth 2.0-style flow for creating secure, long-lived sessions. Critical for multi-user environments.

### How it Works

1.  **Initiation**:
    The client (e.g., an AI agent or a web dashboard) directs the user to the Configuration UI with a `redirect_uri` parameter:
    `https://your-server.com/connect?redirect_uri=https://client-app.com/callback`

2.  **Configuration**:
    The user enters their ClickUp API Key and configures permissions (Read Only, Selective Write) in the UI.

3.  **Authorization**:
    When the user clicks "Connect", the server:
    - Creates a persistent **Connection** record (encrypted API key).
    - Generates a short-lived **Authorization Code**.
    - Redirects the user back to the `redirect_uri` with the code:
      `https://client-app.com/callback?code=generated_auth_code`

4.  **Token Exchange**:
    The client application blindly exchanges this code for a long-lived **Session Token**:
    - **POST** `/token`
    - **Body**: `{ "code": "generated_auth_code", "redirect_uri": "https://client-app.com/callback" }`
    - **Response**: `{ "access_token": "session_id:session_secret" }`

5.  **API Usage**:
    The client uses this token to make authenticated requests:
    - **Header**: `Authorization: Bearer session_id:session_secret`
    - **Header**: `MCP-Session-ID: session_id` (Optional but recommended for stateful context)

This flow ensures the sensitive API Key never leaves the server's secure storage after initial entry, and the Client Application never handles the raw API Credentials.

## ChatGPT Compatibility (RFC 7591)

This server supports **RFC 7591 Dynamic Client Registration (DCR)**, which is required by ChatGPT for OAuth integration.

### OAuth Metadata
You can find the OAuth metadata at:
`GET /.well-known/oauth-authorization-server`

It includes the `registration_endpoint` used for dynamic registration.

### Verification
To verify DCR is working:
1. Register a client:
   ```powershell
   Invoke-RestMethod -Uri "$BASE_URL/register" -Method Post -Body @{
       redirect_uris = @("https://oauth.pstmn.io/v1/callback")
       client_name = "Test Client"
   } | ConvertTo-Json
   ```
2. Use the returned `client_id` in the OAuth flow.

### Smoke Test
A full smoke test script is available at `scripts/dcr-smoke-test.ps1`.

## Deployment on Cloudflare Workers

1.  **Install dependencies:** `npm install`
2.  **Build:** `npm run build`
3.  **Deploy:** `npx wrangler deploy`

See `wrangler.jsonc` for configuration details.

## Deployment with Smithery

To run the ClickUp MCP server using [Smithery](https://smithery.ai):

```bash
npx -y @smithery/cli run clickup-mcp --config "{\"teamId\":\"123456\",\"apiKey\":\"pk_...\"}"
```

## Configuration

The server expects standard environment variables for its operation. When running via Docker Compose, the `environment:` section is sufficient. For local development, use a `.env` file (see `.env.example`).

- `MASTER_KEY`: **(Required)** A 64-character hex string or a strong passphrase. This is used to encrypt sensitive ClickUp API keys in the database.
- `BASE_URL`: **(Required for OAuth)** The public URL where the server is reachable (e.g., `https://clickup.your-domain.com`).
- `SMITHERY`: **(Optional, default: true)** Controls root path (/) behavior. 
  - When `true` (default), `/` redirects to the Smithery connection UI.
  - When `false`, `/` serves the local connection UI (same as `/connect`).

### Troubleshooting

- **UI says "not configured"**: 
  - Check if `MASTER_KEY` is correctly injected into the container/process.
  - If running locally, ensure `.env` exists in the root directory and contains `MASTER_KEY`.
- **Protected routes return 500 error**: 
  - This usually indicates the server started without a `MASTER_KEY`. Check the server logs for "Server starting in UNCONFIGURED mode".

## Default docker-compose values

The `docker-compose.yml` file contains example values for several environment variables. You **must** change these for any real deployment.

*   `MASTER_KEY`: Set to `8ddec8ff377e8ea6f88d223594bca495f4e6629ec23719f96b343389475c755f` in `docker-compose.yml` for demonstration. You **must** change this for any real deployment.
    - If you provide exactly 64 hex characters, they are decoded as 32 bytes of key material.
    - Otherwise, the value is treated as a passphrase and hashed with SHA-256 to produce 32 bytes.
*   `REDIRECT_URI_ALLOWLIST`: A comma-separated list of allowed redirect URIs or prefixes. Defaults to including ChatGPT, OpenAI, and local development URIs.
*   `REDIRECT_URI_ALLOWLIST_MODE`: Set to `exact` (default) or `prefix`. 
    - **`prefix` (Recommended)**: Allows any URI starting with the allowed string. Essential for services like ChatGPT that use dynamic sub-paths.
    - **`exact`**: Requires an exact string match.
*   `CODE_TTL_SECONDS`: Set to `90`.
*   `TOKEN_TTL_SECONDS`: Set to `3600`.

### Rejection Logging
For security and maintenance, any rejected redirect URI (one that doesn't match the allowlist) is logged server-side with the requester's IP and provided client information. This allows maintainers to quickly identify and add legitimate new callback domains to the allowlist. 

If your client is rejected, the UI will display:
> "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added"


## Smoke Test

You can verify the authentication flow and MCP functionality using the provided PowerShell script.

1.  **Start the connection**: Open your browser and navigate to `/connect` (e.g., `http://localhost:3011/connect`). Fill in the details and use a dummy redirect URI if testing manually (e.g., `http://localhost:3000/callback`).
2.  **Get the code**: After clicking Connect, you will be redirected. Copy the `code` parameter from the URL.
3.  **Run the script**:
    ```powershell
    ./scripts/smoke-test.ps1
    ```
4.  **Follow prompts**: Enter the Base URL, the Code you copied, and the Code Verifier (if you have it from your PKCE generation, otherwise this step requires a valid verifier to succeed).

## License

MIT
