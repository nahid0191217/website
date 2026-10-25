"""Dev server with clean (extensionless) URLs.

Serves this folder so pages open as /checkout and /admin
instead of /checkout.html and /admin.html — matching how
Vercel/Netlify serve the site in production (see vercel.json).

Usage:  python3 server.py        (http://localhost:8080)
"""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, urlunparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8080


class CleanURLHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _apply_clean_url(self):
        parsed = urlparse(self.path)
        path = parsed.path
        # Only rewrite extensionless paths like /checkout or /admin
        # when a matching .html file exists (assets keep extensions).
        if not os.path.splitext(path)[1]:
            candidate = os.path.join(ROOT, path.strip("/") + ".html")
            if os.path.isfile(candidate):
                self.path = urlunparse(parsed._replace(path=path + ".html"))

    def do_GET(self):
        self._apply_clean_url()
        super().do_GET()

    def do_HEAD(self):
        self._apply_clean_url()
        super().do_HEAD()


if __name__ == "__main__":
    print(f"Serving {ROOT} at http://localhost:{PORT} (clean URLs on)")
    ThreadingHTTPServer(("0.0.0.0", PORT), CleanURLHandler).serve_forever()
