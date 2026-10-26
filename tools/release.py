"""Prepares a release: rewrites the service worker's file list and bumps the version.

Run after changing any app file, before pushing:
    python tools/release.py            # bump patch: 1.0.0 -> 1.0.1
    python tools/release.py 1.2.0      # set an exact version

Without this, installed phones keep serving the old cached files.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / "sw.js"
VERSION_JS = ROOT / "js" / "version.js"
SHELL_DIRS = ["css", "icons", "js"]
SHELL_FILES = ["./", "index.html", "manifest.json"]


def shell_files() -> list[str]:
    files = []
    for folder in SHELL_DIRS:
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and path.suffix in {".js", ".css", ".png", ".svg", ".json"}:
                files.append(path.relative_to(ROOT).as_posix())
    return SHELL_FILES + files


def next_version(current: str, requested: str | None) -> str:
    if requested:
        if not re.fullmatch(r"\d+\.\d+\.\d+", requested):
            sys.exit(f"Version must look like 1.2.3, got {requested!r}")
        return requested
    major, minor, patch = (int(x) for x in current.split("."))
    return f"{major}.{minor}.{patch + 1}"


def main() -> None:
    sw = SW.read_text(encoding="utf-8")
    match = re.search(r"const CACHE_VERSION = '([\d.]+)';", sw)
    if not match:
        sys.exit("CACHE_VERSION not found in sw.js")
    version = next_version(match.group(1), sys.argv[1] if len(sys.argv) > 1 else None)

    listing = ",\n".join(f"  '{f}'" for f in shell_files())
    sw = re.sub(r"const SHELL = \[.*?\];", f"const SHELL = [\n{listing},\n];", sw, flags=re.S)
    sw = sw.replace(match.group(0), f"const CACHE_VERSION = '{version}';")
    SW.write_text(sw, encoding="utf-8")

    VERSION_JS.write_text(
        "// Kept in step with CACHE_VERSION in sw.js by tools/release.py.\n"
        f"export const APP_VERSION = '{version}';\n",
        encoding="utf-8",
    )
    print(f"Version {version}, {len(shell_files())} files in the offline cache.")


if __name__ == "__main__":
    main()
