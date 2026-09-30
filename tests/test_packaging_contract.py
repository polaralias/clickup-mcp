from importlib.resources import files
from pathlib import Path


def test_packaged_tool_catalog_matches_source_manifest():
    root = Path(__file__).resolve().parents[1]
    source = (root / "tool_manifest_clickup.json").read_bytes()
    packaged = files("clickup_mcp_data").joinpath("tool_manifest_clickup.json").read_bytes()
    assert packaged == source
