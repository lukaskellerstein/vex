"""Marketplace service — clone/sync marketplace repos and discover plugins."""

import json
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Default storage for cloned marketplace repos
_MARKETPLACE_ROOT = Path.home() / ".vex" / "marketplaces"

# Resolved plugins cache: marketplace_name -> {plugin_name -> plugin_path}
_resolved: dict[str, dict[str, Path]] = {}


def get_marketplace_root() -> Path:
    return _MARKETPLACE_ROOT


def sync_marketplace(name: str, url: str, branch: str = "main") -> Path:
    """Clone or update a marketplace repository. Returns the local path."""
    dest = _MARKETPLACE_ROOT / name
    dest.parent.mkdir(parents=True, exist_ok=True)

    if (dest / ".git").exists():
        logger.info("Updating marketplace '%s' at %s", name, dest)
        result = subprocess.run(
            ["git", "-C", str(dest), "pull", "--ff-only"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            logger.info("Updated '%s': %s", name, result.stdout.strip())
        else:
            logger.warning("Pull failed for '%s' (using existing): %s", name, result.stderr.strip())
    else:
        logger.info("Cloning marketplace '%s' from %s", name, url)
        result = subprocess.run(
            ["git", "clone", "--branch", branch, "--single-branch", url, str(dest)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to clone marketplace '{name}': {result.stderr}")
        logger.info("Cloned marketplace '%s'", name)

    # Discover plugins after sync
    _discover_plugins(name, dest)
    return dest


def _discover_plugins(marketplace_name: str, marketplace_path: Path) -> None:
    """Scan marketplace directory for plugins and cache their paths.

    Supports two layouts:
    1. Marketplace manifest: .claude-plugin/marketplace.json listing plugins
    2. Flat directory: each subdirectory with .claude-plugin/plugin.json is a plugin
    """
    plugins: dict[str, Path] = {}

    manifest_path = marketplace_path / ".claude-plugin" / "marketplace.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        logger.info(
            "Marketplace '%s': %s v%s — %s",
            marketplace_name,
            manifest.get("name", "unknown"),
            manifest.get("version", "?"),
            manifest.get("description", ""),
        )
        for entry in manifest.get("plugins", []):
            plugin_path = (marketplace_path / entry["source"]).resolve()
            plugin_json = plugin_path / ".claude-plugin" / "plugin.json"
            if plugin_json.exists():
                meta = json.loads(plugin_json.read_text())
                plugin_name = meta.get("name", entry.get("name", plugin_path.name))
                plugins[plugin_name] = plugin_path
                logger.info(
                    "  Found plugin: %s v%s — %s",
                    plugin_name,
                    meta.get("version", "?"),
                    meta.get("description", ""),
                )
            else:
                logger.warning("  Skipping %s: no .claude-plugin/plugin.json", entry.get("name", "?"))
    else:
        # Flat layout: scan top-level directories
        for candidate in sorted(marketplace_path.iterdir()):
            if not candidate.is_dir() or candidate.name.startswith("."):
                continue
            plugin_json = candidate / ".claude-plugin" / "plugin.json"
            if plugin_json.exists():
                meta = json.loads(plugin_json.read_text())
                plugin_name = meta.get("name", candidate.name)
                plugins[plugin_name] = candidate
                logger.info(
                    "  Found plugin: %s v%s — %s",
                    plugin_name,
                    meta.get("version", "?"),
                    meta.get("description", ""),
                )

    _resolved[marketplace_name] = plugins
    logger.info("Marketplace '%s': %d plugin(s) discovered", marketplace_name, len(plugins))


def sync_all(config: dict) -> None:
    """Sync all marketplaces defined in config."""
    marketplaces = config.get("marketplaces", {})
    for name, spec in marketplaces.items():
        url = spec.get("url", "")
        branch = spec.get("branch", "main")
        if not url:
            logger.warning("Marketplace '%s' has no URL, skipping", name)
            continue
        try:
            sync_marketplace(name, url, branch)
        except Exception:
            logger.exception("Failed to sync marketplace '%s'", name)


def resolve_plugin_ref(ref: str) -> Path | None:
    """Resolve a plugin reference like 'plugin-name@marketplace-name' to a local path."""
    if "@" not in ref:
        logger.warning("Invalid plugin ref (missing @marketplace): %s", ref)
        return None

    plugin_name, marketplace_name = ref.rsplit("@", 1)
    marketplace_plugins = _resolved.get(marketplace_name)
    if marketplace_plugins is None:
        logger.warning("Marketplace '%s' not synced (ref: %s)", marketplace_name, ref)
        return None

    path = marketplace_plugins.get(plugin_name)
    if path is None:
        logger.warning(
            "Plugin '%s' not found in marketplace '%s' (available: %s)",
            plugin_name,
            marketplace_name,
            list(marketplace_plugins.keys()),
        )
        return None

    return path


def resolve_plugin_refs(refs: list[str]) -> list[dict]:
    """Resolve a list of plugin refs to SDK plugin config dicts."""
    plugins: list[dict] = []
    for ref in refs:
        path = resolve_plugin_ref(ref)
        if path:
            plugins.append({"type": "local", "path": str(path)})
        else:
            logger.warning("Could not resolve plugin: %s", ref)
    return plugins


def get_resolved_plugins() -> dict[str, dict[str, Path]]:
    """Return the current resolved plugin cache (marketplace_name -> {name -> path})."""
    return dict(_resolved)
