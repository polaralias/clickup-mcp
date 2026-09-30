"""Google sign-in for the client-to-MCP HTTP authorization boundary.

This is separate from every upstream credential used by a tool implementation.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

from fastmcp.server.auth.oauth_proxy import OAuthProxy
from fastmcp.server.auth.providers.google import GoogleTokenVerifier

GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
DEFAULT_CLIENT_REDIRECTS = ["http://127.0.0.1:*/*", "http://localhost:*/*"]


class AllowedGoogleTokenVerifier(GoogleTokenVerifier):
    def __init__(self, client_id: str, allowed_emails: set[str]):
        super().__init__(required_scopes=["openid", GOOGLE_EMAIL_SCOPE])
        self.client_id = client_id
        self.allowed_emails = allowed_emails

    async def verify_token(self, token: str):
        access = await super().verify_token(token)
        if access is None:
            return None
        claims = access.claims or {}
        token_info = claims.get("google_token_info") or {}
        user_data = claims.get("google_user_data") or {}
        email = str(user_data.get("email") or "").strip().lower()
        if token_info.get("audience") != self.client_id:
            return None
        if user_data.get("verified_email") is not True or email not in self.allowed_emails:
            return None
        return access


def build_google_mcp_auth(service_name: str) -> OAuthProxy:
    client_id = os.getenv("MCP_OAUTH_GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("MCP_OAUTH_GOOGLE_CLIENT_SECRET", "").strip()
    base_url = os.getenv("MCP_OAUTH_BASE_URL", "").strip().rstrip("/")
    signing_key = os.getenv("MCP_OAUTH_SIGNING_KEY", "").strip()
    allowed_emails = {
        email.strip().lower()
        for email in os.getenv("MCP_OAUTH_ALLOWED_EMAILS", "").split(",")
        if email.strip()
    }
    if not all((client_id, client_secret, base_url, signing_key, allowed_emails)):
        raise ValueError(
            "MCP OAuth requires MCP_OAUTH_GOOGLE_CLIENT_ID, MCP_OAUTH_GOOGLE_CLIENT_SECRET, "
            "MCP_OAUTH_BASE_URL, MCP_OAUTH_SIGNING_KEY, and MCP_OAUTH_ALLOWED_EMAILS"
        )
    if len(signing_key) < 32:
        raise ValueError("MCP_OAUTH_SIGNING_KEY must contain at least 32 characters")
    parsed = urlparse(base_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ValueError("MCP_OAUTH_BASE_URL must be an origin without credentials, path, query, or fragment")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("MCP_OAUTH_BASE_URL must use HTTPS except for loopback development")
    redirects = [
        value.strip() for value in os.getenv("MCP_OAUTH_CLIENT_REDIRECT_URIS", "").split(",") if value.strip()
    ] or DEFAULT_CLIENT_REDIRECTS
    verifier = AllowedGoogleTokenVerifier(client_id, allowed_emails)
    return OAuthProxy(
        upstream_authorization_endpoint=GOOGLE_AUTHORIZE,
        upstream_token_endpoint=GOOGLE_TOKEN,
        upstream_client_id=client_id,
        upstream_client_secret=client_secret,
        token_verifier=verifier,
        base_url=base_url,
        issuer_url=base_url,
        jwt_signing_key=signing_key + ":" + service_name,
        allowed_client_redirect_uris=redirects,
        require_authorization_consent=True,
        forward_pkce=True,
    )


def select_mcp_auth(service_name: str, static_verifier: type, api_keys: list[str], base_url: str | None = None) -> Any:
    """Select the transitional HTTP auth mode, always failing closed by default."""
    mode = os.getenv("MCP_AUTH_MODE", "").strip().lower()
    if not mode:
        mode = "disabled" if os.getenv("API_KEY_MODE", "").strip().lower() == "disabled" else "legacy-key"
    if mode == "google-oauth":
        return build_google_mcp_auth(service_name)
    if mode == "legacy-key":
        return static_verifier(api_keys=api_keys, base_url=base_url)
    if mode == "disabled":
        return None
    raise ValueError("MCP_AUTH_MODE must be google-oauth, legacy-key, or disabled")
