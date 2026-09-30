from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastmcp import FastMCP
import mcp_oauth


class _StaticVerifier:
    def __init__(self, api_keys, base_url=None):
        self.api_keys = api_keys
        self.base_url = base_url


class McpOAuthContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_client_credentials_never_fall_back_to_an_open_server(self):
        with patch.dict(os.environ, {"MCP_AUTH_MODE": "legacy-key"}, clear=True):
            auth = mcp_oauth.select_mcp_auth("example-mcp", _StaticVerifier, [], None)
        self.assertIsInstance(auth, _StaticVerifier)
        self.assertEqual(auth.api_keys, [])
        with patch.dict(os.environ, {"MCP_AUTH_MODE": "google-oauth"}, clear=True):
            with self.assertRaisesRegex(ValueError, "requires"):
                mcp_oauth.select_mcp_auth("example-mcp", _StaticVerifier, ["legacy-key"], None)

    async def test_oauth_requires_loopback_or_https_origin_and_stable_signing_key(self):
        values = {
            "MCP_OAUTH_GOOGLE_CLIENT_ID": "client-id",
            "MCP_OAUTH_GOOGLE_CLIENT_SECRET": "client-secret",
            "MCP_OAUTH_BASE_URL": "http://remote.example.com:3002",
            "MCP_OAUTH_SIGNING_KEY": "x" * 40,
            "MCP_OAUTH_ALLOWED_EMAILS": "person@example.com",
        }
        with patch.dict(os.environ, values, clear=True):
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                mcp_oauth.build_google_mcp_auth("example-mcp")
        values["MCP_OAUTH_BASE_URL"] = "https://mcp.example.com"
        values["MCP_OAUTH_SIGNING_KEY"] = "short"
        with patch.dict(os.environ, values, clear=True):
            with self.assertRaisesRegex(ValueError, "32 characters"):
                mcp_oauth.build_google_mcp_auth("example-mcp")

    async def test_provider_uses_consent_pkce_redirect_allowlist_and_email_allowlist(self):
        values = {
            "MCP_OAUTH_GOOGLE_CLIENT_ID": "client-id",
            "MCP_OAUTH_GOOGLE_CLIENT_SECRET": "client-secret",
            "MCP_OAUTH_BASE_URL": "https://mcp.example.com",
            "MCP_OAUTH_SIGNING_KEY": "x" * 40,
            "MCP_OAUTH_ALLOWED_EMAILS": "Person@Example.com",
        }
        with patch.dict(os.environ, values, clear=True), patch.object(mcp_oauth, "OAuthProxy", return_value=object()) as provider:
            mcp_oauth.build_google_mcp_auth("example-mcp")
        kwargs = provider.call_args.kwargs
        self.assertEqual(kwargs["base_url"], "https://mcp.example.com")
        self.assertTrue(kwargs["require_authorization_consent"])
        self.assertTrue(kwargs["forward_pkce"])
        self.assertEqual(kwargs["allowed_client_redirect_uris"], mcp_oauth.DEFAULT_CLIENT_REDIRECTS)
        self.assertEqual(kwargs["token_verifier"].allowed_emails, {"person@example.com"})

    async def test_chatgpt_callback_must_be_explicitly_allowed(self):
        values = {
            "MCP_OAUTH_GOOGLE_CLIENT_ID": "client-id",
            "MCP_OAUTH_GOOGLE_CLIENT_SECRET": "client-secret",
            "MCP_OAUTH_BASE_URL": "https://mcp.example.com",
            "MCP_OAUTH_SIGNING_KEY": "x" * 40,
            "MCP_OAUTH_ALLOWED_EMAILS": "person@example.com",
            "MCP_OAUTH_CLIENT_REDIRECT_URIS": "https://chatgpt.com/connector/oauth/example-callback",
        }
        with patch.dict(os.environ, values, clear=True), patch.object(mcp_oauth, "OAuthProxy", return_value=object()) as provider:
            mcp_oauth.build_google_mcp_auth("example-mcp")
        self.assertEqual(provider.call_args.kwargs["allowed_client_redirect_uris"], [values["MCP_OAUTH_CLIENT_REDIRECT_URIS"]])

    async def test_google_token_validation_requires_right_audience_verified_email_and_allowlist(self):
        verifier = mcp_oauth.AllowedGoogleTokenVerifier("client-id", {"person@example.com"})
        async def _check(audience, email, verified):
            access = SimpleNamespace(claims={"google_token_info": {"audience": audience}, "google_user_data": {"email": email, "verified_email": verified}})
            with patch.object(mcp_oauth.GoogleTokenVerifier, "verify_token", new=AsyncMock(return_value=access)):
                return await verifier.verify_token("opaque-token")
        self.assertIsNotNone(await _check("client-id", "Person@Example.com", True))
        self.assertIsNone(await _check("wrong-client", "person@example.com", True))
        self.assertIsNone(await _check("client-id", "other@example.com", True))
        self.assertIsNone(await _check("client-id", "person@example.com", False))

    async def test_http_mcp_requires_token_and_exposes_oauth_resource_metadata(self):
        values = {
            "MCP_OAUTH_GOOGLE_CLIENT_ID": "client-id",
            "MCP_OAUTH_GOOGLE_CLIENT_SECRET": "client-secret",
            "MCP_OAUTH_BASE_URL": "http://127.0.0.1:3002",
            "MCP_OAUTH_SIGNING_KEY": "test-signing-key-with-at-least-32-chars",
            "MCP_OAUTH_ALLOWED_EMAILS": "person@example.com",
        }
        with patch.dict(os.environ, values, clear=True):
            server = FastMCP("oauth-boundary-test", auth=mcp_oauth.build_google_mcp_auth("oauth-boundary-test"))
            app = server.http_app(path="/mcp")
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url=values["MCP_OAUTH_BASE_URL"]) as client:
                denied = await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})
                metadata = await client.get("/.well-known/oauth-protected-resource/mcp")
                authorization_metadata = await client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(metadata.status_code, 200)
        self.assertIn("authorization_servers", metadata.json())
        self.assertEqual(authorization_metadata.status_code, 200)
        self.assertIn("registration_endpoint", authorization_metadata.json())
        self.assertTrue(authorization_metadata.json()["client_id_metadata_document_supported"])
        self.assertIn("S256", authorization_metadata.json()["code_challenge_methods_supported"])

    async def test_user_defined_chatgpt_client_can_be_pre_registered(self):
        callback = "https://chatgpt.com/connector/oauth/example-callback"
        values = {
            "MCP_OAUTH_GOOGLE_CLIENT_ID": "client-id",
            "MCP_OAUTH_GOOGLE_CLIENT_SECRET": "client-secret",
            "MCP_OAUTH_BASE_URL": "https://mcp.example.com",
            "MCP_OAUTH_SIGNING_KEY": "test-signing-key-with-at-least-32-chars",
            "MCP_OAUTH_ALLOWED_EMAILS": "person@example.com",
            "MCP_OAUTH_CLIENT_REDIRECT_URIS": callback,
        }
        with patch.dict(os.environ, values, clear=True):
            server = FastMCP("oauth-registration-test", auth=mcp_oauth.build_google_mcp_auth("oauth-registration-test"))
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.http_app(path="/mcp")), base_url=values["MCP_OAUTH_BASE_URL"]) as client:
                response = await client.post("/register", json={
                    "client_name": "ChatGPT MCP connector",
                    "redirect_uris": [callback],
                    "grant_types": ["authorization_code", "refresh_token"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue(response.json()["client_id"])
        self.assertEqual(response.json()["redirect_uris"], [callback])


if __name__ == "__main__":
    unittest.main()
