"""Local dev server with caching off, so edits show on reload.

    python tools/serve.py          # http://localhost:8765
    python tools/serve.py 9000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".json": "application/json"}

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("localhost", port), partial(NoCacheHandler, directory=str(ROOT)))
    print(f"Serving {ROOT} at http://localhost:{port}  (tests: /tests/index.html)")
    server.serve_forever()


if __name__ == "__main__":
    main()
