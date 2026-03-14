from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 3004
DEFAULT_PATH = "/mcp"
DEFAULT_HEALTH_PATH = "/health"
DEFAULT_TRANSPORT = "streamable-http"


@dataclass(frozen=True)
class RuntimeConfig:
    host: str
    port: int
    path: str
    health_path: str
    transport: str

    @property
    def mcp_url(self) -> str:
        return f"http://{self.host}:{self.port}{self.path}"

    @property
    def health_url(self) -> str:
        return f"http://{self.host}:{self.port}{self.health_path}"


def _normalize_path(value: str) -> str:
    cleaned = (value or "/").strip()
    if not cleaned:
        return "/"
    return "/" + cleaned.strip("/")


def _runtime_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is None:
            continue
        cleaned = value.strip()
        if cleaned:
            return cleaned
    return default


def _env_file_candidates() -> list[Path]:
    candidates: list[Path] = []
    configured = os.getenv("MCP_ENV_FILE", "").strip()
    if configured:
        candidates.append(Path(configured))
    candidates.append(REPO_ROOT / ".env")
    return candidates


def load_env_files() -> None:
    seen: set[Path] = set()
    for candidate in _env_file_candidates():
        path = candidate.expanduser().resolve()
        if path in seen or not path.exists() or not path.is_file():
            continue
        seen.add(path)
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if not key:
                continue
            if len(value) >= 2 and value[:1] == value[-1:] and value[:1] in {"'", '"'}:
                value = value[1:-1]
            os.environ.setdefault(key, value)


def load_config() -> RuntimeConfig:
    transport = _runtime_env(
        "MCP_TRANSPORT",
        "FASTMCP_TRANSPORT",
        default=DEFAULT_TRANSPORT,
    ).lower()
    if transport == "http":
        transport = "streamable-http"

    return RuntimeConfig(
        host=_runtime_env("MCP_HOST", "HOST", default=DEFAULT_HOST),
        port=int(_runtime_env("MCP_PORT", "PORT", default=str(DEFAULT_PORT))),
        path=_normalize_path(_runtime_env("MCP_PATH", default=DEFAULT_PATH)),
        health_path=_normalize_path(
            _runtime_env("MCP_HEALTH_PATH", default=DEFAULT_HEALTH_PATH)
        ),
        transport=transport,
    )


def _venv_fastmcp() -> Path | None:
    if os.name == "nt":
        candidate = REPO_ROOT / ".venv" / "Scripts" / "fastmcp.exe"
    else:
        candidate = REPO_ROOT / ".venv" / "bin" / "fastmcp"
    return candidate if candidate.exists() else None


def fastmcp_command() -> list[str]:
    venv_fastmcp = _venv_fastmcp()
    if venv_fastmcp is not None:
        return [str(venv_fastmcp)]

    uv = shutil.which("uv")
    if uv:
        return [uv, "run", "fastmcp"]

    fastmcp = shutil.which("fastmcp")
    if fastmcp:
        return [fastmcp]

    return [sys.executable, "-m", "fastmcp.cli"]


def build_env(config: RuntimeConfig) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("HOST", config.host)
    env.setdefault("PORT", str(config.port))
    env.setdefault("MCP_PATH", config.path)
    env.setdefault("MCP_HEALTH_PATH", config.health_path)
    env.setdefault("FASTMCP_TRANSPORT", config.transport)
    env.setdefault("PYTHONUNBUFFERED", "1")
    return env


def serve_command(
    config: RuntimeConfig,
    *,
    reload_enabled: bool = False,
    extra_args: list[str] | None = None,
) -> list[str]:
    command = fastmcp_command() + [
        "run",
        "fastmcp.json",
        "--transport",
        config.transport,
        "--host",
        config.host,
        "--port",
        str(config.port),
        "--path",
        config.path,
        "--no-banner",
    ]
    if reload_enabled:
        command.append("--reload")
    if extra_args:
        command.extend(extra_args)
    return command


def direct_command() -> list[str]:
    return [sys.executable, str(REPO_ROOT / "server.py")]


def is_server_healthy(config: RuntimeConfig, timeout_seconds: float = 2.0) -> bool:
    request = Request(config.health_url, method="GET")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return 200 <= getattr(response, "status", 0) < 300
    except HTTPError as exc:
        return exc.code < 500
    except URLError:
        return False


def _remainder(values: list[str]) -> list[str]:
    if values and values[0] == "--":
        return values[1:]
    return values


def cmd_serve(config: RuntimeConfig, args: argparse.Namespace) -> int:
    extra_args = _remainder(args.server_args)
    if args.reload or extra_args:
        command = serve_command(
            config,
            reload_enabled=args.reload,
            extra_args=extra_args,
        )
    else:
        command = direct_command()
    return subprocess.run(command, cwd=REPO_ROOT, env=build_env(config), check=False).returncode


def cmd_url(config: RuntimeConfig, _args: argparse.Namespace) -> int:
    print(config.mcp_url)
    return 0


def cmd_doctor(config: RuntimeConfig, _args: argparse.Namespace) -> int:
    print(f"repo={REPO_ROOT}")
    print(f"mcp_url={config.mcp_url}")
    print(f"health_url={config.health_url}")
    print(f"transport={config.transport}")
    print(f"health={'online' if is_server_healthy(config) else 'offline'}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="clickup-mcp runtime helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("doctor", help="Show runtime diagnostics")
    subparsers.add_parser("url", help="Print the MCP URL")

    serve_parser = subparsers.add_parser("serve", help="Run the MCP server")
    serve_parser.add_argument("--reload", action="store_true", help="Enable reload mode")
    serve_parser.add_argument(
        "server_args",
        nargs=argparse.REMAINDER,
        help="Additional fastmcp run arguments",
    )
    return parser


def main() -> int:
    load_env_files()
    parser = build_parser()
    args = parser.parse_args()
    config = load_config()

    if args.command == "doctor":
        return cmd_doctor(config, args)
    if args.command == "url":
        return cmd_url(config, args)
    if args.command == "serve":
        return cmd_serve(config, args)

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
