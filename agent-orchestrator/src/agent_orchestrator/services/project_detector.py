"""Auto-detect project properties from a filesystem path."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_FRAMEWORK_CONFIG_MAP: dict[str, str] = {
    "next.config": "next",
    "nuxt.config": "nuxt",
    "svelte.config": "svelte",
    "angular.json": "angular",
    "vite.config": "vite",
}

_LOCK_FILE_MAP: dict[str, str] = {
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "bun.lockb": "bun",
    "package-lock.json": "npm",
}

_FRAMEWORK_DEPS: dict[str, str] = {
    "next": "next",
    "nuxt": "nuxt",
    "svelte": "svelte",
    "@angular/core": "angular",
    "vue": "vue",
    "react": "react",
}


def _read_package_json(root: Path) -> dict | None:
    pkg_path = root / "package.json"
    if not pkg_path.is_file():
        return None
    try:
        return json.loads(pkg_path.read_text())
    except (json.JSONDecodeError, OSError):
        logger.debug("Failed to parse package.json at %s", pkg_path)
        return None


def _detect_framework(root: Path, pkg: dict | None) -> str | None:
    # Check config files first (most specific signal).
    for pattern, framework in _FRAMEWORK_CONFIG_MAP.items():
        if pattern == "angular.json":
            if (root / pattern).is_file():
                return framework
        else:
            # Matches next.config.js, next.config.mjs, next.config.ts, etc.
            if list(root.glob(f"{pattern}.*")):
                return framework

    # Fall back to package.json dependencies.
    if pkg is None:
        return None
    all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    for dep, framework in _FRAMEWORK_DEPS.items():
        if dep in all_deps:
            return framework
    return None


def _detect_package_manager(root: Path) -> str | None:
    for filename, manager in _LOCK_FILE_MAP.items():
        if (root / filename).is_file():
            return manager
    return None


def _detect_dev_command(pkg: dict | None) -> str | None:
    if pkg is None:
        return None
    scripts = pkg.get("scripts", {})
    for key in ("dev", "start", "serve"):
        if key in scripts:
            return scripts[key]
    return None


def _detect_port(dev_command: str | None) -> int:
    if dev_command is None:
        return 3000
    parts = dev_command.split()
    for i, part in enumerate(parts):
        if part == "--port" and i + 1 < len(parts):
            try:
                return int(parts[i + 1])
            except ValueError:
                pass
        if part.startswith("--port="):
            try:
                return int(part.split("=", 1)[1])
            except ValueError:
                pass
    return 3000


def _detect_styling(root: Path, pkg: dict | None) -> str | None:
    # Tailwind
    if list(root.glob("tailwind.config.*")):
        return "tailwind"

    all_deps = {}
    if pkg:
        all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

    if "tailwindcss" in all_deps:
        return "tailwind"
    if "styled-components" in all_deps:
        return "styled-components"

    # CSS modules
    if list(root.glob("**/*.module.css"))[:1]:
        return "css-modules"

    # SCSS
    if list(root.glob("**/*.scss"))[:1]:
        return "scss"

    # Plain CSS (check src/ to avoid matching only config/vendor CSS)
    if list(root.glob("src/**/*.css"))[:1] or list(root.glob("**/*.css"))[:1]:
        return "css"

    return None


def detect(path: str) -> dict:
    """Detect project properties from a filesystem path.

    Returns a dict with keys: framework, dev_command, dev_port,
    package_manager, styling_approach. Values are None when
    detection fails for a given property.
    """
    root = Path(path)
    if not root.is_dir():
        return {
            "framework": None,
            "dev_command": None,
            "dev_port": 3000,
            "package_manager": None,
            "styling_approach": None,
        }

    pkg = _read_package_json(root)
    dev_command = _detect_dev_command(pkg)
    framework = _detect_framework(root, pkg)

    # A folder with no runnable dev script but an index.html is a plain static
    # site. VEX serves it with a built-in static server, so leave dev_command
    # null and just label the framework for display.
    if framework is None and dev_command is None and (root / "index.html").is_file():
        framework = "static"

    return {
        "framework": framework,
        "dev_command": dev_command,
        "dev_port": _detect_port(dev_command),
        "package_manager": _detect_package_manager(root),
        "styling_approach": _detect_styling(root, pkg),
    }
