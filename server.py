
from __future__ import annotations

import base64
import json
import os
import re
import secrets
import time
from urllib.parse import urlparse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

import requests
from fastmcp import FastMCP
from fastmcp.server.auth import AccessToken, TokenVerifier
from mcp_oauth import select_mcp_auth
from fastmcp.tools import FunctionTool
from starlette.responses import JSONResponse

BASE_V2 = "https://api.clickup.com/api/v2/"
BASE_V3 = "https://api.clickup.com/api/v3/"
RETRY_STATUS = {429, 500, 502, 503, 504}
RUNTIME_PLACEHOLDER_RE = re.compile(r"^\$\{[A-Za-z_][A-Za-z0-9_]*\}$")
DEFAULT_CHAR_LIMIT = 16000
DEFAULT_ATTACHMENT_LIMIT_MB = 8
DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
DEFAULT_REPORTING_MAX_TASKS = 200
DEFAULT_RISK_WINDOW_DAYS = 5
WRITE_MODES = {"write", "read", "selective"}


def _runtime_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is None:
            continue
        cleaned = value.strip()
        if not cleaned or RUNTIME_PLACEHOLDER_RE.fullmatch(cleaned):
            continue
        return cleaned
    return default


def _parse_bool_flag(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
    return None


def _parse_positive_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _parse_non_negative_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _parse_id_list(value: Any) -> list[str]:
    if isinstance(value, list):
        results: list[str] = []
        for entry in value:
            if isinstance(entry, (str, int, float)):
                token = str(entry).strip()
                if token:
                    results.append(token)
        return results
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return []
        return [token.strip() for token in re.split(r"[\s,]+", trimmed) if token.strip()]
    return []


def _coerce_string(value: Any) -> str | None:
    if isinstance(value, str):
        token = value.strip()
        return token or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)
    return None


def _collect_ids(input_value: Any, keys: set[str]) -> set[str]:
    results: set[str] = set()
    if input_value is None:
        return results
    if isinstance(input_value, list):
        for entry in input_value:
            results.update(_collect_ids(entry, keys))
        return results
    if not isinstance(input_value, dict):
        return results

    for key, value in input_value.items():
        if key in keys:
            if isinstance(value, list):
                for entry in value:
                    token = _coerce_string(entry)
                    if token:
                        results.add(token)
            else:
                token = _coerce_string(value)
                if token:
                    results.add(token)

    for container in ("tasks", "subtasks", "defaults", "operations"):
        nested = input_value.get(container)
        if nested is not None:
            results.update(_collect_ids(nested, keys))

    return results


def _severity_bucket(overdue_days: int) -> str:
    if overdue_days <= 3:
        return "1-3d"
    if overdue_days <= 7:
        return "4-7d"
    return "8+d"


def _is_closed_status(status: str | None, status_type: str | None) -> bool:
    normalized_type = (status_type or "").strip().lower()
    if normalized_type in {"done", "closed", "complete", "completed"}:
        return True
    normalized = (status or "").strip().lower()
    return normalized in {"done", "closed", "complete", "completed", "resolved"}


def _extract_status(task: dict[str, Any]) -> tuple[str | None, str | None]:
    raw = task.get("status")
    if isinstance(raw, str):
        return raw, None
    if isinstance(raw, dict):
        status = _coerce_string(raw.get("status") or raw.get("name") or raw.get("text"))
        status_type = _coerce_string(raw.get("type"))
        return status, status_type
    return None, None


def _extract_priority(task: dict[str, Any]) -> str | None:
    raw = task.get("priority")
    if isinstance(raw, str):
        return raw or None
    if isinstance(raw, dict):
        return _coerce_string(raw.get("label") or raw.get("priority") or raw.get("text"))
    return None


def _extract_tags(task: dict[str, Any]) -> list[str]:
    tags = task.get("tags")
    if not isinstance(tags, list):
        return []
    results: list[str] = []
    for entry in tags:
        if isinstance(entry, str):
            if entry:
                results.append(entry)
            continue
        if isinstance(entry, dict):
            value = _coerce_string(entry.get("name") or entry.get("tag") or entry.get("label"))
            if value:
                results.append(value)
    return results


def _extract_assignees(task: dict[str, Any], limit: int = 5) -> tuple[list[dict[str, str]], bool]:
    raw = task.get("assignees")
    if not isinstance(raw, list):
        return [], False
    members: list[dict[str, str]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        member_id = _coerce_string(entry.get("id") or entry.get("user_id") or entry.get("member_id") or entry.get("userId"))
        if not member_id:
            continue
        member: dict[str, str] = {"id": member_id}
        username = _coerce_string(entry.get("username") or entry.get("name"))
        email = _coerce_string(entry.get("email") or entry.get("user_email"))
        if username:
            member["username"] = username
        if email:
            member["email"] = email
        members.append(member)
    return members[:limit], len(members) > limit


def _normalize_task_sample(task: dict[str, Any], assignee_limit: int = 5) -> dict[str, Any] | None:
    task_id = _coerce_string(task.get("id") or task.get("task_id"))
    if not task_id:
        return None
    status, status_type = _extract_status(task)
    assignees, assignees_truncated = _extract_assignees(task, assignee_limit)
    parent_id = _coerce_string(task.get("parent"))
    due_date = _to_epoch_ms(task.get("due_date") or task.get("dueDate"))
    subtask_entries = task.get("subtasks") if isinstance(task.get("subtasks"), list) else []
    subtask_count_raw = task.get("subtask_count") or task.get("subtaskCount")
    subtask_count = len(subtask_entries)
    if subtask_count == 0:
        parsed_subtask_count = _parse_non_negative_int(subtask_count_raw)
        if parsed_subtask_count is not None:
            subtask_count = parsed_subtask_count
    result: dict[str, Any] = {
        "id": task_id,
        "name": _coerce_string(task.get("name")),
        "status": status,
        "statusType": status_type,
        "priority": _extract_priority(task),
        "dueDate": datetime.fromtimestamp(due_date / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        if due_date
        else None,
        "url": _coerce_string(task.get("url")) or f"https://app.clickup.com/t/{task_id}",
        "assignees": assignees,
        "assigneesTruncated": assignees_truncated,
        "tags": _extract_tags(task),
        "isSubtask": bool(parent_id),
        "parentId": parent_id,
        "hasSubtasks": subtask_count > 0 if subtask_count else None,
        "subtaskCount": subtask_count or None,
    }
    return result


def _task_timestamp_iso(value: Any) -> str | None:
    epoch_ms = _to_epoch_ms(value)
    if not epoch_ms:
        return None
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _time_entries_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        entries = payload.get("data")
        if not isinstance(entries, list):
            entries = payload.get("entries")
        if isinstance(entries, list):
            return [entry for entry in entries if isinstance(entry, dict)]
    if isinstance(payload, list):
        return [entry for entry in payload if isinstance(entry, dict)]
    return []


def _time_entry_duration_ms(entry: dict[str, Any]) -> int:
    raw = entry.get("duration") or entry.get("duration_ms")
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def _time_entry_task_id(entry: dict[str, Any]) -> str | None:
    task = entry.get("task")
    if isinstance(task, dict):
        task_id = _coerce_string(task.get("id") or task.get("task_id"))
        if task_id:
            return task_id
    return _coerce_string(entry.get("task_id") or entry.get("taskId"))


def _view_status_values(values: Any) -> list[str]:
    results: list[str] = []
    if not isinstance(values, list):
        return results
    for entry in values:
        if isinstance(entry, str):
            token = entry.strip()
            if token:
                results.append(token)
            continue
        if isinstance(entry, dict):
            token = _coerce_string(entry.get("status") or entry.get("name"))
            if token:
                results.append(token)
    return results


def _coerce_page_content(page: dict[str, Any]) -> str:
    candidates = (
        page.get("content"),
        page.get("markdown"),
        page.get("html"),
        page.get("body"),
        page.get("text"),
        page.get("description"),
        page.get("rich_text"),
        (page.get("page") or {}).get("content") if isinstance(page.get("page"), dict) else None,
        (page.get("data") or {}).get("content") if isinstance(page.get("data"), dict) else None,
    )
    for candidate in candidates:
        if isinstance(candidate, str):
            text = candidate.strip()
            if text:
                return text
        if isinstance(candidate, dict):
            for nested_key in ("markdown", "text", "content", "body"):
                nested = candidate.get(nested_key)
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
    return ""


def _build_preview(content: str, limit: int) -> dict[str, Any]:
    safe_limit = max(1, limit)
    if len(content) <= safe_limit:
        return {"preview": content, "truncated": False}
    return {"preview": content[:safe_limit], "truncated": True}


def _is_official_reference_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != "developer.clickup.com":
        return False
    path = parsed.path or ""
    if path == "/llms.txt":
        return True
    return bool(re.fullmatch(r"/(?:docs|reference)/[^?#]+\.md", path))


def _parse_reference_index(body: str) -> list[dict[str, Any]]:
    normalized = re.sub(r"\s+##\s+", "\n## ", body.strip())
    section = "Uncategorized"
    links: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _collect_from_segment(segment: str, current_section: str) -> None:
        pattern = re.compile(
            r"-\s+\[([^\]]+)\]\((https://developer\.clickup\.com/(?:docs|reference)/[^)\s]+\.md)\)"
            r"(?::\s*(.*?))?(?=\s+-\s+\[|$)"
        )
        for match in pattern.finditer(segment):
            url = match.group(2).strip()
            if url in seen:
                continue
            seen.add(url)
            description = re.sub(r"\s+", " ", (match.group(3) or "")).strip(" -")
            payload = {"label": match.group(1).strip(), "url": url, "section": current_section}
            if description:
                payload["description"] = description
            links.append(payload)

    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("## "):
            match = re.match(r"^##\s+(.+?)(?=\s+-\s+\[|$)", line)
            if match:
                section = match.group(1).strip()
                remainder = line[match.end() :].strip()
                if remainder:
                    _collect_from_segment(remainder, section)
                continue
        _collect_from_segment(line, section)

    return links


def _workspace_docs_available(client: ClickUpClient, workspace_id: str) -> bool:
    try:
        client.request_v3(f"workspaces/{workspace_id}/docs", params={"limit": 1})
    except Exception:
        return False
    return True


@dataclass
class WriteAccessConfig:
    mode: str = "write"
    allowed_spaces: set[str] = field(default_factory=set)
    allowed_lists: set[str] = field(default_factory=set)


@dataclass
class RuntimeConfig:
    team_id: str
    char_limit: int = DEFAULT_CHAR_LIMIT
    max_attachment_mb: int = DEFAULT_ATTACHMENT_LIMIT_MB
    write_access: WriteAccessConfig = field(default_factory=WriteAccessConfig)
    hierarchy_cache_ttl_ms: int = DEFAULT_CACHE_TTL_MS
    space_config_cache_ttl_ms: int = DEFAULT_CACHE_TTL_MS
    reporting_max_tasks: int = DEFAULT_REPORTING_MAX_TASKS
    default_risk_window_days: int = DEFAULT_RISK_WINDOW_DAYS


class StaticApiKeyVerifier(TokenVerifier):
    def __init__(self, api_keys: Iterable[str], base_url: str | None = None) -> None:
        super().__init__(base_url=base_url or None)
        self._api_keys = [key for key in api_keys if key]

    async def verify_token(self, token: str) -> AccessToken | None:
        for key in self._api_keys:
            if secrets.compare_digest(token, key):
                return AccessToken(token=token, client_id="clickup-mcp", scopes=[])
        return None


class ClickUpClient:
    def __init__(self, token: str, timeout_ms: int = 30000) -> None:
        self._token = token.strip()
        self._timeout = timeout_ms / 1000
        self._session = requests.Session()
        self._session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})
        if self._token:
            self._session.headers["Authorization"] = self._token

    def _request(
        self,
        path: str,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
        use_v3: bool = False,
        files: dict[str, Any] | None = None,
    ) -> Any:
        if not self._token:
            raise ValueError("CLICKUP_API_TOKEN (or apiKey/API_KEY) is required")
        url = (BASE_V3 if use_v3 else BASE_V2) + path.lstrip("/")
        clean_params: dict[str, Any] = {}
        for k, v in (params or {}).items():
            if v is None:
                continue
            clean_params[k] = v

        for attempt in range(4):
            if files is not None:
                response = requests.request(
                    method,
                    url,
                    params=clean_params,
                    data=body,
                    files=files,
                    headers={"Accept": "application/json", "Authorization": self._token},
                    timeout=self._timeout,
                )
            else:
                response = self._session.request(
                    method,
                    url,
                    params=clean_params,
                    json=body,
                    files=files,
                    timeout=self._timeout,
                )
            if response.status_code in RETRY_STATUS and attempt < 3:
                time.sleep((2**attempt) * 0.25)
                continue
            if not response.ok:
                detail = response.text
                raise RuntimeError(f"ClickUp {response.status_code}: {detail}")
            if response.status_code == 204:
                return None
            ctype = response.headers.get("content-type", "")
            if "application/json" in ctype:
                return response.json()
            return response.text
        raise RuntimeError("Unexpected ClickUp retry state")

    def request(self, path: str, **kwargs: Any) -> Any:
        return self._request(path, **kwargs)

    def request_v3(self, path: str, **kwargs: Any) -> Any:
        kwargs["use_v3"] = True
        return self._request(path, **kwargs)


def _repo_root() -> Path:
    return Path(__file__).resolve().parent


def _load_manifest() -> list[dict[str, Any]]:
    path = _repo_root() / "tool_manifest_clickup.json"
    if path.exists():
        manifest_text = path.read_text(encoding="utf-8")
    else:
        from importlib.resources import files

        manifest_text = files("clickup_mcp_data").joinpath("tool_manifest_clickup.json").read_text(encoding="utf-8")
    data = json.loads(manifest_text)
    tools = data.get("tools")
    if not isinstance(tools, list):
        raise RuntimeError("tool_manifest_clickup.json is invalid")
    return tools


def _load_api_keys() -> list[str]:
    api_key_mode = _runtime_env("API_KEY_MODE", default="").strip().lower()
    if api_key_mode == "disabled":
        return []
    keys: list[str] = []
    service_key = _runtime_env("CLICKUP_MCP_API_KEY")
    if service_key:
        keys.append(service_key)
    single = _runtime_env("MCP_API_KEY")
    if single:
        keys.append(single)
    multi = _runtime_env("MCP_API_KEYS")
    if multi:
        keys.extend([x.strip() for x in multi.split(",") if x.strip()])
    return list(dict.fromkeys(keys))


def _clickup_token() -> str:
    return _runtime_env("CLICKUP_API_TOKEN", "clickupApiToken", "apiKey", "API_KEY")


def _team_id(default: str | None = None) -> str:
    return (
        (default or "").strip()
        or _runtime_env(
            "TEAM_ID",
            "CLICKUP_TEAM_ID",
            "teamId",
            "DEFAULT_TEAM_ID",
            "defaultTeamId",
        )
    )


def _resolve_runtime_config() -> RuntimeConfig:
    configured_mode = _runtime_env("WRITE_MODE", "writeMode", default="").strip().lower()
    if configured_mode not in WRITE_MODES:
        configured_mode = ""

    read_only = None
    for key in ("READ_ONLY_MODE", "readOnlyMode", "READ_ONLY", "readOnly"):
        parsed = _parse_bool_flag(os.getenv(key))
        if parsed is not None:
            read_only = parsed
            break

    selective_write = None
    for key in ("SELECTIVE_WRITE", "selectiveWrite"):
        parsed = _parse_bool_flag(os.getenv(key))
        if parsed is not None:
            selective_write = parsed
            break

    write_spaces = _parse_id_list(
        _runtime_env("WRITE_ALLOWED_SPACES", "writeAllowedSpaces", "WRITE_SPACES", "writeSpaces")
    )
    write_lists = _parse_id_list(
        _runtime_env("WRITE_ALLOWED_LISTS", "writeAllowedLists", "WRITE_LISTS", "writeLists")
    )

    if read_only is True:
        write_mode = "read"
    elif selective_write is True:
        write_mode = "selective"
    elif selective_write is False:
        write_mode = "write"
    elif configured_mode:
        write_mode = configured_mode
    else:
        write_mode = "selective" if write_spaces or write_lists else "write"

    hierarchy_cache_ms = _parse_non_negative_int(os.getenv("HIERARCHY_CACHE_TTL_MS"))
    if hierarchy_cache_ms is None:
        hierarchy_cache_seconds = _parse_non_negative_int(os.getenv("HIERARCHY_CACHE_TTL_SECONDS"))
        hierarchy_cache_ms = (hierarchy_cache_seconds * 1000) if hierarchy_cache_seconds is not None else DEFAULT_CACHE_TTL_MS

    space_config_cache_ms = _parse_non_negative_int(os.getenv("SPACE_CONFIG_CACHE_TTL_MS"))
    if space_config_cache_ms is None:
        space_config_cache_seconds = _parse_non_negative_int(os.getenv("SPACE_CONFIG_CACHE_TTL_SECONDS"))
        space_config_cache_ms = (space_config_cache_seconds * 1000) if space_config_cache_seconds is not None else DEFAULT_CACHE_TTL_MS

    return RuntimeConfig(
        team_id=_team_id(),
        char_limit=_parse_positive_int(_runtime_env("CHAR_LIMIT", "charLimit")) or DEFAULT_CHAR_LIMIT,
        max_attachment_mb=_parse_positive_int(_runtime_env("MAX_ATTACHMENT_MB", "maxAttachmentMb")) or DEFAULT_ATTACHMENT_LIMIT_MB,
        write_access=WriteAccessConfig(
            mode=write_mode,
            allowed_spaces=set(write_spaces),
            allowed_lists=set(write_lists),
        ),
        hierarchy_cache_ttl_ms=hierarchy_cache_ms,
        space_config_cache_ttl_ms=space_config_cache_ms,
        reporting_max_tasks=_parse_positive_int(_runtime_env("REPORTING_MAX_TASKS", "reportingMaxTasks")) or DEFAULT_REPORTING_MAX_TASKS,
        default_risk_window_days=_parse_positive_int(_runtime_env("DEFAULT_RISK_WINDOW_DAYS", "defaultRiskWindowDays")) or DEFAULT_RISK_WINDOW_DAYS,
    )


def _confirm_required(args: dict[str, Any]) -> None:
    if args.get("dryRun"):
        return
    confirm = args.get("confirm")
    if confirm in (True, "yes", "true", "TRUE", "YES"):
        return
    raise ValueError("Destructive operation requires confirm='yes' or dryRun=true")


def _to_epoch_ms(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        if value.isdigit():
            return int(value)
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            return None
    return None


class ClickUpRuntime:
    def __init__(self, client: ClickUpClient, manifest: list[dict[str, Any]], config: RuntimeConfig) -> None:
        self._client = client
        self._manifest = manifest
        self._config = config
        self._cache: dict[str, tuple[float, Any]] = {}

    def _workspace_id(self, args: dict[str, Any]) -> str:
        wid = str(args.get("workspaceId") or args.get("teamId") or self._config.team_id).strip()
        if not wid:
            raise ValueError("workspace/team id is required")
        return wid

    def _cached_value(self, key: str, ttl_ms: int, loader: Callable[[], Any]) -> Any:
        if ttl_ms <= 0:
            return loader()
        cached = self._cache.get(key)
        now = time.time()
        if cached and cached[0] > now:
            return cached[1]
        value = loader()
        self._cache[key] = (now + (ttl_ms / 1000), value)
        return value

    def _team_spaces(self, workspace_id: str) -> list[dict[str, Any]]:
        data = self._cached_value(
            f"team:{workspace_id}:spaces",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request(f"team/{workspace_id}/space"),
        )
        return data.get("spaces", []) if isinstance(data, dict) else []

    def _workspace_catalogue(self) -> list[dict[str, Any]]:
        data = self._cached_value(
            "team:list",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request("team"),
        )
        teams = data.get("teams", []) if isinstance(data, dict) else []
        return [team for team in teams if isinstance(team, dict)]

    def _team_members(self, workspace_id: str) -> list[dict[str, Any]]:
        data = self._cached_value(
            f"team:{workspace_id}:members",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request(f"team/{workspace_id}"),
        )
        if not isinstance(data, dict):
            return []
        team = data.get("team") if isinstance(data.get("team"), dict) else data
        raw_members = team.get("members", []) if isinstance(team, dict) else []
        if not isinstance(raw_members, list):
            return []

        members: list[dict[str, Any]] = []
        for entry in raw_members:
            if not isinstance(entry, dict):
                continue
            member = entry.get("user") if isinstance(entry.get("user"), dict) else entry
            if not isinstance(member, dict):
                continue
            member_id = _coerce_string(member.get("id") or member.get("user_id") or member.get("member_id"))
            if not member_id:
                continue
            normalized: dict[str, Any] = {"id": member_id}
            username = _coerce_string(member.get("username") or member.get("name"))
            email = _coerce_string(member.get("email") or member.get("user_email"))
            if username:
                normalized["username"] = username
            if email:
                normalized["email"] = email
            members.append(normalized)
        return members

    def _space_folders(self, space_id: str) -> list[dict[str, Any]]:
        data = self._cached_value(
            f"space:{space_id}:folders",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request(f"space/{space_id}/folder"),
        )
        return data.get("folders", []) if isinstance(data, dict) else []

    def _space_lists(self, space_id: str) -> list[dict[str, Any]]:
        data = self._cached_value(
            f"space:{space_id}:lists",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request(f"space/{space_id}/list"),
        )
        return data.get("lists", []) if isinstance(data, dict) else []

    def _folder_lists(self, folder_id: str) -> list[dict[str, Any]]:
        data = self._cached_value(
            f"folder:{folder_id}:lists",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request(f"folder/{folder_id}/list"),
        )
        return data.get("lists", []) if isinstance(data, dict) else []

    def _workspace_hierarchy_targets(self, args: dict[str, Any]) -> list[dict[str, Any]]:
        requested_ids = _parse_id_list(args.get("workspaceIds"))
        requested_names = [str(name).strip().lower() for name in (args.get("workspaceNames") or []) if str(name).strip()]
        requested_workspaces = args.get("workspaces") if isinstance(args.get("workspaces"), list) else []

        catalogue: list[dict[str, Any]] | None = None

        def ensure_catalogue() -> list[dict[str, Any]]:
            nonlocal catalogue
            if catalogue is None:
                catalogue = self._workspace_catalogue()
            return catalogue

        targets: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for workspace_id in requested_ids:
            if workspace_id in seen_ids:
                continue
            match = next((entry for entry in ensure_catalogue() if _coerce_string(entry.get("id")) == workspace_id), None)
            targets.append(match or {"id": workspace_id})
            seen_ids.add(workspace_id)

        for workspace_name in requested_names:
            match = next(
                (
                    entry
                    for entry in ensure_catalogue()
                    if str(entry.get("name") or "").strip().lower() == workspace_name
                ),
                None,
            )
            if not match:
                continue
            workspace_id = _coerce_string(match.get("id"))
            if not workspace_id or workspace_id in seen_ids:
                continue
            targets.append(match)
            seen_ids.add(workspace_id)

        for entry in requested_workspaces:
            if not isinstance(entry, dict):
                continue
            workspace_id = _coerce_string(entry.get("id"))
            workspace_name = _coerce_string(entry.get("name"))
            if workspace_id and workspace_id in seen_ids:
                continue
            if not workspace_id and workspace_name:
                match = next(
                    (
                        item
                        for item in ensure_catalogue()
                        if str(item.get("name") or "").strip().lower() == workspace_name.lower()
                    ),
                    None,
                )
                if match:
                    workspace_id = _coerce_string(match.get("id"))
                    entry = match
            if workspace_id:
                seen_ids.add(workspace_id)
                targets.append(dict(entry))

        if not targets:
            default_id = self._workspace_id(args)
            match = next((entry for entry in ensure_catalogue() if _coerce_string(entry.get("id")) == default_id), None)
            targets.append(match or {"id": default_id})

        max_workspaces = _parse_positive_int(args.get("maxWorkspaces"))
        if max_workspaces:
            targets = targets[:max_workspaces]
        return targets

    def _workspace_hierarchy_entry(self, workspace: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
        workspace_id = _coerce_string(workspace.get("id"))
        if not workspace_id:
            raise ValueError("workspace_hierarchy requires a workspace id")
        max_depth = _parse_non_negative_int(args.get("maxDepth"))
        if max_depth is None:
            max_depth = 3

        spaces = self._team_spaces(workspace_id)
        if max_depth <= 0:
            hierarchy: list[dict[str, Any]] = []
        else:
            hierarchy = []
            for space in spaces[: int(args.get("maxSpacesPerWorkspace") or len(spaces))]:
                entry = {"space": space, "folders": [], "lists": []}
                sid = str(space.get("id"))
                if max_depth >= 2:
                    folders = self._space_folders(sid)
                    for folder in folders[: int(args.get("maxFoldersPerSpace") or len(folders))]:
                        folder_entry = {"folder": folder, "lists": []}
                        if max_depth >= 3:
                            fid = str(folder.get("id"))
                            flists = self._folder_lists(fid)
                            folder_entry["lists"] = flists[: int(args.get("maxListsPerFolder") or len(flists))]
                        entry["folders"].append(folder_entry)
                    slists = self._space_lists(sid)
                    entry["lists"] = slists[: int(args.get("maxListsPerSpace") or len(slists))]
                hierarchy.append(entry)

        return {
            "workspaceId": workspace_id,
            "workspaceName": _coerce_string(workspace.get("name")),
            "hierarchy": hierarchy,
        }

    def _resolve_path(self, path: list[str]) -> dict[str, Any]:
        if not path:
            raise ValueError("path must include at least a workspace name")
        workspaces = self._cached_value(
            "team:list",
            self._config.hierarchy_cache_ttl_ms,
            lambda: self._client.request("team"),
        ).get("teams", [])
        ws = next((x for x in workspaces if str(x.get("name", "")).lower() == str(path[0]).lower()), None)
        if not ws:
            raise ValueError(f"Workspace '{path[0]}' not found")
        result: dict[str, Any] = {"workspaceId": str(ws.get("id")), "workspaceName": ws.get("name")}
        if len(path) == 1:
            return result

        spaces = self._team_spaces(result["workspaceId"])
        space = next((x for x in spaces if str(x.get("name", "")).lower() == str(path[1]).lower()), None)
        if not space:
            raise ValueError(f"Space '{path[1]}' not found")
        result["spaceId"] = str(space.get("id"))
        result["spaceName"] = space.get("name")
        if len(path) == 2:
            return result

        folders = self._space_folders(result["spaceId"])
        folder = next((x for x in folders if str(x.get("name", "")).lower() == str(path[2]).lower()), None)
        if folder:
            result["folderId"] = str(folder.get("id"))
            result["folderName"] = folder.get("name")
            if len(path) == 3:
                return result
            lists = self._folder_lists(result["folderId"])
            lst = next((x for x in lists if str(x.get("name", "")).lower() == str(path[3]).lower()), None)
            if lst:
                result["listId"] = str(lst.get("id"))
                result["listName"] = lst.get("name")
                return result
            raise ValueError(f"List '{path[3]}' not found")

        lists = self._space_lists(result["spaceId"])
        lst = next((x for x in lists if str(x.get("name", "")).lower() == str(path[2]).lower()), None)
        if lst:
            result["listId"] = str(lst.get("id"))
            result["listName"] = lst.get("name")
            return result
        raise ValueError(f"Folder/List '{path[2]}' not found")

    async def _apply_path_defaults(self, args: dict[str, Any]) -> dict[str, Any]:
        path = args.get("path")
        if not isinstance(path, list) or not path:
            return args
        resolved = self._resolve_path([str(segment) for segment in path])
        merged = dict(args)
        for key in ("workspaceId", "spaceId", "folderId", "listId"):
            if not merged.get(key) and resolved.get(key):
                merged[key] = resolved[key]
        if not merged.get("teamId") and resolved.get("workspaceId"):
            merged["teamId"] = resolved["workspaceId"]
        return merged

    def _task_id(self, args: dict[str, Any]) -> str:
        tid = str(args.get("taskId") or "").strip()
        if tid:
            return tid
        task_name = str(args.get("taskName") or "").strip()
        if not task_name:
            raise ValueError("taskId or taskName required")
        context = args.get("context") or {}
        for item in context.get("tasks", []) if isinstance(context, dict) else []:
            if str(item.get("name", "")).lower() == task_name.lower() and item.get("id"):
                return str(item["id"])
        raise ValueError("Unable to resolve taskName from context; provide taskId")

    def _upload_from_data_uri(self, data_uri: str) -> tuple[bytes, str]:
        match = re.match(r"^data:([^;]+);base64,(.+)$", data_uri)
        if not match:
            raise ValueError("Invalid dataUri")
        mime = match.group(1)
        raw = base64.b64decode(match.group(2))
        max_bytes = self._config.max_attachment_mb * 1024 * 1024
        if len(raw) > max_bytes:
            raise ValueError(
                f"Attachment exceeds configured MAX_ATTACHMENT_MB={self._config.max_attachment_mb}"
            )
        return raw, mime

    async def _resolve_task_context(self, task_id: str) -> tuple[set[str], set[str]]:
        list_ids: set[str] = set()
        space_ids: set[str] = set()
        task = self._client.request(f"task/{task_id}")
        if not isinstance(task, dict):
            return list_ids, space_ids
        list_id = _coerce_string(((task.get("task") or {}).get("list") or {}).get("id"))
        if not list_id:
            list_id = _coerce_string((task.get("list") or {}).get("id"))
        if list_id:
            list_ids.add(list_id)
        space_id = _coerce_string(((task.get("task") or {}).get("space") or {}).get("id"))
        if not space_id:
            space_id = _coerce_string(task.get("team_id"))
        if not space_id:
            space_id = _coerce_string((task.get("space") or {}).get("id"))
        if space_id:
            space_ids.add(space_id)
        return list_ids, space_ids

    async def _resolve_list_spaces(self, list_ids: set[str]) -> tuple[set[str], dict[str, str]]:
        space_ids: set[str] = set()
        list_to_space: dict[str, str] = {}
        for list_id in list_ids:
            try:
                data = self._client.request(f"list/{list_id}")
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            direct_space = _coerce_string(data.get("space_id") or data.get("spaceId") or data.get("team_id"))
            nested_space = _coerce_string((data.get("space") or {}).get("id")) if isinstance(data.get("space"), dict) else None
            folder_space = _coerce_string((data.get("folder") or {}).get("space_id")) if isinstance(data.get("folder"), dict) else None
            space_id = direct_space or nested_space or folder_space
            if space_id:
                list_to_space[list_id] = space_id
                space_ids.add(space_id)
        return space_ids, list_to_space

    async def _resolve_doc_context(self, doc_id: str, workspace_id: str) -> tuple[set[str], set[str]]:
        list_ids: set[str] = set()
        space_ids: set[str] = set()
        try:
            data = self._client.request_v3(f"workspaces/{workspace_id}/docs/{doc_id}")
        except Exception:
            return list_ids, space_ids
        if not isinstance(data, dict):
            return list_ids, space_ids
        space_id = _coerce_string(
            data.get("space_id")
            or data.get("spaceId")
            or data.get("team_id")
            or data.get("workspace_id")
            or ((data.get("space") or {}).get("id") if isinstance(data.get("space"), dict) else None)
        )
        list_id = _coerce_string(
            data.get("list_id")
            or ((data.get("list") or {}).get("id") if isinstance(data.get("list"), dict) else None)
        )
        if space_id:
            space_ids.add(space_id)
        if list_id:
            list_ids.add(list_id)
        return list_ids, space_ids

    async def _ensure_write_allowed(self, args: dict[str, Any]) -> None:
        access = self._config.write_access
        if access.mode == "write":
            return
        if access.mode == "read":
            raise ValueError("Write operations are disabled in read mode.")

        space_ids = _collect_ids(args, {"spaceId", "spaceIds", "space_id", "space_ids", "workspaceId", "workspaceIds", "workspace_id", "workspace_ids", "teamId", "teamIds", "team_id", "team_ids"})
        list_ids = _collect_ids(args, {"listId", "listIds", "list_id", "list_ids"})

        if not space_ids and not list_ids:
            task_ids = _collect_ids(args, {"taskId", "taskIds", "task_id", "task_ids", "parentTaskId", "parent_task_id"})
            for task_id in list(task_ids)[:5]:
                derived_lists, derived_spaces = await self._resolve_task_context(task_id)
                list_ids.update(derived_lists)
                space_ids.update(derived_spaces)

        if not space_ids and not list_ids:
            workspace_id = self._workspace_id(args)
            doc_ids = _collect_ids(args, {"docId", "docIds", "doc_id", "doc_ids", "documentId", "document_id"})
            for doc_id in list(doc_ids)[:5]:
                derived_lists, derived_spaces = await self._resolve_doc_context(doc_id, workspace_id)
                list_ids.update(derived_lists)
                space_ids.update(derived_spaces)

        if not space_ids and not list_ids:
            raise ValueError(
                "Write operations are restricted to explicitly allowed spaces or lists. Include a spaceId or listId to proceed."
            )

        forbidden_spaces = [space_id for space_id in space_ids if space_id not in access.allowed_spaces]
        if forbidden_spaces:
            raise ValueError(
                f"Write operations are not allowed for the following spaces/teams: {', '.join(sorted(forbidden_spaces))}"
            )

        lists_to_check = {list_id for list_id in list_ids if list_id not in access.allowed_lists}
        if not lists_to_check:
            return

        _, list_to_space = await self._resolve_list_spaces(lists_to_check)
        forbidden_lists = [
            list_id
            for list_id in sorted(lists_to_check)
            if not list_to_space.get(list_id) or list_to_space[list_id] not in access.allowed_spaces
        ]
        if forbidden_lists:
            raise ValueError(
                f"Write operations are not allowed for the following lists: {', '.join(forbidden_lists)}"
            )

    def _container_scope(self, args: dict[str, Any]) -> dict[str, Any]:
        container = {
            "workspaceId": args.get("workspaceId") or args.get("teamId") or self._config.team_id or None,
            "spaceId": args.get("spaceId"),
            "folderId": args.get("folderId"),
            "listId": args.get("listId"),
            "path": args.get("path") if isinstance(args.get("path"), list) else None,
        }
        return container

    def _search_params(
        self,
        args: dict[str, Any],
        *,
        page: int,
        page_size: int,
        order_by: str,
        reverse: bool,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "page": page,
            "page_size": page_size,
            "order_by": order_by,
            "reverse": reverse,
        }
        if args.get("query"):
            params["query"] = args.get("query")
        if args.get("includeClosed") is not None:
            params["include_closed"] = bool(args.get("includeClosed"))
        if args.get("includeSubtasks") is not None:
            params["subtasks"] = bool(args.get("includeSubtasks"))
        elif order_by in {"updated", "due_date"}:
            params["subtasks"] = True
        if args.get("includeTasksInMultipleLists") is not None:
            params["include_timl"] = bool(args.get("includeTasksInMultipleLists"))
        elif order_by in {"updated", "due_date"}:
            params["include_timl"] = True

        list_ids = _parse_id_list(args.get("listIds")) or _parse_id_list(args.get("listId"))
        if list_ids:
            params["list_ids[]"] = list_ids
        folder_ids = _parse_id_list(args.get("folderIds")) or _parse_id_list(args.get("folderId"))
        if folder_ids:
            params["project_ids[]"] = folder_ids
        space_ids = _parse_id_list(args.get("spaceIds")) or _parse_id_list(args.get("spaceId"))
        if space_ids:
            params["space_ids[]"] = space_ids
        assignees = _parse_id_list(args.get("assignees")) or _parse_id_list(args.get("assigneeIds"))
        if assignees:
            params["assignees[]"] = assignees
        tags = _parse_id_list(args.get("tags")) or _parse_id_list(args.get("tagIds"))
        if tags:
            params["tags[]"] = tags
        statuses = _parse_id_list(args.get("statusFilter")) or _parse_id_list(args.get("statuses"))
        if args.get("status"):
            statuses = [str(args["status"]).strip()]
        if statuses:
            params["statuses"] = statuses
        return params

    def _fetch_search_page(self, team_id: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        data = self._client.request(f"team/{team_id}/task", params=params)
        if not isinstance(data, dict):
            return []
        tasks = data.get("tasks")
        return tasks if isinstance(tasks, list) else []

    def _status_report(self, args: dict[str, Any]) -> dict[str, Any]:
        limit = max(1, self._config.reporting_max_tasks)
        page_size = min(limit, 100)
        team_id = self._workspace_id(args)
        tasks: list[dict[str, Any]] = []
        truncated = False
        page = 0
        while len(tasks) < limit:
            params = self._search_params(args, page=page, page_size=min(page_size, limit - len(tasks)), order_by="updated", reverse=True)
            page_tasks = self._fetch_search_page(team_id, params)
            tasks.extend(page_tasks)
            if len(page_tasks) < page_size:
                break
            page += 1
            if len(tasks) >= limit:
                truncated = True
                break
        if len(tasks) > limit:
            tasks = tasks[:limit]
            truncated = True

        due_within_days = _parse_positive_int(args.get("dueWithinDays"))
        mapped = [sample for sample in (_normalize_task_sample(task) for task in tasks) if sample]
        if due_within_days:
            now_ms = int(time.time() * 1000)
            window_ms = due_within_days * 24 * 60 * 60 * 1000
            mapped = [
                sample
                for sample in mapped
                if sample.get("dueDate")
                and now_ms
                <= int(datetime.fromisoformat(str(sample["dueDate"]).replace("Z", "+00:00")).timestamp() * 1000)
                <= now_ms + window_ms
            ]

        status_counts: dict[str, int] = {}
        priority_counts: dict[str, int] = {}
        status_samples: dict[str, list[dict[str, Any]]] = {}
        priority_samples: dict[str, list[dict[str, Any]]] = {}
        sample_limit = 3
        for sample in mapped:
            status_key = sample.get("status") or "unknown"
            priority_key = sample.get("priority") or "none"
            status_counts[status_key] = status_counts.get(status_key, 0) + 1
            priority_counts[priority_key] = priority_counts.get(priority_key, 0) + 1
            status_samples.setdefault(status_key, [])
            if len(status_samples[status_key]) < sample_limit:
                status_samples[status_key].append(sample)
            priority_samples.setdefault(priority_key, [])
            if len(priority_samples[priority_key]) < sample_limit:
                priority_samples[priority_key].append(sample)

        result: dict[str, Any] = {
            "container": self._container_scope(args),
            "totals": {"inspected": len(mapped), "limit": limit, "truncated": truncated},
            "statusCounts": status_counts,
            "priorityCounts": priority_counts,
            "samples": {
                "byStatus": [
                    {"status": status, "count": count, "samples": status_samples.get(status, []), "samplesTruncated": False}
                    for status, count in status_counts.items()
                ],
                "byPriority": [
                    {"priority": priority, "count": count, "samples": priority_samples.get(priority, []), "samplesTruncated": False}
                    for priority, count in priority_counts.items()
                ],
            },
            "filters": {
                "includeClosed": bool(args.get("includeClosed")),
                "includeSubtasks": args.get("includeSubtasks") is not False,
                "includeTasksInMultipleLists": args.get("includeTasksInMultipleLists") is not False,
                "tags": _parse_id_list(args.get("tags")),
                "assignees": _parse_id_list(args.get("assignees")),
                "statusFilter": _parse_id_list(args.get("statusFilter")),
                "dueWithinDays": due_within_days,
            },
            "truncated": False,
            "guidance": "Subtasks were included; check isSubtask and parentId flags before assuming hierarchy."
            if args.get("includeSubtasks") is not False
            else "Subtasks were excluded from this summary; enable includeSubtasks to incorporate child tasks.",
        }
        initial = json.dumps(result)
        if len(initial) <= self._config.char_limit:
            return result
        trimmed = dict(result)
        trimmed["samples"] = {"byStatus": [], "byPriority": []}
        trimmed["truncated"] = True
        if len(json.dumps(trimmed)) <= self._config.char_limit:
            return trimmed
        trimmed["statusCounts"] = {}
        trimmed["priorityCounts"] = {}
        return trimmed

    def _risk_report(self, args: dict[str, Any]) -> dict[str, Any]:
        limit = max(1, self._config.reporting_max_tasks)
        page_size = min(limit, 100)
        team_id = self._workspace_id(args)
        tasks: list[dict[str, Any]] = []
        truncated = False
        page = 0
        while len(tasks) < limit:
            params = self._search_params(args, page=page, page_size=min(page_size, limit - len(tasks)), order_by="due_date", reverse=False)
            page_tasks = self._fetch_search_page(team_id, params)
            tasks.extend(page_tasks)
            if len(page_tasks) < page_size:
                break
            page += 1
            if len(tasks) >= limit:
                truncated = True
                break
        if len(tasks) > limit:
            tasks = tasks[:limit]
            truncated = True

        mapped = [sample for sample in (_normalize_task_sample(task) for task in tasks) if sample]
        now_ms = int(time.time() * 1000)
        window_days = _parse_positive_int(args.get("dueWithinDays")) or self._config.default_risk_window_days
        window_ms = window_days * 24 * 60 * 60 * 1000
        overdue_total = 0
        at_risk_total = 0
        overdue_by_severity: dict[str, int] = {}
        overdue_by_assignee: dict[str, dict[str, Any]] = {}
        at_risk_by_assignee: dict[str, dict[str, Any]] = {}
        at_risk_by_priority: dict[str, int] = {}
        samples: list[dict[str, Any]] = []
        sample_limit = 10

        for sample in mapped:
            if not sample.get("dueDate"):
                continue
            if not args.get("includeClosed") and _is_closed_status(sample.get("status"), sample.get("statusType")):
                continue
            due_ms = int(datetime.fromisoformat(str(sample["dueDate"]).replace("Z", "+00:00")).timestamp() * 1000)
            assignee_labels = [
                member.get("username") or member.get("email") or member.get("id") or "unassigned"
                for member in sample.get("assignees", [])
                if isinstance(member, dict)
            ] or ["unassigned"]
            primary_assignee = assignee_labels[0]
            if due_ms < now_ms:
                overdue_days = max(1, int((now_ms - due_ms + 86_399_999) / 86_400_000))
                bucket = _severity_bucket(overdue_days)
                overdue_by_severity[bucket] = overdue_by_severity.get(bucket, 0) + 1
                entry = overdue_by_assignee.setdefault(primary_assignee, {"assignee": primary_assignee, "count": 0, "maxOverdueDays": 0})
                entry["count"] += 1
                entry["maxOverdueDays"] = max(entry["maxOverdueDays"], overdue_days)
                overdue_total += 1
                if len(samples) < sample_limit:
                    sample_entry = dict(sample)
                    sample_entry["overdueDays"] = overdue_days
                    samples.append(sample_entry)
                continue
            if due_ms <= now_ms + window_ms:
                due_in_days = max(0, int((due_ms - now_ms + 86_399_999) / 86_400_000))
                entry = at_risk_by_assignee.setdefault(primary_assignee, {"assignee": primary_assignee, "count": 0, "nearestDueDays": due_in_days})
                entry["count"] += 1
                entry["nearestDueDays"] = min(entry["nearestDueDays"], due_in_days)
                priority_key = sample.get("priority") or "none"
                at_risk_by_priority[priority_key] = at_risk_by_priority.get(priority_key, 0) + 1
                at_risk_total += 1
                if len(samples) < sample_limit:
                    sample_entry = dict(sample)
                    sample_entry["dueInDays"] = due_in_days
                    samples.append(sample_entry)

        result: dict[str, Any] = {
            "container": self._container_scope(args),
            "totals": {"inspected": len(mapped), "limit": limit, "truncated": truncated},
            "overdue": {
                "total": overdue_total,
                "bySeverity": overdue_by_severity,
                "byAssignee": list(overdue_by_assignee.values()),
            },
            "atRisk": {
                "windowDays": window_days,
                "total": at_risk_total,
                "byAssignee": list(at_risk_by_assignee.values()),
                "byPriority": at_risk_by_priority,
            },
            "samples": {"tasks": samples, "truncated": len(samples) >= sample_limit},
            "filters": {
                "includeClosed": bool(args.get("includeClosed")),
                "includeSubtasks": args.get("includeSubtasks") is not False,
                "includeTasksInMultipleLists": args.get("includeTasksInMultipleLists") is not False,
                "tags": _parse_id_list(args.get("tags")),
                "assignees": _parse_id_list(args.get("assignees")),
                "statusFilter": _parse_id_list(args.get("statusFilter")),
                "dueWithinDays": window_days,
            },
            "truncated": False,
            "guidance": "Subtasks were included; use isSubtask/parentId to see hierarchy in risk samples."
            if args.get("includeSubtasks") is not False
            else "Subtasks were excluded from risk calculations; enable includeSubtasks to count child tasks.",
        }
        initial = json.dumps(result)
        if len(initial) <= self._config.char_limit:
            return result
        trimmed = dict(result)
        trimmed["samples"] = {"tasks": [], "truncated": True}
        trimmed["truncated"] = True
        if len(json.dumps(trimmed)) <= self._config.char_limit:
            return trimmed
        trimmed["overdue"] = {**trimmed["overdue"], "bySeverity": {}, "byAssignee": []}
        trimmed["atRisk"] = {**trimmed["atRisk"], "byAssignee": [], "byPriority": {}}
        return trimmed

    def _preview_limit(self, override: Any = None) -> int:
        parsed = _parse_positive_int(override)
        if parsed is None:
            return min(self._config.char_limit, DEFAULT_CHAR_LIMIT)
        return min(self._config.char_limit, parsed, DEFAULT_CHAR_LIMIT)

    def _page_with_preview(self, page: dict[str, Any], preview_limit: int) -> dict[str, Any]:
        preview = _build_preview(_coerce_page_content(page), preview_limit)
        payload = dict(page)
        payload["preview"] = preview["preview"]
        payload["previewTruncated"] = preview["truncated"]
        return payload

    def _document_summary(
        self,
        doc: dict[str, Any],
        page_metadata: list[dict[str, Any]],
        detailed_pages: list[dict[str, Any]],
        preview_limit: int,
    ) -> dict[str, Any]:
        page_map: dict[str, dict[str, Any]] = {}
        for entry in detailed_pages:
            page_id = _coerce_string(entry.get("id") or entry.get("page_id") or entry.get("pageId") or entry.get("uuid"))
            if page_id:
                page_map[page_id] = entry
        page_previews: list[dict[str, Any]] = []
        for entry in page_metadata:
            page_id = _coerce_string(entry.get("id") or entry.get("page_id") or entry.get("pageId") or entry.get("uuid"))
            if not page_id:
                continue
            source = page_map.get(page_id, entry)
            title = _coerce_string(source.get("title") or source.get("name") or source.get("page_name") or source.get("header"))
            preview = _build_preview(_coerce_page_content(source), preview_limit)
            page_previews.append(
                {
                    "pageId": page_id,
                    "title": title,
                    "preview": preview["preview"],
                    "truncated": preview["truncated"],
                }
            )
        workspace = doc.get("team") if isinstance(doc.get("team"), dict) else doc.get("workspace")
        space = doc.get("space") if isinstance(doc.get("space"), dict) else {}
        folder = doc.get("folder") if isinstance(doc.get("folder"), dict) else {}
        hierarchy = {
            "workspaceId": _coerce_string(doc.get("team_id") or doc.get("workspace_id") or ((workspace or {}).get("id") if isinstance(workspace, dict) else None)),
            "workspaceName": _coerce_string(doc.get("team_name") or doc.get("workspace_name") or ((workspace or {}).get("name") if isinstance(workspace, dict) else None)),
            "spaceId": _coerce_string(doc.get("space_id") or (space or {}).get("id")),
            "spaceName": _coerce_string(doc.get("space_name") or (space or {}).get("name")),
            "folderId": _coerce_string(doc.get("folder_id") or (folder or {}).get("id")),
            "folderName": _coerce_string(doc.get("folder_name") or (folder or {}).get("name")),
        }
        hierarchy["path"] = " > ".join(
            [segment for segment in (hierarchy["workspaceName"], hierarchy["spaceName"], hierarchy["folderName"], _coerce_string(doc.get("name") or doc.get("doc_name") or doc.get("title"))) if segment]
        ) or "Doc"
        return {
            "docId": _coerce_string(doc.get("id") or doc.get("doc_id") or doc.get("docId") or doc.get("uuid") or doc.get("document_id")),
            "name": _coerce_string(doc.get("name") or doc.get("doc_name") or doc.get("title") or doc.get("document_name")),
            "hierarchy": hierarchy,
            "pageCount": len(page_metadata) or _parse_non_negative_int(doc.get("page_count") or doc.get("pages_count") or doc.get("pageCount") or doc.get("total_pages")) or 0,
            "pagePreviews": page_previews,
            "truncated": any(preview["truncated"] for preview in page_previews),
        }

    def _doc_page_listing(self, workspace_id: str, doc_id: str) -> list[dict[str, Any]]:
        payload = self._client.request_v3(f"workspaces/{workspace_id}/docs/{doc_id}/page_listing")
        if isinstance(payload, list):
            return [page for page in payload if isinstance(page, dict)]
        pages = payload.get("pages", []) if isinstance(payload, dict) else []
        return [page for page in pages if isinstance(page, dict)]

    def _doc_pages(self, workspace_id: str, doc_id: str) -> list[dict[str, Any]]:
        payload = self._client.request_v3(f"workspaces/{workspace_id}/docs/{doc_id}/pages")
        if isinstance(payload, list):
            return [page for page in payload if isinstance(page, dict)]
        pages = payload.get("pages", []) if isinstance(payload, dict) else []
        return [page for page in pages if isinstance(page, dict)]

    def _doc_id(self, doc: dict[str, Any]) -> str | None:
        return _coerce_string(doc.get("id") or doc.get("doc_id") or doc.get("docId") or doc.get("uuid") or doc.get("document_id"))

    def _doc_with_summary(
        self,
        workspace_id: str,
        doc: dict[str, Any],
        *,
        include_previews: bool,
        preview_page_limit: int,
        preview_limit: int,
    ) -> dict[str, Any]:
        payload = dict(doc)
        page_metadata: list[dict[str, Any]] = []
        if include_previews:
            doc_id = self._doc_id(doc)
            if doc_id:
                page_metadata = self._doc_page_listing(workspace_id, doc_id)[:preview_page_limit]
        payload["summary"] = self._document_summary(payload, page_metadata, [], preview_limit)
        return payload

    def _task_write_body(self, source: dict[str, Any]) -> dict[str, Any]:
        return {
            key: value
            for key, value in {
                "name": source.get("name"),
                "description": source.get("description"),
                "status": source.get("status"),
                "priority": source.get("priority"),
                "assignees": source.get("assigneeIds"),
                "tags": source.get("tags"),
                "due_date": _to_epoch_ms(source.get("dueDate")),
                "parent": source.get("parentTaskId"),
            }.items()
            if value is not None
        }

    def _task_detail_payload(self, task: dict[str, Any], assignee_limit: int) -> dict[str, Any]:
        sample = _normalize_task_sample(task, assignee_limit=assignee_limit)
        if not sample:
            raise ValueError("Expected task payload to include an id")
        payload = dict(sample)
        payload["createdDate"] = _task_timestamp_iso(task.get("date_created") or task.get("createdDate"))
        payload["updatedDate"] = _task_timestamp_iso(task.get("date_updated") or task.get("updatedDate"))
        list_info = task.get("list") if isinstance(task.get("list"), dict) else {}
        payload["listId"] = _coerce_string(task.get("list_id") or task.get("listId") or list_info.get("id"))
        payload["listName"] = _coerce_string(task.get("list_name") or task.get("listName") or list_info.get("name"))
        payload["listUrl"] = _coerce_string(task.get("list_url") or task.get("listUrl") or list_info.get("url"))
        return payload

    def _view_body(self, args: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        base = dict(existing) if isinstance(existing, dict) else {}
        filters_remove = bool(args.get("filters_remove"))

        filters = args.get("filters") if isinstance(args.get("filters"), dict) else (base.get("filters") if isinstance(base.get("filters"), dict) else {})
        if filters_remove:
            filters = {"op": "AND", "fields": [], "search": "", "show_closed": False}
        else:
            filters = dict(filters)
            filters.setdefault("op", "AND")
            filters.setdefault("fields", [])
            filters.setdefault("search", "")
            filters.setdefault("show_closed", False)

            status_values = _view_status_values(args.get("statuses"))
            if status_values:
                filters["fields"] = list(filters.get("fields") or []) + [{"field": "status", "op": "ANY", "values": status_values}]
            tag_values = _parse_id_list(args.get("tags"))
            if tag_values:
                filters["fields"] = list(filters.get("fields") or []) + [{"field": "tag", "op": "ANY", "values": tag_values}]

        body = {
            "name": args.get("name") if args.get("name") is not None else base.get("name"),
            "type": args.get("viewType") or base.get("type") or "list",
            "description": args.get("description"),
            "grouping": base.get("grouping") if isinstance(base.get("grouping"), dict) else {"field": "status", "dir": 1, "ignore": False},
            "divide": base.get("divide") if isinstance(base.get("divide"), dict) else {"field": None, "dir": None, "collapsed": []},
            "sorting": base.get("sorting") if isinstance(base.get("sorting"), dict) else {"fields": []},
            "filters": filters,
            "columns": base.get("columns") if isinstance(base.get("columns"), dict) else {"fields": []},
            "team_sidebar": base.get("team_sidebar") if isinstance(base.get("team_sidebar"), dict) else {"assignees": [], "assigned_comments": False, "unassigned_tasks": False},
            "settings": base.get("settings")
            if isinstance(base.get("settings"), dict)
            else {
                "show_task_locations": True,
                "show_subtask_parent_names": True,
                "show_closed_subtasks": False,
                "show_assignees": True,
                "show_images": True,
                "me_comments": True,
                "me_subtasks": True,
                "me_checklists": True,
            },
        }
        if existing is not None and isinstance(base.get("parent"), dict):
            body["parent"] = base.get("parent")
        return body

    def _task_duplicate_body(self, source_task: dict[str, Any], *, include_assignees: bool) -> tuple[str, dict[str, Any]]:
        list_id = _coerce_string(source_task.get("list_id"))
        if not list_id and isinstance(source_task.get("list"), dict):
            list_id = _coerce_string(source_task["list"].get("id"))
        if not list_id:
            raise ValueError("Could not resolve source list for task duplication")

        status, _status_type = _extract_status(source_task)
        priority = _extract_priority(source_task)
        assignee_ids = [member["id"] for member in _extract_assignees(source_task, limit=100)[0]]
        body = {
            key: value
            for key, value in {
                "name": source_task.get("name"),
                "description": source_task.get("description"),
                "status": status,
                "priority": priority,
                "assignees": assignee_ids if include_assignees and assignee_ids else None,
                "tags": _extract_tags(source_task) or None,
                "due_date": _to_epoch_ms(source_task.get("due_date") or source_task.get("dueDate")),
            }.items()
            if value is not None
        }
        return list_id, body

    def _merge_task_defaults(self, defaults: dict[str, Any] | None, item: dict[str, Any]) -> dict[str, Any]:
        merged: dict[str, Any] = {}
        if isinstance(defaults, dict):
            merged.update(defaults)
        merged.update(item)
        return merged

    def _time_entry_page(
        self,
        args: dict[str, Any],
        *,
        page: int,
        page_size: int,
        location_filters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        team_id = self._workspace_id(args)
        params: dict[str, Any] = {
            "start_date": _to_epoch_ms(args.get("from")),
            "end_date": _to_epoch_ms(args.get("to")),
            "page": page,
            "include_location_names": True,
        }
        if location_filters:
            params.update({key: value for key, value in location_filters.items() if value is not None})
        payload = self._client.request(f"team/{team_id}/time_entries", params=params)
        entries = _time_entries_from_payload(payload)[:page_size]
        total_duration = sum(_time_entry_duration_ms(entry) for entry in entries)
        return {
            "workspaceId": team_id,
            "entries": entries,
            "entryCount": len(entries),
            "totalDurationMs": total_duration,
            "page": page,
            "pageSize": page_size,
            "filters": {
                "from": args.get("from"),
                "to": args.get("to"),
                **(location_filters or {}),
            },
        }

    def _view_tasks(self, view_id: str, *, page: int) -> list[dict[str, Any]]:
        payload = self._client.request(f"view/{view_id}/task", params={"page": page})
        if not isinstance(payload, dict):
            return []
        tasks = payload.get("tasks")
        return [task for task in tasks if isinstance(task, dict)] if isinstance(tasks, list) else []

    def _report_tasks_for_args(self, args: dict[str, Any]) -> list[dict[str, Any]]:
        task_page = _parse_non_negative_int(args.get("taskPage")) or 0
        task_limit = _parse_positive_int(args.get("taskSampleSize")) or 50
        if args.get("viewId"):
            return self._view_tasks(str(args["viewId"]), page=task_page)[:task_limit]

        search_args = {
            "teamId": args.get("teamId") or args.get("workspaceId") or self._config.team_id,
            "page": task_page,
            "pageSize": task_limit,
            "includeSubtasks": args.get("includeSubtasks"),
            "includeTasksInMultipleLists": args.get("includeTasksInMultipleLists"),
            "spaceId": args.get("spaceId"),
            "folderId": args.get("folderId"),
            "listId": args.get("listId"),
            "status": args.get("status"),
            "statuses": args.get("statuses"),
            "tagIds": args.get("tagIds") or ([args["tag"]] if args.get("tag") else None),
            "query": args.get("filterQuery"),
        }
        result = self._client.request(
            f"team/{self._workspace_id(search_args)}/task",
            params=self._search_params(
                search_args,
                page=task_page,
                page_size=min(task_limit, 100),
                order_by="updated",
                reverse=True,
            ),
        )
        if not isinstance(result, dict):
            return []
        tasks = result.get("tasks")
        return [task for task in tasks if isinstance(task, dict)][:task_limit] if isinstance(tasks, list) else []

    def _time_report_from_entries(
        self,
        entries: list[dict[str, Any]],
        *,
        scope: dict[str, Any],
        filters: dict[str, Any],
        guidance: str | None = None,
    ) -> dict[str, Any]:
        task_ids = {task_id for task_id in (_time_entry_task_id(entry) for entry in entries) if task_id}
        payload: dict[str, Any] = {
            "scope": scope,
            "filters": filters,
            "entries": entries,
            "entryCount": len(entries),
            "totalDurationMs": sum(_time_entry_duration_ms(entry) for entry in entries),
            "taskCount": len(task_ids),
        }
        if guidance:
            payload["guidance"] = guidance
        return payload

    def _entries_for_tasks(self, args: dict[str, Any], tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        page_size = _parse_positive_int(args.get("entryPageSize")) or 100
        page_limit = _parse_positive_int(args.get("entryPageLimit")) or 10
        entries: list[dict[str, Any]] = []
        seen_entry_ids: set[str] = set()
        for task in tasks:
            task_id = _coerce_string(task.get("id") or task.get("task_id"))
            if not task_id:
                continue
            for page in range(page_limit):
                page_payload = self._time_entry_page(args, page=page, page_size=page_size, location_filters={"task_id": task_id})
                page_entries = page_payload.get("entries", [])
                if not isinstance(page_entries, list):
                    break
                added_this_page = 0
                for entry in page_entries:
                    if not isinstance(entry, dict):
                        continue
                    entry_id = _coerce_string(entry.get("id"))
                    if entry_id and entry_id in seen_entry_ids:
                        continue
                    if entry_id:
                        seen_entry_ids.add(entry_id)
                    entries.append(entry)
                    added_this_page += 1
                if len(page_entries) < page_size or added_this_page == 0:
                    break
        return entries

    async def dispatch(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        args = await self._apply_path_defaults(dict(args))
        if name == "ping":
            return {"message": args.get("message", "pong")}
        if name == "health":
            payload = {
                "status": "ok",
                "server": "clickup-mcp",
                "transport": _runtime_env("FASTMCP_TRANSPORT", default="streamable-http"),
                "writeMode": self._config.write_access.mode,
                "charLimit": self._config.char_limit,
                "maxAttachmentMb": self._config.max_attachment_mb,
                "reportingMaxTasks": self._config.reporting_max_tasks,
                "defaultRiskWindowDays": self._config.default_risk_window_days,
            }
            if args.get("verbose"):
                payload["writeAllowedSpaces"] = sorted(self._config.write_access.allowed_spaces)
                payload["writeAllowedLists"] = sorted(self._config.write_access.allowed_lists)
                payload["hierarchyCacheTtlMs"] = self._config.hierarchy_cache_ttl_ms
                payload["spaceConfigCacheTtlMs"] = self._config.space_config_cache_ttl_ms
            return payload
        if name == "tool_catalogue":
            return {"tools": self._manifest}
        if name == "workspace_capability_snapshot":
            wid = self._workspace_id(args)
            force_refresh = bool(args.get("forceRefresh"))
            cache_key = f"workspace:{wid}:capabilities"
            if force_refresh:
                self._cache.pop(cache_key, None)
            return self._cached_value(
                cache_key,
                self._config.space_config_cache_ttl_ms,
                lambda: {
                    "workspaceId": wid,
                    "docsAvailable": _workspace_docs_available(self._client, wid),
                },
            )

        if name == "workspace_list":
            return self._cached_value("team:list", self._config.hierarchy_cache_ttl_ms, lambda: self._client.request("team"))
        if name == "space_list_for_workspace":
            return {"spaces": self._team_spaces(str(args["workspaceId"]))}
        if name == "folder_list_for_space":
            return {"folders": self._space_folders(str(args["spaceId"]))}
        if name == "list_list_for_space_or_folder":
            if args.get("folderId"):
                return {"lists": self._folder_lists(str(args["folderId"]))}
            if args.get("spaceId"):
                return {"lists": self._space_lists(str(args["spaceId"]))}
            raise ValueError("spaceId or folderId required")
        if name == "hierarchy_resolve_path":
            return self._resolve_path(args["path"])
        if name == "workspace_overview":
            wid = args.get("workspaceId") or self._workspace_id(args)
            spaces = self._team_spaces(str(wid))
            return {"workspaceId": wid, "spaces": spaces, "spaceCount": len(spaces)}
        if name == "workspace_hierarchy":
            _ = _parse_positive_int(args.get("concurrency"))
            if args.get("forceRefresh"):
                self._cache.pop("team:list", None)
                for key in [cache_key for cache_key in list(self._cache.keys()) if cache_key.startswith(("team:", "space:", "folder:"))]:
                    self._cache.pop(key, None)
            workspaces = [self._workspace_hierarchy_entry(workspace, args) for workspace in self._workspace_hierarchy_targets(args)]
            payload: dict[str, Any] = {"workspaces": workspaces, "count": len(workspaces)}
            if len(workspaces) == 1:
                payload["workspaceId"] = workspaces[0]["workspaceId"]
                payload["hierarchy"] = workspaces[0]["hierarchy"]
            return payload
        if name in {"member_list_for_workspace", "member_resolve", "member_search_by_name", "task_assignee_resolve"}:
            team_id = str(args.get("teamId") or self._workspace_id(args))
            members = self._team_members(team_id)
            if name == "member_list_for_workspace":
                return {"teamId": team_id, "members": members}
            if name == "member_search_by_name":
                q = str(args.get("query") or "").lower()
                limit = int(args.get("limit") or 10)
                results = [m for m in members if q in str(m.get("username", "")).lower() or q in str(m.get("email", "")).lower()]
                return {"teamId": team_id, "results": results[:limit]}
            identifiers = [str(x).lower() for x in (args.get("identifiers") or [])]
            resolved = []
            for ident in identifiers:
                for m in members:
                    values = {str(m.get("id", "")).lower(), str(m.get("username", "")).lower(), str(m.get("email", "")).lower()}
                    if ident in values:
                        resolved.append(m)
                        break
            return {"teamId": team_id, "resolved": resolved}

        if name == "space_tag_list":
            return self._client.request(f"space/{args['spaceId']}/tag")
        if name == "space_tag_create":
            _confirm_required(args)
            await self._ensure_write_allowed(args)
            if args.get("dryRun"):
                return {"dryRun": True, "operation": "space_tag_create", "input": args}
            tag = {
                k: v
                for k, v in {
                    "name": args.get("name"),
                    "tag_bg": args.get("backgroundColor"),
                    "tag_fg": args.get("foregroundColor"),
                }.items()
                if v is not None
            }
            body = {"tag": tag}
            return self._client.request(f"space/{args['spaceId']}/tag", method="POST", body=body)
        if name == "space_tag_update":
            _confirm_required(args)
            await self._ensure_write_allowed(args)
            if args.get("dryRun"):
                return {"dryRun": True, "operation": "space_tag_update", "input": args}
            current = args.get("currentName") or args.get("name")
            body = {k: v for k, v in {"tag": args.get("name"), "tag_bg": args.get("backgroundColor"), "tag_fg": args.get("foregroundColor")}.items() if v is not None}
            return self._client.request(f"space/{args['spaceId']}/tag/{current}", method="PUT", body=body)
        if name == "space_tag_delete":
            _confirm_required(args)
            await self._ensure_write_allowed(args)
            if args.get("dryRun"):
                return {"dryRun": True, "operation": "space_tag_delete", "input": args}
            return self._client.request(f"space/{args['spaceId']}/tag/{args['name']}", method="DELETE")

        if name in {"folder_create_in_space", "folder_update", "folder_delete", "list_create_for_container", "list_create_from_template", "list_update", "list_delete", "list_view_create", "space_view_create", "view_update", "view_delete"}:
            _confirm_required(args)
            await self._ensure_write_allowed(args)
            if args.get("dryRun"):
                return {"dryRun": True, "operation": name, "input": args}
            if name == "folder_create_in_space":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "statuses": args.get("statuses")}.items() if v is not None}
                return self._client.request(f"space/{args['spaceId']}/folder", method="POST", body=body)
            if name == "folder_update":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "statuses": args.get("statuses")}.items() if v is not None}
                return self._client.request(f"folder/{args['folderId']}", method="PUT", body=body)
            if name == "folder_delete":
                return self._client.request(f"folder/{args['folderId']}", method="DELETE")
            if name == "list_create_for_container":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "statuses": args.get("statuses")}.items() if v is not None}
                if args.get("folderId"):
                    return self._client.request(f"folder/{args['folderId']}/list", method="POST", body=body)
                return self._client.request(f"space/{args['spaceId']}/list", method="POST", body=body)
            if name == "list_create_from_template":
                body = {"name": args.get("name"), "use_template_options": bool(args.get("useTemplateOptions"))}
                if args.get("folderId"):
                    return self._client.request(f"folder/{args['folderId']}/list_template/{args['templateId']}", method="POST", body=body)
                return self._client.request(f"space/{args['spaceId']}/list_template/{args['templateId']}", method="POST", body=body)
            if name == "list_update":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "statuses": args.get("statuses")}.items() if v is not None}
                return self._client.request(f"list/{args['listId']}", method="PUT", body=body)
            if name == "list_delete":
                return self._client.request(f"list/{args['listId']}", method="DELETE")
            if name == "list_view_create":
                body = self._view_body(args)
                return self._client.request(f"list/{args['listId']}/view", method="POST", body=body)
            if name == "space_view_create":
                body = self._view_body(args)
                return self._client.request(f"space/{args['spaceId']}/view", method="POST", body=body)
            if name == "view_update":
                existing = self._client.request(f"view/{args['viewId']}")
                if not isinstance(existing, dict):
                    raise ValueError("Expected dict payload when reading existing view")
                body = self._view_body(args, existing)
                return self._client.request(f"view/{args['viewId']}", method="PUT", body=body)
            if name == "view_delete":
                return self._client.request(f"view/{args['viewId']}", method="DELETE")

        if name == "reference_link_list":
            import requests as _r
            response = _r.get("https://developer.clickup.com/llms.txt", timeout=10)
            if hasattr(response, "raise_for_status"):
                response.raise_for_status()
            limit = _parse_positive_int(args.get("limit")) or 50
            return {"links": _parse_reference_index(response.text)[:limit]}
        if name == "reference_page_fetch":
            import requests as _r
            url = str(args["url"])
            if not _is_official_reference_url(url):
                raise ValueError("Only developer.clickup.com Markdown doc URLs and llms.txt are supported")
            response = _r.get(url, timeout=10)
            if hasattr(response, "raise_for_status"):
                response.raise_for_status()
            text = response.text
            limit = min(self._preview_limit(args.get("maxCharacters")), self._config.char_limit)
            return {"source": url, "body": text[:limit], "truncated": len(text) > limit}
        if name in {"task_create", "subtask_create", "task_update", "task_delete", "task_duplicate", "task_comment_add", "task_attachment_add", "task_tag_add", "task_tag_remove", "task_create_bulk", "subtask_create_bulk", "task_update_bulk", "task_delete_bulk", "task_tag_add_bulk", "task_search", "task_search_fuzzy", "task_search_fuzzy_bulk", "task_status_report", "task_risk_report", "task_read", "task_list_for_list", "task_comment_list", "list_custom_field_list", "task_custom_field_set_value", "task_custom_field_clear_value"}:
            if name in {"task_create", "subtask_create", "task_update", "task_delete", "task_duplicate", "task_comment_add", "task_attachment_add", "task_tag_add", "task_tag_remove", "task_create_bulk", "subtask_create_bulk", "task_update_bulk", "task_delete_bulk", "task_tag_add_bulk", "task_custom_field_set_value", "task_custom_field_clear_value"}:
                _confirm_required(args)
                await self._ensure_write_allowed(args)
                if args.get("dryRun"):
                    return {"dryRun": True, "operation": name, "input": args}
            if name == "task_create":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "status": args.get("status"), "priority": args.get("priority"), "assignees": args.get("assigneeIds"), "tags": args.get("tags"), "due_date": _to_epoch_ms(args.get("dueDate"))}.items() if v is not None}
                return self._client.request(f"list/{args['listId']}/task", method="POST", body=body)
            if name == "subtask_create":
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "status": args.get("status"), "priority": args.get("priority"), "assignees": args.get("assigneeIds"), "tags": args.get("tags"), "due_date": _to_epoch_ms(args.get("dueDate")), "parent": args.get("parentTaskId")}.items() if v is not None}
                return self._client.request(f"list/{args['listId']}/task", method="POST", body=body)
            if name == "task_update":
                task_id = self._task_id(args)
                body = {k: v for k, v in {"name": args.get("name"), "description": args.get("description"), "status": args.get("status"), "priority": args.get("priority"), "assignees": args.get("assigneeIds"), "parent": args.get("parentTaskId"), "due_date": _to_epoch_ms(args.get("dueDate"))}.items() if v is not None}
                return self._client.request(f"task/{task_id}", method="PUT", body=body)
            if name == "task_delete":
                return self._client.request(f"task/{args['taskId']}", method="DELETE")
            if name == "task_duplicate":
                source_task = self._client.request(f"task/{args['taskId']}")
                if not isinstance(source_task, dict):
                    raise ValueError("Expected dict payload when reading source task for duplication")
                target_list_id = _coerce_string(args.get("listId"))
                source_list_id, body = self._task_duplicate_body(
                    source_task,
                    include_assignees=bool(args.get("includeAssignees")),
                )
                return self._client.request(f"list/{target_list_id or source_list_id}/task", method="POST", body=body)
            if name == "task_comment_add":
                return self._client.request(f"task/{args['taskId']}/comment", method="POST", body={"comment_text": args["comment"]})
            if name == "task_attachment_add":
                raw, mime = self._upload_from_data_uri(args["dataUri"])
                files = {"attachment": (args.get("filename") or "attachment.bin", raw, mime)}
                workspace_id = self._workspace_id(args)
                return self._client.request_v3(f"workspaces/{workspace_id}/tasks/{args['taskId']}/attachments", method="POST", files=files)
            if name == "task_tag_add":
                out = []
                for tag in args.get("tags") or []:
                    out.append(self._client.request(f"task/{args['taskId']}/tag/{tag}", method="POST"))
                return {"results": out}
            if name == "task_tag_remove":
                out = []
                for tag in args.get("tags") or []:
                    out.append(self._client.request(f"task/{args['taskId']}/tag/{tag}", method="DELETE"))
                return {"results": out}
            if name == "task_create_bulk":
                defaults = args.get("defaults") if isinstance(args.get("defaults"), dict) else {}
                results = []
                for task in args.get("tasks") or []:
                    if not isinstance(task, dict):
                        continue
                    merged = self._merge_task_defaults(defaults, task)
                    list_id = _coerce_string(merged.get("listId"))
                    if not list_id:
                        raise ValueError("Each bulk task create item requires listId directly or via defaults.listId")
                    results.append(
                        self._client.request(
                            f"list/{list_id}/task",
                            method="POST",
                            body=self._task_write_body(merged),
                        )
                    )
                return {"results": results, "count": len(results)}
            if name == "subtask_create_bulk":
                defaults = args.get("defaults") if isinstance(args.get("defaults"), dict) else {}
                results = []
                for task in args.get("subtasks") or []:
                    if not isinstance(task, dict):
                        continue
                    merged = self._merge_task_defaults(defaults, task)
                    list_id = _coerce_string(merged.get("listId"))
                    if not list_id:
                        raise ValueError("Each bulk subtask create item requires listId directly or via defaults.listId")
                    parent_task_id = _coerce_string(merged.get("parentTaskId") or merged.get("parent"))
                    if not parent_task_id:
                        raise ValueError("Each bulk subtask create item requires parentTaskId directly or via defaults.parentTaskId")
                    body = self._task_write_body({**merged, "parentTaskId": parent_task_id})
                    results.append(
                        self._client.request(
                            f"list/{list_id}/task",
                            method="POST",
                            body=body,
                        )
                    )
                return {"results": results, "count": len(results)}
            if name == "task_update_bulk":
                defaults = args.get("defaults") if isinstance(args.get("defaults"), dict) else {}
                results = []
                for task in args.get("tasks") or []:
                    if not isinstance(task, dict):
                        continue
                    merged = self._merge_task_defaults(defaults, task)
                    task_id = _coerce_string(merged.get("taskId"))
                    if not task_id:
                        raise ValueError("Each bulk task update item requires taskId")
                    results.append(
                        self._client.request(
                            f"task/{task_id}",
                            method="PUT",
                            body=self._task_write_body(merged),
                        )
                    )
                return {"results": results, "count": len(results)}
            if name == "task_delete_bulk":
                results = []
                for task in args.get("tasks") or []:
                    if not isinstance(task, dict):
                        continue
                    task_id = _coerce_string(task.get("taskId"))
                    if not task_id:
                        raise ValueError("Each bulk task delete item requires taskId")
                    results.append(self._client.request(f"task/{task_id}", method="DELETE"))
                return {"results": results, "count": len(results)}
            if name == "task_tag_add_bulk":
                defaults = args.get("defaults") if isinstance(args.get("defaults"), dict) else {}
                results = []
                for task in args.get("tasks") or []:
                    if not isinstance(task, dict):
                        continue
                    merged = self._merge_task_defaults(defaults, task)
                    task_id = _coerce_string(merged.get("taskId"))
                    if not task_id:
                        raise ValueError("Each bulk tag-add item requires taskId")
                    for tag in merged.get("tags") or []:
                        results.append(self._client.request(f"task/{task_id}/tag/{tag}", method="POST"))
                return {"results": results, "count": len(results)}
            if name == "task_search":
                team_id = self._workspace_id(args)
                requested_limit = _parse_positive_int(args.get("pageSize")) or _parse_positive_int(args.get("limit")) or 50
                params = self._search_params(
                    args,
                    page=int(args.get("page") or 0),
                    page_size=min(requested_limit, 100),
                    order_by="updated",
                    reverse=True,
                )
                data = self._client.request(f"team/{team_id}/task", params=params)
                tasks = data.get("tasks", []) if isinstance(data, dict) else []
                return {"tasks": tasks[:requested_limit], "total": len(tasks)}
            if name in {"task_search_fuzzy", "task_search_fuzzy_bulk"}:
                if name == "task_search_fuzzy":
                    payload = {
                        "query": args.get("query"),
                        "pageSize": args.get("limit", 10),
                        "teamId": args.get("teamId") or self._config.team_id,
                    }
                    return await self.dispatch("task_search", payload)
                out = []
                for query in args.get("queries") or []:
                    payload = {
                        "query": query,
                        "pageSize": args.get("limit", 10),
                        "teamId": args.get("teamId") or self._config.team_id,
                    }
                    out.append(await self.dispatch("task_search", payload))
                return {"queries": out}
            if name in {"task_status_report", "task_risk_report"}:
                if name == "task_status_report":
                    return self._status_report(args)
                return self._risk_report(args)
            if name == "task_read":
                task_id = self._task_id(args)
                task = self._client.request(f"task/{task_id}")
                if not isinstance(task, dict):
                    raise ValueError("Expected dict payload when reading task")
                assignee_limit = _parse_positive_int(args.get("detailLimit")) or 10
                return self._task_detail_payload(task, assignee_limit)
            if name == "task_list_for_list":
                page = _parse_non_negative_int(args.get("page"))
                include_subtasks = _parse_bool_flag(args.get("includeSubtasks"))
                include_timl = _parse_bool_flag(args.get("includeTasksInMultipleLists"))
                include_closed = _parse_bool_flag(args.get("includeClosed"))
                params = {
                    "page": 0 if page is None else page,
                    "subtasks": True if include_subtasks is None else include_subtasks,
                    "include_timl": True if include_timl is None else include_timl,
                    "include_closed": False if include_closed is None else include_closed,
                }
                data = self._client.request(f"list/{args['listId']}/task", params=params)
                tasks = data.get("tasks", []) if isinstance(data, dict) else []
                limit = _parse_positive_int(args.get("limit")) or 20
                assignee_limit = _parse_positive_int(args.get("assigneePreviewLimit")) or 5
                normalized = [
                    sample
                    for sample in (
                        self._task_detail_payload(task, assignee_limit)
                        for task in tasks
                        if isinstance(task, dict)
                    )
                    if sample
                ]
                return {"tasks": normalized[:limit], "total": len(normalized)}
            if name == "task_comment_list":
                task_id = self._task_id(args)
                data = self._client.request(f"task/{task_id}/comment")
                comments = data.get("comments", []) if isinstance(data, dict) else []
                limit = int(args.get("limit") or len(comments) or 50)
                return {"comments": comments[:limit]}
            if name == "list_custom_field_list":
                return self._client.request(f"list/{args['listId']}/field")
            if name == "task_custom_field_set_value":
                return self._client.request(f"task/{args['taskId']}/field/{args['fieldId']}", method="POST", body={"value": args.get("value")})
            if name == "task_custom_field_clear_value":
                return self._client.request(f"task/{args['taskId']}/field/{args['fieldId']}", method="DELETE")

        if name in {"doc_create", "doc_list", "doc_read", "doc_pages_read", "doc_page_list", "doc_page_read", "doc_page_create", "doc_page_update", "doc_search", "doc_search_bulk"}:
            if name in {"doc_create", "doc_page_create", "doc_page_update"}:
                _confirm_required(args)
                await self._ensure_write_allowed(args)
                if args.get("dryRun"):
                    return {"dryRun": True, "operation": name, "input": args}
            workspace_id = str(args.get("workspaceId") or _team_id())
            preview_limit = self._preview_limit(args.get("previewCharLimit"))
            if name == "doc_create":
                body = {k: v for k, v in {"name": args.get("name"), "content": args.get("content"), "folder_id": args.get("folderId")}.items() if v is not None}
                return self._client.request_v3(f"workspaces/{workspace_id}/docs", method="POST", body=body)
            if name == "doc_list":
                params = {"search": args.get("search"), "limit": args.get("limit"), "page": args.get("page"), "space_id": args.get("spaceId"), "folder_id": args.get("folderId")}
                payload = self._client.request_v3(f"workspaces/{workspace_id}/docs", params=params)
                docs = payload.get("docs", []) if isinstance(payload, dict) else (payload if isinstance(payload, list) else [])
                include_previews = _parse_bool_flag(args.get("includePreviews"))
                if include_previews is None:
                    include_previews = True
                preview_page_limit = _parse_positive_int(args.get("previewPageLimit")) or 3
                enriched = [
                    self._doc_with_summary(
                        workspace_id,
                        doc,
                        include_previews=include_previews,
                        preview_page_limit=preview_page_limit,
                        preview_limit=preview_limit,
                    )
                    for doc in docs
                    if isinstance(doc, dict)
                ]
                return {"docs": enriched, "count": len(enriched)}
            if name == "doc_read":
                doc = self._client.request_v3(f"workspaces/{workspace_id}/docs/{args['docId']}")
                page_limit = _parse_positive_int(args.get("pageLimit")) or 20
                page_metadata: list[dict[str, Any]] = []
                detailed_pages: list[dict[str, Any]] = []
                include_pages = _parse_bool_flag(args.get("includePages"))
                if include_pages is None:
                    include_pages = True
                if include_pages:
                    page_metadata = self._doc_page_listing(workspace_id, str(args["docId"]))[:page_limit]
                    doc["pages"] = page_metadata
                if args.get("pageIds"):
                    requested_page_ids = {str(page_id) for page_id in (args.get("pageIds") or []) if page_id is not None}
                    detailed_pages = [
                        page
                        for page in self._doc_pages(workspace_id, str(args["docId"]))
                        if str(page.get("id") or page.get("page_id") or page.get("pageId") or page.get("uuid")) in requested_page_ids
                    ]
                doc["summary"] = self._document_summary(
                    doc if isinstance(doc, dict) else {},
                    page_metadata,
                    detailed_pages,
                    preview_limit,
                )
                return doc
            if name == "doc_pages_read":
                requested_page_ids = {str(page_id) for page_id in (args.get("pageIds") or []) if page_id is not None}
                pages = [
                    page
                    for page in self._doc_pages(workspace_id, str(args["docId"]))
                    if not requested_page_ids
                    or str(page.get("id") or page.get("page_id") or page.get("pageId") or page.get("uuid")) in requested_page_ids
                ]
                previewed = [self._page_with_preview(page, preview_limit) for page in pages if isinstance(page, dict)]
                return {"pages": previewed, "count": len(previewed)}
            if name == "doc_page_list":
                pages = self._doc_page_listing(workspace_id, str(args["docId"]))
                previewed = [self._page_with_preview(page, preview_limit) for page in pages if isinstance(page, dict)]
                return {"pages": previewed, "count": len(previewed)}
            if name == "doc_page_read":
                payload = self._client.request_v3(f"workspaces/{workspace_id}/docs/{args['docId']}/pages/{args['pageId']}")
                if isinstance(payload, dict):
                    return self._page_with_preview(payload, preview_limit)
                return payload
            if name == "doc_page_create":
                body = {
                    k: v
                    for k, v in {
                        "name": args.get("title"),
                        "content": args.get("content"),
                        "parent_id": args.get("parentId"),
                        "position": args.get("position"),
                    }.items()
                    if v is not None
                }
                return self._client.request_v3(f"workspaces/{workspace_id}/docs/{args['docId']}/pages", method="POST", body=body)
            if name == "doc_page_update":
                body = {k: v for k, v in {"name": args.get("title"), "content": args.get("content")}.items() if v is not None}
                return self._client.request_v3(f"workspaces/{workspace_id}/docs/{args['docId']}/pages/{args['pageId']}", method="PUT", body=body)
            if name == "doc_search":
                payload = self._client.request_v3(f"workspaces/{workspace_id}/docs", params={"search": args.get("query"), "limit": args.get("limit")})
                docs = payload.get("docs", []) if isinstance(payload, dict) else []
                expand_pages = bool(args.get("expandPages"))
                enriched = [
                    self._doc_with_summary(
                        workspace_id,
                        doc,
                        include_previews=expand_pages,
                        preview_page_limit=3,
                        preview_limit=preview_limit,
                    )
                    for doc in docs
                    if isinstance(doc, dict)
                ]
                return {"docs": enriched, "count": len(enriched)}
            if name == "doc_search_bulk":
                return {
                    "queries": [
                        (
                            lambda search_payload: {
                                "query": q,
                                "docs": [
                                    self._doc_with_summary(
                                        workspace_id,
                                        doc,
                                        include_previews=bool(args.get("expandPages")),
                                        preview_page_limit=3,
                                        preview_limit=preview_limit,
                                    )
                                    for doc in (search_payload.get("docs", []) if isinstance(search_payload, dict) else [])
                                    if isinstance(doc, dict)
                                ],
                                "count": len(search_payload.get("docs", []) if isinstance(search_payload, dict) else []),
                            }
                        )(self._client.request_v3(f"workspaces/{workspace_id}/docs", params={"search": q, "limit": args.get("limit")}))
                        for q in (args.get("queries") or [])
                    ]
                }

        if name in {"task_timer_start", "task_timer_stop", "time_entry_create_for_task", "time_entry_update", "time_entry_delete", "task_time_entry_list", "time_entry_current", "time_entry_list", "time_report_for_tag", "time_report_for_container", "time_report_for_context", "time_report_for_space_tag"}:
            if name in {"task_timer_start", "task_timer_stop", "time_entry_create_for_task", "time_entry_update", "time_entry_delete"}:
                _confirm_required(args)
                await self._ensure_write_allowed(args)
                if args.get("dryRun"):
                    return {"dryRun": True, "operation": name, "input": args}
            if name == "task_timer_start":
                team_id = self._workspace_id(args)
                return self._client.request(f"team/{team_id}/time_entries/start", method="POST", body={"tid": args["taskId"]})
            if name == "task_timer_stop":
                team_id = self._workspace_id(args)
                return self._client.request(f"team/{team_id}/time_entries/stop", method="POST")
            if name == "time_entry_create_for_task":
                team_id = self._workspace_id(args)
                body = {
                    k: v
                    for k, v in {
                        "start": _to_epoch_ms(args.get("start")),
                        "end": _to_epoch_ms(args.get("end")),
                        "duration": args.get("durationMs"),
                        "description": args.get("description"),
                        "tid": args["taskId"],
                    }.items()
                    if v is not None
                }
                return self._client.request(f"team/{team_id}/time_entries", method="POST", body=body)
            if name == "time_entry_update":
                team_id = self._workspace_id(args)
                body = {k: v for k, v in {"start": _to_epoch_ms(args.get("start")), "end": _to_epoch_ms(args.get("end")), "duration": args.get("durationMs"), "description": args.get("description")}.items() if v is not None}
                return self._client.request(f"team/{team_id}/time_entries/{args['entryId']}", method="PUT", body=body)
            if name == "time_entry_delete":
                team_id = self._workspace_id(args)
                return self._client.request(f"team/{team_id}/time_entries/{args['entryId']}", method="DELETE")
            if name == "task_time_entry_list":
                return self._time_entry_page(
                    args,
                    page=_parse_non_negative_int(args.get("page")) or 0,
                    page_size=_parse_positive_int(args.get("pageSize")) or 20,
                    location_filters={"task_id": args["taskId"]},
                )
            if name == "time_entry_current":
                team_id = self._workspace_id(args)
                return self._client.request(f"team/{team_id}/time_entries/current")
            if name == "time_entry_list":
                location_filters: dict[str, Any] = {}
                task_id = _coerce_string(args.get("taskId"))
                if task_id:
                    location_filters["task_id"] = task_id
                return self._time_entry_page(
                    args,
                    page=_parse_non_negative_int(args.get("page")) or 0,
                    page_size=_parse_positive_int(args.get("pageSize")) or 20,
                    location_filters=location_filters or None,
                )
            if name == "time_report_for_container":
                container_type = str(args["containerType"]).strip().lower()
                location_key = {
                    "workspace": None,
                    "space": "space_id",
                    "folder": "folder_id",
                    "list": "list_id",
                }.get(container_type)
                if container_type not in {"workspace", "space", "folder", "list"}:
                    raise ValueError("containerType must be one of workspace, space, folder, or list")
                if args.get("includeSubtasks") is False or args.get("includeTasksInMultipleLists") is False:
                    search_args = dict(args)
                    if container_type == "space":
                        search_args["spaceId"] = args["containerId"]
                    elif container_type == "folder":
                        search_args["folderId"] = args["containerId"]
                    elif container_type == "list":
                        search_args["listId"] = args["containerId"]
                    tasks = self._report_tasks_for_args(search_args)
                    entries = self._entries_for_tasks(search_args, tasks)
                else:
                    entries = self._time_entry_page(
                        args,
                        page=0,
                        page_size=_parse_positive_int(args.get("entryPageSize")) or 100,
                        location_filters={location_key: args["containerId"]} if location_key else None,
                    )["entries"]
                return self._time_report_from_entries(
                    entries,
                    scope={
                        "workspaceId": self._workspace_id(args),
                        "containerType": container_type,
                        "containerId": args["containerId"],
                    },
                    filters={
                        "from": args.get("from"),
                        "to": args.get("to"),
                        "includeSubtasks": args.get("includeSubtasks") is not False,
                        "includeTasksInMultipleLists": args.get("includeTasksInMultipleLists") is not False,
                    },
                )
            if name == "time_report_for_tag":
                tasks = self._report_tasks_for_args(args)
                entries = self._entries_for_tasks(args, tasks)
                return self._time_report_from_entries(
                    entries,
                    scope={"workspaceId": self._workspace_id(args), "tag": args["tag"]},
                    filters={
                        "from": args.get("from"),
                        "to": args.get("to"),
                        "includeSubtasks": args.get("includeSubtasks") is not False,
                    },
                )
            if name == "time_report_for_space_tag":
                search_args = dict(args)
                search_args["tagIds"] = [args["tag"]]
                tasks = self._report_tasks_for_args(search_args)
                entries = self._entries_for_tasks(search_args, tasks)
                return self._time_report_from_entries(
                    entries,
                    scope={"workspaceId": self._workspace_id(args), "spaceId": args["spaceId"], "tag": args["tag"]},
                    filters={
                        "from": args.get("from"),
                        "to": args.get("to"),
                        "includeSubtasks": args.get("includeSubtasks") is not False,
                    },
                )
            if name == "time_report_for_context":
                if args.get("taskId"):
                    entries = self._time_entry_page(
                        args,
                        page=0,
                        page_size=_parse_positive_int(args.get("entryPageSize")) or 100,
                        location_filters={"task_id": args["taskId"]},
                    )["entries"]
                elif args.get("viewId") or args.get("filterQuery") or args.get("status") or args.get("statuses") or args.get("tagIds") or args.get("includeSubtasks") is False or args.get("includeTasksInMultipleLists") is False:
                    tasks = self._report_tasks_for_args(args)
                    entries = self._entries_for_tasks(args, tasks)
                else:
                    location_filters: dict[str, Any] = {}
                    if args.get("listId"):
                        location_filters["list_id"] = args["listId"]
                    elif args.get("spaceId"):
                        location_filters["space_id"] = args["spaceId"]
                    entries = self._time_entry_page(
                        args,
                        page=0,
                        page_size=_parse_positive_int(args.get("entryPageSize")) or 100,
                        location_filters=location_filters or None,
                    )["entries"]
                return self._time_report_from_entries(
                    entries,
                    scope={
                        key: value
                        for key, value in {
                            "workspaceId": self._workspace_id(args),
                            "spaceId": args.get("spaceId"),
                            "listId": args.get("listId"),
                            "taskId": args.get("taskId"),
                            "viewId": args.get("viewId"),
                        }.items()
                        if value is not None
                    },
                    filters={
                        "from": args.get("from"),
                        "to": args.get("to"),
                        "filterQuery": args.get("filterQuery"),
                        "status": args.get("status"),
                        "statuses": args.get("statuses"),
                        "tagIds": args.get("tagIds"),
                        "includeSubtasks": args.get("includeSubtasks") is not False,
                        "includeTasksInMultipleLists": args.get("includeTasksInMultipleLists") is not False,
                    },
                    guidance=args.get("guidance"),
                )
            raise ValueError(f"Unhandled time report tool: {name}")

        raise NotImplementedError(f"Tool '{name}' is not implemented")


def _register_tools(server: FastMCP, runtime: ClickUpRuntime, manifest: list[dict[str, Any]]) -> None:
    for spec in manifest:
        name = str(spec.get("name") or "").strip()
        if not name:
            continue
        params = spec.get("inputSchema") or {"type": "object", "properties": {}, "additionalProperties": True}
        desc = str(spec.get("description") or "")

        async def _fn(_name: str = name, **kwargs: Any) -> dict[str, Any]:
            try:
                return await runtime.dispatch(_name, kwargs)
            except Exception as exc:
                return {"isError": True, "error": str(exc)}

        server.add_tool(
            FunctionTool(
                name=name,
                description=desc,
                parameters=params,
                output_schema={"type": "object", "additionalProperties": True},
                fn=_fn,
            )
        )


manifest = _load_manifest()
runtime_config = _resolve_runtime_config()
client = ClickUpClient(_clickup_token(), timeout_ms=int(_runtime_env("CLICKUP_HTTP_TIMEOUT_MS", default="30000") or "30000"))
runtime = ClickUpRuntime(client, manifest, runtime_config)
api_keys = _load_api_keys()
auth = select_mcp_auth("clickup-mcp", StaticApiKeyVerifier, api_keys, _runtime_env("BASE_URL"))
server = FastMCP("clickup-mcp", auth=auth)
mcp = server
_register_tools(server, runtime, manifest)


@server.custom_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def root_health(_request):
    return JSONResponse(
        {
            "status": "ok",
            "server": "clickup-mcp",
            "writeMode": runtime_config.write_access.mode,
            "charLimit": runtime_config.char_limit,
            "maxAttachmentMb": runtime_config.max_attachment_mb,
            "reportingMaxTasks": runtime_config.reporting_max_tasks,
            "defaultRiskWindowDays": runtime_config.default_risk_window_days,
        }
    )


@server.custom_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
async def health(_request):
    return JSONResponse(
        {
            "status": "ok",
            "server": "clickup-mcp",
            "writeMode": runtime_config.write_access.mode,
            "charLimit": runtime_config.char_limit,
            "maxAttachmentMb": runtime_config.max_attachment_mb,
            "reportingMaxTasks": runtime_config.reporting_max_tasks,
            "defaultRiskWindowDays": runtime_config.default_risk_window_days,
        }
    )


@server.custom_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
async def healthz(_request):
    return JSONResponse(
        {
            "status": "ok",
            "server": "clickup-mcp",
            "writeMode": runtime_config.write_access.mode,
            "charLimit": runtime_config.char_limit,
            "maxAttachmentMb": runtime_config.max_attachment_mb,
            "reportingMaxTasks": runtime_config.reporting_max_tasks,
            "defaultRiskWindowDays": runtime_config.default_risk_window_days,
        }
    )


def main() -> None:
    transport_name = _runtime_env("FASTMCP_TRANSPORT", default="streamable-http").lower()
    if transport_name == "http":
        transport_name = "streamable-http"
    if transport_name == "stdio":
        server.run()
    else:
        host = _runtime_env("HOST", default="127.0.0.1")
        port = int(_runtime_env("PORT", default="3004"))
        path = _runtime_env("MCP_PATH", default="/mcp")
        server.run(
            transport=transport_name,
            host=host,
            port=port,
            path=path,
            show_banner=False,
        )


if __name__ == "__main__":
    main()
