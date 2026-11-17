#!/usr/bin/env python3
"""Local preview with Vercel-style clean URLs: python3 _tools/serve.py [port]"""
import http.server, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and os.path.exists(p + ".html"): return p + ".html"
        return p
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8483
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
