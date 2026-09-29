"""No-dependency local launcher for the browser demo."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
print('Wellbore Sentry demo listening on http://127.0.0.1:8765',flush=True)
ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
